import { readFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";

import { buildProcedureState } from "@chemd/step-ontology";
import type { CanonicalStepNode, ProcedureStateResult, StepFamily } from "@chemd/step-ontology";

import type {
  ImportDiagnostic,
  MaterialMention,
  ProcedureActionProvider,
  ProcedureActionProviderResult,
  ProseSourceSpan,
  StepFrame,
  UnparsedProseSpan
} from "./types";

interface RxnFrameResult {
  steps: StepFrame[];
  materials: MaterialMention[];
  procedureState: ProcedureStateResult;
  unparsedSpans: UnparsedProseSpan[];
  diagnostics: ImportDiagnostic[];
}

interface MaterialCandidate {
  name: string;
  normalizedName: string;
  category: MaterialMention["category"];
  role: string;
  confidence: number;
  span: ProseSourceSpan;
  evidence: string[];
}

const RXN_PARAGRAPH_ACTIONS_URL = "https://rxn.app.accelerate.science/rxn/api/api/v1/paragraph-actions";

const ALIASES = new Map<string, { normalizedName: string; category: MaterialMention["category"] }>([
  ["methanol", { normalizedName: "methanol", category: "solvent" }],
  ["thf", { normalizedName: "tetrahydrofuran", category: "solvent" }],
  ["anhydrous thf", { normalizedName: "tetrahydrofuran", category: "solvent" }],
  ["hexanes", { normalizedName: "hexanes", category: "solvent" }],
  ["n-buli", { normalizedName: "n-butyllithium", category: "reagent" }],
  ["sodium borohydride", { normalizedName: "sodium borohydride", category: "reagent" }],
  ["acetic anhydride", { normalizedName: "acetic anhydride", category: "reagent" }],
  ["aqueous nahco3", { normalizedName: "sodium bicarbonate solution", category: "solution" }],
  ["saturated nh4cl", { normalizedName: "saturated ammonium chloride solution", category: "solution" }],
  ["et2o", { normalizedName: "diethyl ether", category: "solvent" }],
  ["etoac", { normalizedName: "ethyl acetate", category: "solvent" }],
  ["brine", { normalizedName: "saturated sodium chloride solution", category: "solution" }],
  ["saturated brine solution", { normalizedName: "saturated sodium chloride solution", category: "solution" }],
  ["anhydrous mgso4", { normalizedName: "magnesium sulfate", category: "drying_agent" }],
  ["anhydrous na2so4", { normalizedName: "sodium sulfate", category: "drying_agent" }],
  ["formaldehyde", { normalizedName: "formaldehyde", category: "reagent" }],
  ["hbr", { normalizedName: "hydrobromic acid", category: "acid" }],
  ["tin powder", { normalizedName: "tin", category: "reagent" }],
  ["magnesium", { normalizedName: "magnesium", category: "reagent" }],
  ["iodine", { normalizedName: "iodine", category: "reagent" }],
  ["silica gel", { normalizedName: "silica gel", category: "workup" }]
]);

const FORMULA_PATTERN = /^(?:[A-Z][a-z]?\d*){2,}$|^(?:HBr|N2|MgSO4|Na2SO4|NaHCO3|NH4Cl|K2CO3|Et2O|EtOAc)$/;
const QUANTITY_PAREN_PATTERN = /\s*\([^)]*(?:\d+(?:\.\d+)?\s*(?:mg|g|mmol|mol|mL|L|M|equiv|eq|mol%|%)|drops?|aq\.?)[^)]*\)/gi;

const sanitize = (value: string): string =>
  value.replace(/[\u200b-\u200d\ufeff\ufffc]/g, "").replace(/\s+/g, " ").trim();

const spanFromMatch = (sourceText: string, value: string): ProseSourceSpan | undefined => {
  const index = sourceText.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0) return undefined;
  return { start: index, end: index + value.length, text: sourceText.slice(index, index + value.length) };
};

const alignMaterialSpan = (
  sourceText: string,
  raw: string,
  name: string
): { span: ProseSourceSpan; exact: boolean } => {
  const exact = spanFromMatch(sourceText, raw);
  if (exact) return { span: exact, exact: true };
  const nameOnly = spanFromMatch(sourceText, name);
  if (nameOnly) return { span: nameOnly, exact: false };
  return { span: { start: 0, end: sourceText.length, text: sourceText }, exact: false };
};

const splitOutside = (value: string, separators: readonly string[]): string[] => {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    const separator = depth === 0
      ? separators.find((item) => value.slice(index).toLowerCase().startsWith(item.toLowerCase()))
      : undefined;
    if (separator && !(separator === "," && /\d/.test(value[index - 1] ?? "") && /\d/.test(value[index + 1] ?? ""))) {
      if (current.trim()) items.push(current.trim().replace(/^[,;\s]+|[,;\s]+$/g, ""));
      current = "";
      index += separator.length - 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(current.trim().replace(/^[,;\s]+|[,;\s]+$/g, ""));
  return items;
};

const removeActionModifiers = (value: string): string =>
  sanitize(value)
    .replace(/\s+(?:dropwise|slowly)\b.*$/i, "")
    .replace(/\s+at\s+(?:-?\d|room temperature|ambient temperature).*$/i, "")
    .replace(/\s+under\s+(?:N2|nitrogen|argon|Ar)\b.*$/i, "")
    .replace(/\s+(?:\d+\s*x|x\s*\d+)$/i, "")
    .trim();

const materialNameFromRaw = (raw: string): string =>
  sanitize(raw)
    .replace(/^(?:a|an|the|with|over|in|to)\s+/i, "")
    .replace(QUANTITY_PAREN_PATTERN, "")
    .trim()
    .replace(/^[,;\s]+|[,;\s]+$/g, "");

const candidateFromRaw = (sourceText: string, rawValue: string, role: string): MaterialCandidate | undefined => {
  const raw = removeActionModifiers(rawValue);
  const name = materialNameFromRaw(raw);
  if (!name) return undefined;
  const lowerName = name.toLowerCase();
  const alias = ALIASES.get(lowerName);
  const alignment = alignMaterialSpan(sourceText, raw, name);
  const span = alignment.span;
  const evidence = ["rxn_action", `role:${role}`];
  let confidence = alias ? 0.92 : 0.55;
  if (FORMULA_PATTERN.test(name)) confidence += 0.08;
  if (role === "quench_agent" || role.endsWith("_solvent") || role === "drying_agent") confidence += 0.08;
  if (span.text === sourceText) {
    confidence -= 0.3;
    evidence.push("no_original_span_match");
  } else {
    evidence.push("original_span_match");
  }
  if (!alignment.exact && span.text !== sourceText) {
    confidence -= 0.18;
    evidence.push("rxn_original_parameter_drift");
  }
  if (/^SLN$/i.test(name)) {
    confidence = 0;
    evidence.push("solution_placeholder");
  }
  return {
    name,
    normalizedName: alias?.normalizedName ?? name,
    category: alias?.category ?? (role.endsWith("_solvent") ? "solvent" : "unknown"),
    role,
    confidence: Math.max(0, Math.min(1, confidence)),
    span,
    evidence
  };
};

const extractActionCandidates = (sourceText: string, action: string): MaterialCandidate[] => {
  const cleaned = sanitize(action);
  const head = cleaned.split(/\s+/, 1)[0];
  if (head === "MAKESOLUTION") {
    const body = cleaned.replace(/^MAKESOLUTION\s+with\s+/i, "");
    return splitOutside(body, [" followed by ", " and "])
      .map((part) => candidateFromRaw(sourceText, part, "solution_component"))
      .filter((item): item is MaterialCandidate => Boolean(item));
  }
  if (head === "ADD") {
    const body = removeActionModifiers(cleaned.replace(/^ADD\s+/i, ""));
    return splitOutside(body, [" followed by ", " and ", ","])
      .map((part) => candidateFromRaw(sourceText, part, "added_material"))
      .filter((item): item is MaterialCandidate => Boolean(item));
  }
  const roleByHead: Record<string, string> = {
    QUENCH: "quench_agent",
    EXTRACT: "extraction_solvent",
    WASH: "wash_solvent",
    DRYSOLUTION: "drying_agent"
  };
  const role = roleByHead[head];
  if (!role) return [];
  const body = cleaned.replace(/^(?:QUENCH|EXTRACT|WASH)\s+with\s+/i, "").replace(/^DRYSOLUTION\s+over\s+/i, "");
  const candidate = candidateFromRaw(sourceText, body, role);
  return candidate ? [candidate] : [];
};

const createStep = (
  family: StepFamily,
  params: Record<string, unknown>,
  index: number,
  candidate: MaterialCandidate | undefined,
  action: string,
  confidence = 0.86
): StepFrame => ({
  id: `step:${index}`,
  family,
  params,
  span: candidate?.span ?? { start: 0, end: 0, text: "" },
  confidence,
  evidence: ["rxn_action", action]
});

const materialParams = (candidates: readonly MaterialCandidate[]): Record<string, unknown> => {
  const solvent = candidates.find((item) => item.category === "solvent" || item.role.endsWith("_solvent"));
  const materials = candidates
    .filter((item) => item !== solvent && !/^SLN$/i.test(item.name))
    .map((item) => item.name);
  return {
    ...(materials.length > 0 ? { materials: materials.join(" and ") } : {}),
    ...(solvent ? { solvent: solvent.name } : {})
  };
};

const normalizeDuration = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return sanitize(value)
    .replace(/\b(\d+(?:\.\d+)?)\s*hours?\b/i, "$1 h")
    .replace(/\b(\d+(?:\.\d+)?)\s*minutes?\b/i, "$1 min");
};

const numericTemperature = (value: string): string | undefined =>
  value.match(/-?\d+(?:\.\d+)?\s*°?\s*C\b/i)?.[0]?.replace("°", "");

const stirParams = (action: string): { family: StepFamily; params: Record<string, unknown> } => {
  const duration = normalizeDuration(action.match(/\bfor\s+(.+?)(?:\s+at\b|$)/i)?.[1]);
  const temperature = numericTemperature(action);
  if (!duration) return { family: "mix", params: { condition: action.replace(/^STIR\s+/i, "") } };
  return {
    family: "hold",
    params: {
      duration,
      ...(temperature ? { temperature } : {}),
      ...(!temperature && /\b(?:room|ambient)\s+temperature\b/i.test(action) ? { condition: "room temperature" } : {})
    }
  };
};

const purifyParams = (sourceText: string): Record<string, unknown> => ({
  technique: /flash\s+column\s+chromatography/i.test(sourceText) ? "flash column chromatography" : "chromatography",
  ...(/\bsilica\s+gel\b/i.test(sourceText) ? { medium: "silica gel" } : {}),
  ...(/\bflash\s+column\b/i.test(sourceText) ? { column: "flash" } : {})
});

const toCanonicalSteps = (steps: readonly StepFrame[]): CanonicalStepNode[] =>
  steps.map((step, index) => ({
    stepId: `rxn:s${index + 1}`,
    family: step.family,
    params: step.params,
    source: {
      sourceNodeType: "procedure",
      sourceNodeId: "import-prose",
      sourceType: "lowered_step",
      rawText: step.span.text || step.evidence[1] || step.family
    },
    provenance: {
      origin: "lowered",
      sourceNodeType: "procedure",
      sourceNodeId: "import-prose",
      sourceField: "body",
      ruleId: "importer_prose.rxn_action",
      confidence: step.confidence
    },
    loweringConfidence: step.confidence
  }));

export const extractRxnProseFrames = (
  sourceText: string,
  actionResult: ProcedureActionProviderResult
): RxnFrameResult => {
  const steps: StepFrame[] = [];
  const materials: MaterialMention[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  let pendingSolution: MaterialCandidate[] = [];
  let pendingSolutionWasInitialCharge = false;
  let emittedInitialCharge = false;

  actionResult.actions.forEach((action, actionIndex) => {
    const candidates = extractActionCandidates(sourceText, action);
    candidates.forEach((candidate) => {
      if (!/^SLN$/i.test(candidate.name)) {
        materials.push({
          id: `rxn-material:${materials.length + 1}`,
          name: candidate.name,
          normalizedName: candidate.normalizedName,
          confidence: candidate.confidence,
          category: candidate.category,
          source: "rxn-action",
          span: candidate.span,
          evidence: candidate.evidence
        });
      }
    });

    if (/^MAKESOLUTION\b/i.test(action)) {
      pendingSolution = candidates;
      pendingSolutionWasInitialCharge = !emittedInitialCharge;
      if (!emittedInitialCharge) {
        steps.push(createStep("charge", materialParams(candidates), steps.length + 1, candidates[0], action, 0.9));
        emittedInitialCharge = true;
      }
      return;
    }

    if (/^ADD\s+SLN\b/i.test(action)) {
      if (pendingSolution.length > 0 && !pendingSolutionWasInitialCharge) {
        steps.push(createStep("add", materialParams(pendingSolution), steps.length + 1, pendingSolution[0], action, 0.86));
      }
      return;
    }

    if (/^ADD\b/i.test(action) && candidates.length > 0) {
      steps.push(createStep("add", materialParams(candidates), steps.length + 1, candidates[0], action, 0.86));
      return;
    }
    if (/^QUENCH\b/i.test(action) && candidates[0]) {
      steps.push(createStep("quench", { agent: candidates[0].name }, steps.length + 1, candidates[0], action, 0.9));
      return;
    }
    if (/^EXTRACT\b/i.test(action) && candidates[0]) {
      steps.push(createStep("extract", { solvent: candidates[0].name }, steps.length + 1, candidates[0], action, 0.88));
      return;
    }
    if (/^WASH\b/i.test(action) && candidates[0]) {
      steps.push(createStep("wash", { solvent: candidates[0].name }, steps.length + 1, candidates[0], action, 0.88));
      return;
    }
    if (/^DRYSOLUTION\b/i.test(action) && candidates[0]) {
      steps.push(createStep("dry", { agent: candidates[0].name }, steps.length + 1, candidates[0], action, 0.88));
      return;
    }
    if (/^STIR\b/i.test(action)) {
      const lowered = stirParams(action);
      steps.push(createStep(lowered.family, lowered.params, steps.length + 1, undefined, action, 0.84));
      return;
    }
    if (/^SETTEMPERATURE\b/i.test(action)) {
      const temperature = numericTemperature(action);
      steps.push(createStep("cool", temperature ? { target_temperature: temperature } : { method: "room_temperature" }, steps.length + 1, undefined, action, 0.82));
      return;
    }
    if (/^CONCENTRATE\b/i.test(action)) {
      steps.push(createStep("concentrate", { method: "concentrate" }, steps.length + 1, undefined, action, 0.84));
      return;
    }
    if (/^PURIFY\b/i.test(action)) {
      steps.push(createStep("purify", purifyParams(sourceText), steps.length + 1, candidateFromRaw(sourceText, "silica gel", "purification_medium"), action, 0.84));
      return;
    }

    diagnostics.push({
      code: "W_IMPORT_RXN_ACTION_UNMAPPED",
      severity: "warning",
      message: "RXN action was not mapped to a Chemd step.",
      facts: { action, action_index: actionIndex }
    });
  });

  const canonicalSteps = toCanonicalSteps(steps);
  return {
    steps,
    materials,
    procedureState: buildProcedureState(canonicalSteps),
    unparsedSpans: [],
    diagnostics: [
      {
        code: "I_IMPORT_PROCEDURE_ACTION_PROVIDER",
        severity: "info",
        message: "Procedure actions were extracted with an external provider.",
        facts: { provider: actionResult.provider, action_count: actionResult.actions.length }
      },
      ...diagnostics,
      ...(actionResult.diagnostics ?? [])
    ]
  };
};

const readDotEnvApiKey = (cwd: string): string | undefined => {
  try {
    const content = readFileSync(path.resolve(cwd, ".env"), "utf8");
    return content.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.match(/^RXN_API_KEY\s*=\s*(.+)$/)?.[1]?.trim().replace(/^["']|["']$/g, ""))
      .find((value): value is string => Boolean(value));
  } catch {
    return undefined;
  }
};

export const createNodeRxnProcedureActionProvider = (
  options: { apiKey?: string; cwd?: string; endpoint?: string } = {}
): ProcedureActionProvider | undefined => {
  const apiKey = options.apiKey ?? process.env.RXN_API_KEY ?? readDotEnvApiKey(options.cwd ?? process.cwd());
  if (!apiKey) return undefined;
  const endpoint = options.endpoint ?? RXN_PARAGRAPH_ACTIONS_URL;
  return {
    name: "rxn-paragraph-actions",
    async extractActions(sourceText) {
      const json = await postJson(endpoint, apiKey, { paragraph: sourceText });
      const actions = json.actions ?? [...String(json.payload?.actionSequence ?? "").matchAll(/<li>(.*?)<\/li>/g)]
        .map((match) => match[1])
        .filter(Boolean);
      return { provider: "rxn-paragraph-actions", actions };
    }
  };
};

const postJson = (
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<{ payload?: { actionSequence?: string }; actions?: string[] }> =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(endpoint);
    const request = https.request({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: apiKey
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          reject(new Error(`RXN paragraph actions request failed with HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });

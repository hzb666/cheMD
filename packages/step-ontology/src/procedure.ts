import { createV03Diagnostic } from "@chemd/diagnostics";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { ProvenanceInfo } from "@chemd/core";

import type {
  CanonicalStepNode,
  ProcedureLoweringInput,
  ProcedureLoweringResult,
  StepEffect,
  StepFamily,
  StepSourceInfo
} from "./types";
import {
  cleanExtractedText,
  detectStructureHint,
  extractDuration,
  extractRepeatCount,
  extractTemperature,
  splitProcedureSentences
} from "./text";
import { getEffectsForStep } from "./step-schemas";
import {
  ADD_MATERIAL_MARKERS,
  ADD_STOP_MARKERS,
  ADDITION_PATTERNS,
  ANALYSIS_PATTERNS,
  CHARGE_BEFORE_MARKERS,
  CHARGE_MATERIAL_MARKERS,
  CHARGE_STOP_MARKERS,
  CONCENTRATE_PATTERNS,
  COOL_PATTERNS,
  DRY_PATTERNS,
  EXTRACT_PATTERNS,
  FILTER_PATTERNS,
  HAZARDOUS_REAGENT_PATTERNS,
  HEAT_PATTERNS,
  HOLD_PATTERNS,
  INITIAL_CHARGE_PATTERNS,
  NITROGEN_CONTEXT_PATTERNS,
  PURGE_PATTERNS,
  PURIFY_PATTERNS,
  QUENCH_PATTERNS,
  SAMPLE_PATTERNS,
  SEPARATE_LAYERS_PATTERNS,
  SLOW_ADDITION_PATTERNS,
  SOLVENT_MARKERS,
  WASH_PATTERNS
} from "./procedure-import-patterns";

interface SentenceContext {
  procedureId?: string;
  sentence: string;
  sentenceIndex: number;
  nextStepId: () => string;
}

const createStep = (
  context: SentenceContext,
  family: StepFamily,
  params: Record<string, unknown>,
  confidence: number,
  effects: StepEffect[] = []
): CanonicalStepNode => {
  const provenance = createProcedureProvenance(context, family, confidence);
  const stepEffects = [...new Set([...getEffectsForStep({ family, params }), ...effects])];

  return {
    stepId: context.nextStepId(),
    family,
    params,
    effects: stepEffects,
    source: createProcedureSource(context, provenance),
    provenance,
    loweringConfidence: confidence
  };
};

const createProcedureProvenance = (
  context: SentenceContext,
  family: StepFamily,
  confidence: number
): ProvenanceInfo => ({
  origin: "lowered",
  sourceNodeType: "procedure",
  sourceNodeId: context.procedureId,
  sourceField: "body",
  ruleId: `step_ontology.procedure.${family}`,
  confidence
});

const createProcedureSource = (
  context: SentenceContext,
  provenance: ProvenanceInfo
): StepSourceInfo => ({
  sourceNodeType: "procedure",
  sourceNodeId: context.procedureId,
  sourceType: "lowered_step",
  sentenceIndex: context.sentenceIndex,
  rawText: context.sentence,
  provenance
});

const hasAny = (text: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text));

const textAfterAny = (sentence: string, markers: readonly string[]): string | undefined => {
  const lower = sentence.toLowerCase();
  const marker = markers
    .map((candidate) => ({ marker: candidate, index: lower.indexOf(candidate.toLowerCase()) }))
    .filter((candidate) => candidate.index >= 0)
    .sort((left, right) => left.index - right.index)[0];
  return marker ? sentence.slice(marker.index + marker.marker.length) : undefined;
};

const textBeforeAny = (sentence: string, markers: readonly string[]): string | undefined => {
  const lower = sentence.toLowerCase();
  const index = markers
    .map((candidate) => lower.indexOf(candidate.toLowerCase()))
    .filter((candidate) => candidate >= 0)
    .sort((left, right) => left - right)[0];
  return index === undefined ? undefined : sentence.slice(0, index);
};

const stopAtAny = (text: string, markers: readonly string[]): string => {
  const lower = text.toLowerCase();
  const index = markers
    .map((candidate) => lower.indexOf(candidate.toLowerCase()))
    .filter((candidate) => candidate >= 0)
    .sort((left, right) => left - right)[0];
  return index === undefined ? text : text.slice(0, index);
};

const stopAtAnyPhrase = (text: string, markers: readonly string[]): string => {
  const lower = text.toLowerCase();
  const index = markers
    .map((candidate) => lower.indexOf(candidate.toLowerCase()))
    .filter((candidate) => candidate >= 0)
    .sort((left, right) => left - right)[0];
  return index === undefined ? text : text.slice(0, index);
};

const readTokenAfterAny = (sentence: string, markers: readonly string[]): string | undefined => {
  const after = textAfterAny(sentence, markers)?.trimStart();
  if (!after) return undefined;
  let end = 0;
  while (end < after.length && isSolventTokenChar(after[end])) {
    end += 1;
  }
  return end > 0 ? cleanExtractedText(after.slice(0, end)) : undefined;
};

const isSolventTokenChar = (char: string): boolean =>
  (char >= "A" && char <= "Z")
  || (char >= "a" && char <= "z")
  || (char >= "0" && char <= "9")
  || ["（", "）", "(", ")", "/", "_", "-"].includes(char);

const isInitialChineseChargeAddition = (sentence: string): boolean => {
  const chargeIndex = sentence.indexOf("将");
  const addIndex = sentence.indexOf("加入");
  return chargeIndex >= 0 && addIndex > chargeIndex;
};

const getAddMaterial = (sentence: string): string | undefined =>
  cleanMaterialText(stopAtAny(textAfterAddMarker(sentence) ?? "", ADD_STOP_MARKERS));

const textAfterAddMarker = (sentence: string): string | undefined => {
  if (/\baddition\s+of\b/i.test(sentence)) {
    return undefined;
  }
  return textAfterAny(sentence, ADD_MATERIAL_MARKERS);
};

const cleanMaterialText = (value: string | undefined): string | undefined => {
  const cleaned = cleanExtractedText(
    stopAtAnyPhrase(value ?? "", [
      " and the ",
      " before ",
      " to quench",
      " then ",
      " dropwise"
    ])
  );
  if (/^(?:dropwise|slowly|to\s+quench|and\s+the|the\s+reaction|the\s+resulting)\b/i.test(cleaned)) {
    return undefined;
  }
  if (/^(?:at\s+-?\d+(?:\.\d+)?|under\s+|in\s+a\s+sealed)\b/i.test(cleaned)) {
    return undefined;
  }
  return cleaned || undefined;
};

const getPassiveAddedAfterMaterial = (sentence: string): string | undefined => {
  const match = sentence.match(/\bwas\s+(?:then\s+)?added\s+(.+?)(?:$|\s+dropwise\b|\s+and\b|\s+before\b|\s+to\b)/i);
  return cleanMaterialText(match?.[1]);
};

const getPassiveAddedBeforeMaterial = (sentence: string): string | undefined => {
  const match = sentence.match(/^(.+?)\s+was\s+(?:then\s+)?added\b/i);
  const candidate = cleanMaterialText(match?.[1]);
  if (!candidate) return undefined;
  if (/^(to\s+(?:a\s+solution|this)|the\s+reaction|the\s+resulting\s+solution)\b/i.test(candidate)) {
    return undefined;
  }
  return candidate;
};

const getAdditionOfMaterial = (sentence: string): string | undefined => {
  const match = sentence.match(/\baddition\s+of\s+(.+?)(?:$|\s+in\b|\s+and\b|\s+before\b)/i);
  return cleanMaterialText(match?.[1]);
};

const getQuenchAgent = (sentence: string): string | undefined => {
  const match = sentence.match(/\bquench(?:ed)?\s+with\s+(.+?)(?:$|,|\band\b|\bthen\b)/i);
  return cleanMaterialText(match?.[1]);
};

const uniqueValues = (values: readonly (string | undefined)[]): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

const getAddMaterials = (sentence: string): string[] =>
  getPassiveAddedAfterMaterial(sentence) && !getPassiveAddedBeforeMaterial(sentence)
    ? uniqueValues([
        getPassiveAddedAfterMaterial(sentence),
        getAdditionOfMaterial(sentence)
      ])
    : uniqueValues([
        getPassiveAddedBeforeMaterial(sentence),
        getAdditionOfMaterial(sentence),
        cleanMaterialText(getAddMaterial(sentence))
      ]);

const getChargeMaterial = (sentence: string): string | undefined => {
  const solutionMatch = sentence.match(/\bto a solution of\s+(.+?)(?:\s+in\s+|\s+was\s+added\b)/i);
  if (solutionMatch?.[1]) {
    return cleanExtractedText(solutionMatch[1]) || undefined;
  }

  return cleanExtractedText(
    stopAtAny(
      textAfterAny(sentence, CHARGE_MATERIAL_MARKERS) ?? textBeforeAny(sentence, CHARGE_BEFORE_MARKERS) ?? "",
      CHARGE_STOP_MARKERS
    )
  ) || undefined;
};

const getDissolvedChargeMaterial = (sentence: string): string | undefined => {
  const match = sentence.match(/^(?:the\s+)?(.+?)\s+(?:was|were|is|are)\s+dissolved\s+in\b/i);
  return cleanMaterialText(match?.[1]);
};

const isDissolvedCharge = (sentence: string): boolean =>
  /\b(?:was|were|is|are)\s+dissolved\s+in\b/i.test(sentence);

const getSolvent = (sentence: string): string | undefined =>
  readTokenAfterAny(sentence, SOLVENT_MARKERS);

const getExtractionSolvent = (sentence: string): string | undefined => {
  const match = sentence.match(/\bextracted\s+with\s+([A-Za-z][A-Za-z0-9/-]*)/i);
  return cleanExtractedText(match?.[1] ?? "") || undefined;
};

const getWashSolvent = (sentence: string): string | undefined => {
  const match = sentence.match(/\bwashed\s+with\s+(.+?)(?:$|,|\band\b|\bthen\b)/i);
  return cleanMaterialText(match?.[1]);
};

const getDryingAgent = (sentence: string): string | undefined => {
  const match = sentence.match(/\bdried\s*(?:\(([^)]+)\)|(?:over|with)\s+(.+?)(?:$|,|\band\b|\bthen\b))/i);
  return cleanMaterialText(match?.[1] ?? match?.[2] ?? textBeforeAny(sentence, ["干燥"])) || undefined;
};

const getFilterMedium = (sentence: string): string | undefined => {
  const match = sentence.match(/\bfiltered\s+(?:through|over|via)\s+(.+?)(?:$|,|\band\b)/i);
  return cleanExtractedText(match?.[1] ?? "") || undefined;
};

const getPurificationTechnique = (sentence: string): string => {
  if (/\bprep(?:arative)?\s+TLC\b/i.test(sentence)) return "prep TLC";
  if (/\bsilica\s+plug\b/i.test(sentence)) return "silica plug";
  if (/\btriturat(?:ed|ion)\b/i.test(sentence)) return "trituration";
  if (/\brecrystalliz(?:ed|ation)\b/i.test(sentence)) return "recrystallization";
  if (/flash\s+column\s+chromatography/i.test(sentence)) return "flash column chromatography";
  return "chromatography";
};

const getPurificationMedium = (sentence: string): string | undefined => {
  if (/\bon\s+silica\s+gel\b/i.test(sentence) || /\bsilica\s+plug\b/i.test(sentence)) {
    return "silica gel";
  }
  return undefined;
};

const getPurificationEluent = (sentence: string): string | undefined => {
  const match = sentence.match(/\beluent[:\s]+(.+?)(?:\.?$|,|\band\b)/i)
    ?? sentence.match(/\b(?:using|with)\s+(.+?\d+\s*:\s*\d+)(?:\.?$|,|\band\b)/i)
    ?? sentence.match(/\bgradient\s+(.+?)(?:\.?$|,|\band\b)/i);
  return cleanExtractedText(match?.[1] ?? "") || undefined;
};

const getPurificationColumn = (sentence: string): string | undefined => {
  if (/\bflash\s+column\b/i.test(sentence)) return "flash";
  if (/\bcolumn\s+chromatography\b/i.test(sentence)) return "column";
  return undefined;
};

const getPurificationParams = (sentence: string): Record<string, unknown> => ({
  technique: getPurificationTechnique(sentence),
  ...(getPurificationMedium(sentence) ? { medium: getPurificationMedium(sentence) } : {}),
  ...(getPurificationEluent(sentence) ? { eluent: getPurificationEluent(sentence) } : {}),
  ...(getPurificationColumn(sentence) ? { column: getPurificationColumn(sentence) } : {})
});

const normalizeAtmosphere = (value: string | undefined): string | undefined => {
  const lower = value?.toLowerCase().replace(/\s+/g, "");
  if (!lower) return undefined;
  if (lower === "n2" || lower === "nitrogen") return "nitrogen";
  if (lower === "ar" || lower === "argon") return "argon";
  if (lower === "o2" || lower === "oxygen") return "oxygen";
  if (lower === "air") return "air";
  return undefined;
};

const getAtmosphere = (sentence: string): string | undefined => {
  const match = sentence.match(/\b(?:under|with)\s+(nitrogen|argon|oxygen|air|n2|ar|o2)\b/i)
    ?? sentence.match(/\b(nitrogen|argon|oxygen|air|n2|ar|o2)\s+(?:atmosphere|balloon)\b/i);
  return normalizeAtmosphere(match?.[1]);
};

const getVesselCondition = (sentence: string): string | undefined =>
  /\bsealed\s+(?:tube|flask|vessel)\b/i.test(sentence) ? "sealed" : undefined;

const isReflux = (sentence: string): boolean => /\breflux(?:ed)?\b/i.test(sentence);

const getConcentrateMethod = (sentence: string): string =>
  /\b(?:under\s+reduced\s+pressure|reduced\s+pressure|in\s+vacuo)\b/i.test(sentence)
    ? "reduced_pressure"
    : "concentrate";

const getTemperatureAfterAny = (sentence: string, markers: readonly string[]): string | undefined =>
  extractTemperature(textAfterAny(sentence, markers) ?? "") ?? extractTemperature(sentence);

const hasColdAtCondition = (sentence: string): boolean =>
  /\bat\s+-\d+(?:\.\d+)?\s*°?\s*C\b/i.test(sentence);

const lowerCharge = (context: SentenceContext): CanonicalStepNode[] => {
  const isInitialCharge = context.sentenceIndex === 0
    && hasAny(context.sentence, INITIAL_CHARGE_PATTERNS);
  const dissolvedCharge = isDissolvedCharge(context.sentence);

  if (!isInitialCharge && !dissolvedCharge) {
    return [];
  }

  const material = dissolvedCharge
    ? getDissolvedChargeMaterial(context.sentence)
    : getChargeMaterial(context.sentence);
  return [createStep(context, "charge", {
    ...(material ? { materials: material } : {}),
    ...(getSolvent(context.sentence) ? { solvent: getSolvent(context.sentence) } : {})
  }, 0.82)];
};

const lowerEnvironment = (context: SentenceContext): CanonicalStepNode[] => {
  if (hasAny(context.sentence, PURGE_PATTERNS)) {
    const atmosphere = getAtmosphere(context.sentence) ?? "nitrogen";
    return [createStep(context, "purge", {
      atmosphere,
      ...(/\bdegassed\b/i.test(context.sentence) ? { method: "degassed" } : {}),
      ...(extractDuration(context.sentence) ? { duration: extractDuration(context.sentence) } : {})
    }, 0.9, ["uses_inert_atmosphere"])];
  }

  return [];
};

const lowerTemperature = (context: SentenceContext): CanonicalStepNode[] => {
  const steps: CanonicalStepNode[] = [];
  const coldAtConditionIsAction = hasColdAtCondition(context.sentence)
    && !hasAny(context.sentence, HOLD_PATTERNS);

  if (hasAny(context.sentence, COOL_PATTERNS) || coldAtConditionIsAction) {
    const temperature = getTemperatureAfterAny(context.sentence, ["cooled", "cooling", "冷却", "at"]);
    steps.push(createStep(context, "cool", { target_temperature: temperature }, 0.9, ["changes_temperature"]));
  }

  if (hasAny(context.sentence, HEAT_PATTERNS)) {
    const temperature = getTemperatureAfterAny(context.sentence, ["warmed", "heated", "加热", "升温"]);
    steps.push(createStep(context, "heat", {
      ...(temperature ? { target_temperature: temperature } : {}),
      ...(extractDuration(context.sentence) ? { duration: extractDuration(context.sentence) } : {}),
      ...(isReflux(context.sentence) ? { method: "reflux" } : {}),
      ...(getAtmosphere(context.sentence) ? { atmosphere: getAtmosphere(context.sentence) } : {}),
      ...(getVesselCondition(context.sentence) ? { vessel: getVesselCondition(context.sentence) } : {})
    }, 0.88, ["changes_temperature"]));
  }

  return steps;
};

const lowerAddition = (context: SentenceContext): CanonicalStepNode[] => {
  const materials = getAddMaterials(context.sentence);

  if (hasAny(context.sentence, QUENCH_PATTERNS)) {
    const agent = getQuenchAgent(context.sentence) ?? materials[0];
    return agent
      ? [createStep(context, "quench", { agent }, 0.86)]
      : [];
  }

  if (!hasAny(context.sentence, ADDITION_PATTERNS)) {
    return [];
  }

  return materials.map((material) => createStep(context, "add", {
    materials: material,
    ...(extractTemperature(context.sentence) ? { temperature: extractTemperature(context.sentence) } : {}),
    ...(hasAny(context.sentence, SLOW_ADDITION_PATTERNS) ? { mode: "dropwise" } : {}),
    ...(hasAny(context.sentence, NITROGEN_CONTEXT_PATTERNS) ? { atmosphere: "nitrogen" } : {})
  }, 0.84, hasAny(context.sentence, HAZARDOUS_REAGENT_PATTERNS) ? ["consumes_hazardous_reagent"] : []));
};

const lowerProcess = (context: SentenceContext): CanonicalStepNode[] => {
  const duration = extractDuration(context.sentence);
  const isHold = hasAny(context.sentence, HOLD_PATTERNS);

  return isHold && duration
    ? [createStep(context, "hold", {
        duration,
        ...(extractTemperature(context.sentence) ? { temperature: extractTemperature(context.sentence) } : {}),
        ...(getAtmosphere(context.sentence) ? { atmosphere: getAtmosphere(context.sentence) } : {}),
        ...(getVesselCondition(context.sentence) ? { vessel: getVesselCondition(context.sentence) } : {})
      }, 0.86)]
    : [];
};

const lowerWorkup = (context: SentenceContext): CanonicalStepNode[] => {
  const steps: CanonicalStepNode[] = [];

  if (hasAny(context.sentence, EXTRACT_PATTERNS)) {
    const extractionSolvent = getExtractionSolvent(context.sentence)
      ?? textBeforeAny(context.sentence, ["萃取"]);
    steps.push(createStep(context, "extract", {
      ...(extractionSolvent ? { solvent: cleanExtractedText(extractionSolvent) } : {}),
      ...(extractRepeatCount(context.sentence) ? { repeats: extractRepeatCount(context.sentence) } : {})
    }, 0.84, ["creates_biphasic_system"]));
  }

  if (hasAny(context.sentence, DRY_PATTERNS)) {
    steps.push(createStep(context, "dry", {
      ...(getDryingAgent(context.sentence) ? { agent: getDryingAgent(context.sentence) } : {})
    }, 0.82));
  }

  if (hasAny(context.sentence, WASH_PATTERNS) && getWashSolvent(context.sentence)) {
    steps.push(createStep(context, "wash", {
      solvent: getWashSolvent(context.sentence),
      ...(extractRepeatCount(context.sentence) ? { repeats: extractRepeatCount(context.sentence) } : {})
    }, 0.82));
  }

  return [
    ...steps,
    ...lowerMechanicalWorkup(context)
  ];
};

const lowerMechanicalWorkup = (context: SentenceContext): CanonicalStepNode[] => {
  const steps: CanonicalStepNode[] = [];

  if (hasAny(context.sentence, CONCENTRATE_PATTERNS)) {
    steps.push(createStep(context, "concentrate", { method: getConcentrateMethod(context.sentence) }, 0.84));
  }

  if (hasAny(context.sentence, SEPARATE_LAYERS_PATTERNS)) {
    steps.push(createStep(context, "separate_layers", {}, 0.82, ["creates_biphasic_system"]));
  }

  if (hasAny(context.sentence, FILTER_PATTERNS) && getFilterMedium(context.sentence)) {
    steps.push(createStep(context, "filter", { medium: getFilterMedium(context.sentence) }, 0.82));
  }

  if (hasAny(context.sentence, PURIFY_PATTERNS)) {
    steps.push(createStep(context, "purify", getPurificationParams(context.sentence), 0.84));
  }

  return steps;
};

const lowerAnalysis = (context: SentenceContext): CanonicalStepNode[] => {
  const steps: CanonicalStepNode[] = [];

  if (hasAny(context.sentence, SAMPLE_PATTERNS)) {
    steps.push(createStep(context, "sample", {}, 0.88, ["requires_sampling"]));
  }

  if (hasAny(context.sentence, ANALYSIS_PATTERNS) && !isPreparativeTlc(context.sentence)) {
    steps.push(createStep(context, "analyze", { type: extractAnalysisType(context.sentence) }, 0.88));
  }

  return steps;
};

const extractAnalysisType = (sentence: string): string => {
  const match = sentence.match(/\b(TLC|HPLC|NMR)\b/i);
  return match?.[1]?.toLowerCase() ?? "unknown";
};

const isPreparativeTlc = (sentence: string): boolean =>
  /\bprep(?:arative)?\s+TLC\b/i.test(sentence);

const lowerSentence = (context: SentenceContext): CanonicalStepNode[] => [
  ...lowerCharge(context),
  ...lowerEnvironment(context),
  ...lowerTemperature(context),
  ...lowerAddition(context),
  ...lowerProcess(context),
  ...lowerAnalysis(context),
  ...lowerWorkup(context)
].filter((step) =>
  !(step.family === "add" && context.sentenceIndex === 0 && isInitialChineseChargeAddition(context.sentence))
);

const createAmbiguousStep = (context: SentenceContext): CanonicalStepNode =>
  createStep(context, "observe", { raw: cleanExtractedText(context.sentence) }, 0.35);

const createLowConfidenceDiagnostic = (procedureId: string | undefined, sentence: string): V03Diagnostic =>
  createV03Diagnostic({
    code: "W805",
    severity: "warning",
    message: "Procedure sentence was kept as low-confidence prose because no canonical step matched.",
    sourceLayer: "lowering",
    sourceNodeType: "procedure",
    sourceNodeId: procedureId,
    sourceField: "body",
    facts: { raw_sentence: sentence }
  });

const createProcedureLoweredDiagnostic = (procedureId: string | undefined): V03Diagnostic =>
  createV03Diagnostic({
    code: "W_PROCEDURE_PROSE_LOWERED",
    severity: "warning",
    message: "Procedure prose was lowered into canonical steps; prefer explicit step blocks.",
    sourceLayer: "lowering",
    sourceNodeType: "procedure",
    sourceNodeId: procedureId,
    sourceField: "body"
  });

const averageConfidence = (steps: CanonicalStepNode[]): number => {
  if (steps.length === 0) {
    return 0;
  }

  return steps.reduce((sum, step) => sum + step.loweringConfidence, 0) / steps.length;
};

export const lowerProcedureToSteps = (input: ProcedureLoweringInput): ProcedureLoweringResult => {
  const sentences = splitProcedureSentences(input.body);
  const diagnostics: V03Diagnostic[] = [];
  const steps: CanonicalStepNode[] = [];
  let stepCounter = 0;
  const nextStepId = () => `${input.procedureId ?? "procedure"}:s${++stepCounter}`;

  sentences.forEach((sentence, sentenceIndex) => {
    const context = { procedureId: input.procedureId, sentence, sentenceIndex, nextStepId };
    const lowered = lowerSentence(context);
    if (lowered.length === 0) {
      steps.push(createAmbiguousStep(context));
      diagnostics.push(createLowConfidenceDiagnostic(input.procedureId, sentence));
      return;
    }

    steps.push(...lowered);
  });

  if (sentences.length > 0) {
    diagnostics.unshift(createProcedureLoweredDiagnostic(input.procedureId));
  }

  return {
    procedureId: input.procedureId,
    structureHint: detectStructureHint(input.body),
    sourceType: "lowered_prose",
    steps,
    diagnostics,
    loweringConfidence: averageConfidence(steps)
  };
};

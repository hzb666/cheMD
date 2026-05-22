import type {
  ImportDiagnostic,
  MaterialMention,
  QuantityMention,
  ReactionCandidate,
  ReactionFactCandidate,
  ReactionFactRole,
  StepFrame
} from "./types";
import {
  createReactionLowConfidenceDiagnostics,
  createReactionWorkupDiagnostics,
  reactionCandidateConfidence,
  splitRenderableReactionFacts
} from "./reaction-candidate-diagnostics";

export interface BuildReactionCandidatesInput {
  sourceText: string;
  materials: readonly MaterialMention[];
  quantities: readonly QuantityMention[];
  steps: readonly StepFrame[];
}

export interface BuildReactionCandidatesResult {
  candidates: readonly ReactionCandidate[];
  diagnostics: readonly ImportDiagnostic[];
}

const HIGH_ROLE_CONFIDENCE = 0.95;
const DEFAULT_ROLE_CONFIDENCE = 0.9;

const REACTION_STAGE_FAMILIES = new Set(["charge", "add", "cool", "heat", "hold"]);
const WORKUP_FAMILIES = new Set([
  "extract",
  "wash",
  "dry",
  "filter",
  "concentrate",
  "purify",
  "quench"
]);

const isStringParam = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeText = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const includesText = (container: string, value: string): boolean =>
  container.toLowerCase().includes(value.toLowerCase());

const findMaterialConfidence = (
  raw: string,
  input: BuildReactionCandidatesInput
): number | undefined => {
  const material = input.materials.find((candidate) =>
    includesText(raw, candidate.name)
    || includesText(raw, candidate.normalizedName)
    || includesText(candidate.name, raw)
  );
  return material?.confidence;
};

const findQuantityConfidence = (
  raw: string,
  input: BuildReactionCandidatesInput
): number | undefined => {
  const quantity = input.quantities.find((candidate) =>
    includesText(raw, candidate.raw) || includesText(candidate.raw, raw)
  );
  return quantity?.confidence;
};

const factConfidence = (
  step: StepFrame,
  roleConfidence: number,
  evidenceConfidence?: number
): number =>
  Math.min(step.confidence, roleConfidence, evidenceConfidence ?? 1);

const createFact = (
  input: BuildReactionCandidatesInput,
  step: StepFrame,
  index: number,
  role: ReactionFactRole,
  raw: string,
  roleConfidence = DEFAULT_ROLE_CONFIDENCE,
  warnings: readonly string[] = []
): ReactionFactCandidate => {
  const confidenceEvidence = role === "temperature" || role === "time"
    ? findQuantityConfidence(raw, input)
    : findMaterialConfidence(raw, input);

  return {
    id: `fact:${index + 1}:${role}`,
    role,
    raw: normalizeText(raw),
    confidence: factConfidence(step, roleConfidence, confidenceEvidence),
    sourceSpan: step.span,
    evidence: [...step.evidence, `step:${step.family}`, `param:${role}`],
    warnings
  };
};

const createProductFact = (
  input: BuildReactionCandidatesInput,
  match: RegExpMatchArray,
  index: number
): ReactionFactCandidate | undefined => {
  if (match.index === undefined || !match[1]) return undefined;

  const raw = normalizeText(match[1]);
  const start = match.index;
  const end = start + match[0].length;
  return {
    id: `fact:${index + 1}:product`,
    role: "product",
    raw,
    confidence: 0.82,
    sourceSpan: {
      start,
      end,
      text: input.sourceText.slice(start, end)
    },
    evidence: ["explicit_yield_or_afford", match[0]],
    warnings: []
  };
};

const findExplicitProductFact = (
  input: BuildReactionCandidatesInput,
  index: number
): ReactionFactCandidate | undefined => {
  const match = input.sourceText.match(
    /\b(?:to\s+yield|yielded|afforded)\s+(.+?)(?:\.|$)/is
  );
  return match ? createProductFact(input, match, index) : undefined;
};

const workupParamFacts = (
  input: BuildReactionCandidatesInput,
  step: StepFrame,
  index: number
): ReactionFactCandidate[] => {
  const facts: ReactionFactCandidate[] = [];
  const rejectedFrom = `Excluded ${step.family} material from reaction fields.`;

  if (isStringParam(step.params.solvent)) {
    facts.push(createFact(input, step, index, "solvent", step.params.solvent, HIGH_ROLE_CONFIDENCE, [
      rejectedFrom
    ]));
  }

  for (const param of ["agent", "materials", "inputs", "medium"] as const) {
    if (isStringParam(step.params[param])) {
      facts.push(createFact(input, step, index + facts.length, "reagent", step.params[param], HIGH_ROLE_CONFIDENCE, [
        rejectedFrom
      ]));
    }
  }

  return facts;
};

const firstWorkupIndex = (steps: readonly StepFrame[]): number => {
  const index = steps.findIndex((step) => WORKUP_FAMILIES.has(step.family));
  return index < 0 ? steps.length : index;
};

const pickConditionFact = (
  facts: readonly ReactionFactCandidate[]
): ReactionFactCandidate | undefined =>
  [...facts].sort((left, right) =>
    right.confidence - left.confidence || left.sourceSpan.start - right.sourceSpan.start
  )[0];

const collectReactionFacts = (
  input: BuildReactionCandidatesInput
): { facts: ReactionFactCandidate[]; rejectedFacts: ReactionFactCandidate[] } => {
  const facts: ReactionFactCandidate[] = [];
  const rejectedFacts: ReactionFactCandidate[] = [];
  const workupStart = firstWorkupIndex(input.steps);
  const temperatures: ReactionFactCandidate[] = [];
  const times: ReactionFactCandidate[] = [];

  input.steps.forEach((step, index) => {
    if (WORKUP_FAMILIES.has(step.family)) {
      rejectedFacts.push(...workupParamFacts(input, step, index));
      return;
    }
    if (!REACTION_STAGE_FAMILIES.has(step.family) || index > workupStart) return;
    if (step.family === "charge") collectChargeFacts(input, step, index, facts);
    if (step.family === "add") collectAddFacts(input, step, index, facts);
    if ((step.family === "cool" || step.family === "heat") && isStringParam(step.params.target_temperature)) {
      temperatures.push(createFact(input, step, index, "temperature", step.params.target_temperature));
    }
    if (step.family === "hold" && isStringParam(step.params.duration)) {
      times.push(createFact(input, step, index, "time", step.params.duration));
    }
  });

  const temperature = pickConditionFact(temperatures);
  const time = pickConditionFact(times);
  const product = findExplicitProductFact(input, facts.length + rejectedFacts.length);
  if (temperature) facts.push(temperature);
  if (time) facts.push(time);
  if (product) facts.push(product);
  return { facts, rejectedFacts };
};

const collectChargeFacts = (
  input: BuildReactionCandidatesInput,
  step: StepFrame,
  index: number,
  facts: ReactionFactCandidate[]
): void => {
  if (isStringParam(step.params.materials)) {
    facts.push(createFact(input, step, index, "reactant", step.params.materials));
  }
  if (isStringParam(step.params.solvent)) {
    facts.push(createFact(input, step, index + facts.length, "solvent", step.params.solvent, HIGH_ROLE_CONFIDENCE));
  }
};

const collectAddFacts = (
  input: BuildReactionCandidatesInput,
  step: StepFrame,
  index: number,
  facts: ReactionFactCandidate[]
): void => {
  if (isStringParam(step.params.materials)) {
    facts.push(createFact(input, step, index + facts.length, "reagent", step.params.materials));
  }
};

const hasReactionSkeleton = (facts: readonly ReactionFactCandidate[]): boolean =>
  facts.some((fact) => fact.role === "reactant" || fact.role === "solvent")
  && facts.some((fact) => fact.role === "reagent" || fact.role === "temperature" || fact.role === "time");

const hasRequiredProduct = (facts: readonly ReactionFactCandidate[]): boolean =>
  facts.some((fact) => fact.role === "product");

const createMissingProductDiagnostics = (
  facts: readonly ReactionFactCandidate[]
): ImportDiagnostic[] => {
  if (!hasReactionSkeleton(facts) || hasRequiredProduct(facts)) {
    return [];
  }

  return [{
    code: "W_IMPORT_REACTION_PRODUCT_REQUIRED",
    severity: "warning",
    message: "Reaction candidate was not rendered because Chemd reactions require an explicit product.",
    span: facts[0]?.sourceSpan,
    facts: { roles: facts.map((fact) => fact.role) }
  }];
};

const hasEnoughEvidence = (facts: readonly ReactionFactCandidate[]): boolean =>
  hasReactionSkeleton(facts) && hasRequiredProduct(facts);

export const buildReactionCandidateResult = (
  input: BuildReactionCandidatesInput
): BuildReactionCandidatesResult => {
  const collected = collectReactionFacts(input);
  const split = splitRenderableReactionFacts(collected.facts);
  const rejectedFacts = [...split.rejected, ...collected.rejectedFacts];
  const diagnostics = [
    ...createReactionLowConfidenceDiagnostics(collected.facts),
    ...createReactionWorkupDiagnostics(collected.rejectedFacts),
    ...createMissingProductDiagnostics(split.accepted)
  ];

  if (!hasEnoughEvidence(split.accepted)) {
    return { candidates: [], diagnostics };
  }

  return {
    candidates: [{
      id: "import-reaction-1",
      source: "prose_import",
      confidence: reactionCandidateConfidence(split.accepted),
      facts: split.accepted,
      rejectedFacts,
      diagnostics
    }],
    diagnostics
  };
};

export const buildReactionCandidates = (
  input: BuildReactionCandidatesInput
): readonly ReactionCandidate[] =>
  buildReactionCandidateResult(input).candidates;

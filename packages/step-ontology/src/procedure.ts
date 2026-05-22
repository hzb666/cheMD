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
  QUENCH_PATTERNS,
  SAMPLE_PATTERNS,
  SEPARATE_LAYERS_PATTERNS,
  SLOW_ADDITION_PATTERNS,
  SOLVENT_MARKERS
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

  return {
    stepId: context.nextStepId(),
    family,
    params,
    ...(effects.length > 0 ? { effects } : {}),
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
  cleanExtractedText(stopAtAny(textAfterAny(sentence, ADD_MATERIAL_MARKERS) ?? "", ADD_STOP_MARKERS)) || undefined;

const getChargeMaterial = (sentence: string): string | undefined =>
  cleanExtractedText(
    stopAtAny(
      textAfterAny(sentence, CHARGE_MATERIAL_MARKERS) ?? textBeforeAny(sentence, CHARGE_BEFORE_MARKERS) ?? "",
      CHARGE_STOP_MARKERS
    )
  ) || undefined;

const getSolvent = (sentence: string): string | undefined =>
  readTokenAfterAny(sentence, SOLVENT_MARKERS);

const lowerCharge = (context: SentenceContext): CanonicalStepNode[] => {
  const isInitialCharge = context.sentenceIndex === 0
    && hasAny(context.sentence, INITIAL_CHARGE_PATTERNS);

  if (!isInitialCharge) {
    return [];
  }

  return [createStep(context, "charge", {
    ...(getChargeMaterial(context.sentence) ? { materials: getChargeMaterial(context.sentence) } : {}),
    ...(getSolvent(context.sentence) ? { solvent: getSolvent(context.sentence) } : {})
  }, 0.82)];
};

const lowerEnvironment = (context: SentenceContext): CanonicalStepNode[] => {
  if (hasAny(context.sentence, PURGE_PATTERNS)) {
    return [createStep(context, "purge", {
      atmosphere: "nitrogen",
      ...(extractDuration(context.sentence) ? { duration: extractDuration(context.sentence) } : {})
    }, 0.9, ["uses_inert_atmosphere"])];
  }

  return [];
};

const lowerTemperature = (context: SentenceContext): CanonicalStepNode[] => {
  const temperature = extractTemperature(context.sentence);
  const steps: CanonicalStepNode[] = [];

  if (hasAny(context.sentence, COOL_PATTERNS)) {
    steps.push(createStep(context, "cool", { target_temperature: temperature }, 0.9, ["changes_temperature"]));
  }

  if (hasAny(context.sentence, HEAT_PATTERNS)) {
    steps.push(createStep(context, "heat", { target_temperature: temperature }, 0.88, ["changes_temperature"]));
  }

  return steps;
};

const lowerAddition = (context: SentenceContext): CanonicalStepNode[] => {
  if (hasAny(context.sentence, QUENCH_PATTERNS)) {
    return [createStep(context, "quench", {
      ...(getAddMaterial(context.sentence) ? { agent: getAddMaterial(context.sentence) } : {})
    }, 0.86)];
  }

  if (!hasAny(context.sentence, ADDITION_PATTERNS)) {
    return [];
  }

  return [createStep(context, "add", {
    ...(getAddMaterial(context.sentence) ? { materials: getAddMaterial(context.sentence) } : {}),
    ...(hasAny(context.sentence, SLOW_ADDITION_PATTERNS) ? { mode: "dropwise" } : {}),
    ...(hasAny(context.sentence, NITROGEN_CONTEXT_PATTERNS) ? { atmosphere: "nitrogen" } : {})
  }, 0.84, hasAny(context.sentence, HAZARDOUS_REAGENT_PATTERNS) ? ["consumes_hazardous_reagent"] : [])];
};

const lowerProcess = (context: SentenceContext): CanonicalStepNode[] => {
  const duration = extractDuration(context.sentence);
  const isHold = hasAny(context.sentence, HOLD_PATTERNS);

  return isHold && duration
    ? [createStep(context, "hold", { duration }, 0.86)]
    : [];
};

const lowerWorkup = (context: SentenceContext): CanonicalStepNode[] => {
  if (hasAny(context.sentence, EXTRACT_PATTERNS)) {
    const extractionSolvent = textBeforeAny(context.sentence, ["萃取"]);
    return [createStep(context, "extract", {
      ...(extractionSolvent ? { solvent: cleanExtractedText(extractionSolvent) } : {}),
      ...(extractRepeatCount(context.sentence) ? { repeats: extractRepeatCount(context.sentence) } : {})
    }, 0.84, ["creates_biphasic_system"])];
  }

  if (hasAny(context.sentence, DRY_PATTERNS)) {
    return [createStep(context, "dry", { agent: cleanExtractedText(textBeforeAny(context.sentence, ["干燥"]) ?? "") || undefined }, 0.82)];
  }

  return lowerMechanicalWorkup(context);
};

const lowerMechanicalWorkup = (context: SentenceContext): CanonicalStepNode[] => {
  if (hasAny(context.sentence, CONCENTRATE_PATTERNS)) {
    return [createStep(context, "concentrate", { method: "rotavap" }, 0.84)];
  }

  if (hasAny(context.sentence, SEPARATE_LAYERS_PATTERNS)) {
    return [createStep(context, "separate_layers", {}, 0.82, ["creates_biphasic_system"])];
  }

  if (hasAny(context.sentence, FILTER_PATTERNS)) {
    return [createStep(context, "filter", {}, 0.82)];
  }

  return [];
};

const lowerAnalysis = (context: SentenceContext): CanonicalStepNode[] => {
  const steps: CanonicalStepNode[] = [];

  if (hasAny(context.sentence, SAMPLE_PATTERNS)) {
    steps.push(createStep(context, "sample", {}, 0.88, ["requires_sampling"]));
  }

  if (hasAny(context.sentence, ANALYSIS_PATTERNS)) {
    steps.push(createStep(context, "analyze", { type: extractAnalysisType(context.sentence) }, 0.88));
  }

  return steps;
};

const extractAnalysisType = (sentence: string): string => {
  const match = sentence.match(/\b(TLC|HPLC|NMR)\b/i);
  return match?.[1]?.toLowerCase() ?? "unknown";
};

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

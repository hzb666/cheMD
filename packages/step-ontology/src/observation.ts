import { createV03Diagnostic } from "@chemd/diagnostics";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { ProvenanceInfo } from "@chemd/core";

import { normalizeText } from "./text";
import type {
  ObservationEventNode,
  ObservationEventType,
  ObservationLoweringInput,
  ObservationLoweringResult,
  StepFamily
} from "./types";

const detectEventType = (text: string): ObservationEventType | undefined => {
  const lower = text.toLowerCase();
  const hasColorWord = /\b(?:deep\s+red|red|yellow)\b/.test(lower);
  const hasColorChangeContext = /\b(?:turn(?:ed)?|became|becomes|changed?|colour|color)\b/.test(lower);

  if (
    text.includes("颜色")
    || (text.includes("变") && text.includes("色"))
    || lower.includes("color")
    || lower.includes("colour")
    || (hasColorWord && hasColorChangeContext)
  ) {
    return "color_change";
  }

  if (text.includes("沉淀") || lower.includes("precipitat")) {
    return "precipitation";
  }

  if (text.includes("气泡") || text.includes("放气") || lower.includes("gas") || lower.includes("bubble")) {
    return "gas_evolution";
  }

  return undefined;
};

const detectLinkedStepFamily = (text: string): StepFamily | undefined => {
  const lower = text.toLowerCase();
  if (
    text.includes("加入")
    || text.includes("滴加")
    || lower.includes("after add")
    || lower.includes("after adding")
  ) {
    return "add";
  }

  if (text.includes("加热") || lower.includes("heated") || lower.includes("warming")) {
    return "heat";
  }

  if (text.includes("冷却") || lower.includes("cooled") || lower.includes("cooling")) {
    return "cool";
  }

  return undefined;
};

const detectColorValue = (text: string): string | undefined => {
  const lower = text.toLowerCase();
  if (text.includes("深红") || lower.includes("deep red")) {
    return "deep_red";
  }

  if (text.includes("黄色") || lower.includes("yellow")) {
    return "yellow";
  }

  return undefined;
};

const createObservationDiagnostic = (observationId: string | undefined, rawText: string): V03Diagnostic =>
  createV03Diagnostic({
    code: "W806",
    severity: "warning",
    message: "Observation was preserved as prose because no event type could be inferred.",
    sourceLayer: "lowering",
    sourceNodeType: "observation",
    sourceNodeId: observationId,
    sourceField: "body",
    facts: { raw_text: rawText }
  });

const createObservationLoweredDiagnostic = (observationId: string | undefined): V03Diagnostic =>
  createV03Diagnostic({
    code: "W_OBSERVATION_PROSE_LOWERED",
    severity: "warning",
    message: "Observation prose was lowered into canonical events; prefer explicit event blocks.",
    sourceLayer: "lowering",
    sourceNodeType: "observation",
    sourceNodeId: observationId,
    sourceField: "body"
  });

const createObservationProvenance = (
  input: ObservationLoweringInput,
  confidence: number
): ProvenanceInfo => ({
  origin: "lowered",
  sourceNodeType: "observation",
  sourceNodeId: input.observationId,
  sourceField: "body",
  ruleId: "step_ontology.observation.event",
  confidence
});

export const lowerObservationToEvents = (input: ObservationLoweringInput): ObservationLoweringResult => {
  const rawText = normalizeText(input.body ?? "");
  const eventType = detectEventType(rawText);
  const confidence = eventType ? 0.78 : 0.4;
  const provenance = createObservationProvenance(input, confidence);
  const event: ObservationEventNode = {
    observationId: input.observationId ?? "observation",
    source: {
      sourceNodeType: "observation",
      sourceNodeId: input.observationId,
      sourceType: "lowered_observation",
      rawText,
      provenance
    },
    rawText,
    ...(eventType ? { eventType } : {}),
    ...(detectLinkedStepFamily(rawText) ? { linkedStepFamily: detectLinkedStepFamily(rawText) } : {}),
    ...(detectColorValue(rawText) ? { normalizedValue: detectColorValue(rawText) } : {}),
    provenance,
    confidence
  };
  const diagnostics = rawText
    ? [
        createObservationLoweredDiagnostic(input.observationId),
        ...(eventType ? [] : [createObservationDiagnostic(input.observationId, rawText)])
      ]
    : [];

  return {
    observationId: input.observationId,
    events: rawText ? [event] : [],
    diagnostics
  };
};

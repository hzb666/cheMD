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
  if (/颜色|变.*色|color|colour|red|yellow/i.test(text)) {
    return "color_change";
  }

  if (/沉淀|precipitat/i.test(text)) {
    return "precipitation";
  }

  if (/气泡|放气|gas|bubble/i.test(text)) {
    return "gas_evolution";
  }

  return undefined;
};

const detectLinkedStepFamily = (text: string): StepFamily | undefined => {
  if (/加入|滴加|after\s+add|after\s+adding/i.test(text)) {
    return "add";
  }

  if (/加热|heated|warming/i.test(text)) {
    return "heat";
  }

  if (/冷却|cooled|cooling/i.test(text)) {
    return "cool";
  }

  return undefined;
};

const detectColorValue = (text: string): string | undefined => {
  if (/深红|deep\s+red/i.test(text)) {
    return "deep_red";
  }

  if (/黄色|yellow/i.test(text)) {
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

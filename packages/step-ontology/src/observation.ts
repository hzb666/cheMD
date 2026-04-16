import { createV03Diagnostic } from "@chemd/diagnostics";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { normalizeText } from "./text";
import type { ObservationEventNode, ObservationLoweringInput, ObservationLoweringResult, StepFamily } from "./types";

const detectEventType = (text: string): string | undefined => {
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
    sourceLayer: "procedure_lowering",
    sourceNodeType: "observation",
    sourceNodeId: observationId,
    facts: { raw_text: rawText }
  });

export const lowerObservationToEvents = (input: ObservationLoweringInput): ObservationLoweringResult => {
  const rawText = normalizeText(input.body ?? "");
  const eventType = detectEventType(rawText);
  const event: ObservationEventNode = {
    observationId: input.observationId ?? "observation",
    source: {
      sourceNodeType: "observation",
      sourceNodeId: input.observationId,
      rawText
    },
    rawText,
    ...(eventType ? { eventType } : {}),
    ...(detectLinkedStepFamily(rawText) ? { linkedStepFamily: detectLinkedStepFamily(rawText) } : {}),
    ...(detectColorValue(rawText) ? { normalizedValue: detectColorValue(rawText) } : {}),
    confidence: eventType ? 0.78 : 0.4
  };
  const diagnostics = eventType ? [] : [createObservationDiagnostic(input.observationId, rawText)];

  return {
    observationId: input.observationId,
    events: rawText ? [event] : [],
    diagnostics
  };
};

import {
  getStepParamSchema,
  lowerObservationToEvents,
  lowerProcedureToSteps
} from "@chemd/step-ontology";
import type {
  CanonicalStepNode,
  ObservationEventNode
} from "@chemd/step-ontology";

import type {
  ImportDiagnostic,
  ObservationFrame,
  ProseSourceSpan,
  StepFrame
} from "./types";

interface FrameExtractionResult {
  steps: StepFrame[];
  observations: ObservationFrame[];
  diagnostics: ImportDiagnostic[];
}

const createSpanFromRawText = (
  sourceText: string,
  rawText: string,
  fromIndex: number
): ProseSourceSpan => {
  const start = sourceText.indexOf(rawText, fromIndex);
  if (start < 0) {
    return {
      start: 0,
      end: sourceText.length,
      text: sourceText
    };
  }

  return {
    start,
    end: start + rawText.length,
    text: rawText
  };
};

const stepToFrame = (
  sourceText: string,
  step: CanonicalStepNode,
  index: number,
  fromIndex: number
): StepFrame => ({
  id: `step:${index + 1}`,
  family: step.family,
  params: step.params,
  span: createSpanFromRawText(sourceText, step.source.rawText, fromIndex),
  confidence: step.loweringConfidence,
  evidence: [
    step.provenance?.ruleId ?? "step_ontology.procedure",
    step.source.rawText
  ]
});

const observationToFrame = (
  sourceText: string,
  event: ObservationEventNode,
  index: number
): ObservationFrame => ({
  id: `observation:${index + 1}`,
  rawText: event.rawText,
  span: createSpanFromRawText(sourceText, event.rawText, 0),
  linkedStepId: event.linkedStepId,
  linkedStepFamily: event.linkedStepFamily,
  eventType: event.eventType,
  normalizedValue: event.normalizedValue,
  confidence: event.confidence,
  evidence: [
    event.provenance?.ruleId ?? "step_ontology.observation",
    ...(event.eventType ? [`eventType:${event.eventType}`] : []),
    ...(event.linkedStepFamily ? [`linkedStepFamily:${event.linkedStepFamily}`] : [])
  ]
});

const createStepParamDiagnostics = (
  sourceText: string,
  frames: readonly StepFrame[]
): ImportDiagnostic[] =>
  frames.flatMap((frame) =>
    Object.keys(frame.params)
      .filter((param) => getStepParamSchema(frame.family, param) === undefined)
      .map((param) => ({
        code: "W_IMPORT_STEP_PARAM_SCHEMA_DRIFT",
        severity: "warning" as const,
        message: "Lowered step parameter is not known by the Chemd step schema.",
        span: frame.span,
        facts: {
          family: frame.family,
          param,
          source: sourceText.slice(frame.span.start, frame.span.end)
        }
      }))
  );

const convertStepDiagnostics = (
  diagnostics: ReturnType<typeof lowerProcedureToSteps>["diagnostics"]
): ImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    facts: diagnostic.facts
  }));

const convertObservationDiagnostics = (
  diagnostics: ReturnType<typeof lowerObservationToEvents>["diagnostics"]
): ImportDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    facts: diagnostic.facts
  }));

export const extractProseFrames = (sourceText: string): FrameExtractionResult => {
  const procedure = lowerProcedureToSteps({
    procedureId: "import-prose",
    body: sourceText
  });
  const observation = lowerObservationToEvents({
    observationId: "import-prose",
    body: sourceText
  });

  let fromIndex = 0;
  const steps = procedure.steps.map((step, index) => {
    const frame = stepToFrame(sourceText, step, index, fromIndex);
    fromIndex = frame.span.end;
    return frame;
  });
  const observations = observation.events.map((event, index) =>
    observationToFrame(sourceText, event, index)
  );

  return {
    steps,
    observations,
    diagnostics: [
      ...convertStepDiagnostics(procedure.diagnostics),
      ...convertObservationDiagnostics(observation.diagnostics),
      ...createStepParamDiagnostics(sourceText, steps)
    ]
  };
};

import {
  getStepParamSchema,
  buildProcedureState,
  lowerObservationToEvents,
  lowerProcedureToSteps
} from "@chemd/step-ontology";
import type {
  CanonicalStepNode,
  ObservationEventNode,
  ProcedureStateResult,
  ProcedureStateWarning
} from "@chemd/step-ontology";

import type {
  ImportDiagnostic,
  ObservationFrame,
  ProseSourceSpan,
  StepFrame,
  UnparsedProseSpan
} from "./types";
import { createCoverageLedger } from "./coverage";

interface FrameExtractionResult {
  steps: StepFrame[];
  observations: ObservationFrame[];
  procedureState: ProcedureStateResult;
  unparsedSpans: UnparsedProseSpan[];
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

const convertStateWarningDiagnostics = (
  warnings: readonly ProcedureStateWarning[]
): ImportDiagnostic[] =>
  warnings.map((warning) => ({
    code: warning.code,
    severity: "warning" as const,
    message: warning.message,
    facts: {
      step_family: warning.stepFamily,
      step_id: warning.stepId
    }
  }));

const isUnparsedObserveStep = (step: StepFrame): boolean =>
  step.family === "observe"
  && typeof step.params.raw === "string"
  && step.confidence <= 0.4;

const toUnparsedSpan = (step: StepFrame, index: number): UnparsedProseSpan => ({
  id: `unparsed:${index + 1}`,
  start: step.span.start,
  end: step.span.end,
  text: step.span.text,
  reason: "no_canonical_step",
  confidence: step.confidence
});

export const extractProseFrames = (sourceText: string): FrameExtractionResult => {
  const procedure = lowerProcedureToSteps({
    procedureId: "import-prose",
    body: sourceText
  });
  const observation = lowerObservationToEvents({
    observationId: "import-prose",
    body: sourceText
  });
  const procedureState = buildProcedureState(procedure.steps);

  let fromIndex = 0;
  const stepFrames = procedure.steps.map((step, index) => {
    const frame = stepToFrame(sourceText, step, index, fromIndex);
    fromIndex = frame.span.end;
    return frame;
  });
  const steps = stepFrames.filter((step) => !isUnparsedObserveStep(step));
  const unparsedSpans = stepFrames
    .filter(isUnparsedObserveStep)
    .map(toUnparsedSpan);
  const observationEvents = observation.events.filter((event) => event.eventType);
  const observations = observationEvents.map((event, index) =>
    observationToFrame(sourceText, event, index)
  );
  const coverage = createCoverageLedger(sourceText, steps, observations, unparsedSpans);

  return {
    steps,
    observations,
    procedureState,
    unparsedSpans: [
      ...unparsedSpans,
      ...coverage.unparsedSpans
    ],
    diagnostics: [
      ...convertStepDiagnostics(procedure.diagnostics),
      ...(observations.length > 0 ? convertObservationDiagnostics(observation.diagnostics) : []),
      ...convertStateWarningDiagnostics(procedureState.warnings),
      ...createStepParamDiagnostics(sourceText, steps),
      ...coverage.diagnostics
    ]
  };
};

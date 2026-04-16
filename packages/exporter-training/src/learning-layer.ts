import type { StepGraph } from "@chemd/step-ontology";

import type {
  ExportedDiagnostic,
  LearningLayerV1,
  ObservationToEventsPairV03,
  ProcedureToStepsPairV03
} from "./types";

const exportDiagnostic = (diagnostic: StepGraph["diagnostics"][number]): ExportedDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  node_id: diagnostic.sourceNodeId,
  position: diagnostic.position
});

const buildProcedurePairs = (stepGraph: StepGraph | undefined): ProcedureToStepsPairV03[] =>
  stepGraph?.procedures.map((procedure, index) => ({
    pair_id: `procedure_to_steps::${procedure.procedureId ?? index}`,
    procedure_id: procedure.procedureId,
    source_text: procedure.steps[0]?.source.rawText ?? "",
    steps: procedure.steps,
    diagnostics: procedure.diagnostics.map(exportDiagnostic)
  })) ?? [];

const buildObservationPairs = (stepGraph: StepGraph | undefined): ObservationToEventsPairV03[] =>
  stepGraph?.observations.map((observation, index) => ({
    pair_id: `observation_to_events::${observation.observationId ?? index}`,
    observation_id: observation.observationId,
    source_text: observation.events[0]?.rawText ?? "",
    events: observation.events,
    diagnostics: observation.diagnostics.map(exportDiagnostic)
  })) ?? [];

export const buildLearningLayer = (stepGraph?: StepGraph): LearningLayerV1 => {
  const procedurePairs = buildProcedurePairs(stepGraph);
  const observationPairs = buildObservationPairs(stepGraph);

  return {
    retrieval_chunks: [],
    prediction_instances: [],
    ...(procedurePairs.length > 0 ? { procedure_to_steps: procedurePairs } : {}),
    ...(observationPairs.length > 0 ? { observation_to_events: observationPairs } : {})
  };
};

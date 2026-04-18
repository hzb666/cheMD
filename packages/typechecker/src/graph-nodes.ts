import type {
  CanonicalStepNode,
  ObservationEventNode,
  ObservationLoweringResult
} from "@chemd/step-ontology";

import type {
  TypedObservationEventNode,
  TypedStepNode
} from "./types";

export const buildTypedStepNode = (step: CanonicalStepNode): TypedStepNode => ({
  kind: "step",
  nodeId: step.stepId,
  stepId: step.stepId,
  sourceNodeType: step.source.sourceNodeType,
  family: step.family,
  params: step.params,
  ...(step.inputs ? { inputs: step.inputs } : {}),
  ...(step.outputs ? { outputs: step.outputs } : {}),
  ...(step.artifacts ? { artifacts: step.artifacts } : {}),
  ...(step.effects ? { effects: step.effects } : {}),
  ...(step.dependsOn ? { dependsOn: step.dependsOn } : {}),
  source: step.source,
  ...(step.provenance ? { provenance: step.provenance } : {}),
  confidence: step.loweringConfidence
});

const readEventId = (event: ObservationEventNode, eventIndex: number): string =>
  event.eventId ?? `${event.observationId}:e${eventIndex + 1}`;

export const buildTypedObservationEventNode = (
  event: ObservationEventNode,
  eventIndex: number
): TypedObservationEventNode => ({
  kind: "observation_event",
  nodeId: readEventId(event, eventIndex),
  eventId: readEventId(event, eventIndex),
  sourceNodeType: "observation",
  ...(event.eventType ? { eventType: event.eventType } : {}),
  ...(event.stage ? { stage: event.stage } : {}),
  rawText: event.rawText,
  ...(event.params ? { params: event.params } : {}),
  ...(event.linkedStepId ? { linkedStepId: event.linkedStepId } : {}),
  ...(event.linkedStepFamily ? { linkedStepFamily: event.linkedStepFamily } : {}),
  ...(event.normalizedValue !== undefined ? { normalizedValue: event.normalizedValue } : {}),
  source: event.source,
  ...(event.provenance ? { provenance: event.provenance } : {}),
  confidence: event.confidence
});

export const buildTypedObservationEventNodes = (
  observations: ObservationLoweringResult[]
): TypedObservationEventNode[] =>
  observations.flatMap((observation) =>
    observation.events.map((event, index) => buildTypedObservationEventNode(event, index))
  );

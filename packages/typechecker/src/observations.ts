import type { ObservationNode } from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import {
  lowerObservationToEvents,
  type CanonicalStepNode,
  type ObservationEventNode,
  type ObservationEventType,
  type ObservationLoweringResult
} from "@chemd/step-ontology";

const OBSERVATION_EVENT_TYPES = new Set<ObservationEventType>([
  "color_change",
  "precipitation",
  "gas_evolution",
  "phase_change"
]);

const isObservationEventType = (eventType: string): eventType is ObservationEventType =>
  OBSERVATION_EVENT_TYPES.has(eventType as ObservationEventType);

const readEventId = (
  node: ObservationNode,
  index: number,
  eventId: string | undefined
): string => eventId ?? `${node.id ?? "observation"}:e${index + 1}`;

const createObservationDiagnostic = (
  code: string,
  message: string,
  sourceNodeId: string | undefined,
  facts: Record<string, unknown>
): V03Diagnostic =>
  createV03Diagnostic({
    code,
    severity: "error",
    message,
    sourceLayer: "typechecker",
    sourceNodeType: "observation_event",
    sourceNodeId,
    ...(typeof facts.field === "string" ? { sourceField: facts.field } : {}),
    facts
  });

const readNormalizedValue = (params: Record<string, string> | undefined): unknown => {
  if (!params) {
    return undefined;
  }

  return params.value ?? params.color ?? params.state;
};

const toExplicitObservationEvent = (
  node: ObservationNode,
  eventIndex: number,
  event: NonNullable<ObservationNode["events"]>[number]
): { event: ObservationEventNode; diagnostics: V03Diagnostic[] } => {
  const eventId = readEventId(node, eventIndex, event.eventId);
  const eventType = isObservationEventType(event.eventType) ? event.eventType : undefined;
  const diagnostics = eventType
    ? []
    : [
        createObservationDiagnostic(
          "E_OBSERVATION_EVENT_INVALID_TYPE",
          `Invalid observation event type: ${event.eventType}`,
          eventId,
          { field: "eventType", event_type: event.eventType }
        )
      ];

  return {
    diagnostics,
    event: {
      eventId,
      observationId: node.id ?? "observation",
      source: {
        sourceNodeType: "observation",
        sourceNodeId: node.id,
        sourceType: "explicit_observation",
        sentenceIndex: eventIndex,
        rawText: event.raw ?? `event: ${event.eventType}`,
        ...(event.sourceSpan ? { sourceSpan: event.sourceSpan } : {}),
        ...(event.provenance ? { provenance: event.provenance } : {})
      },
      rawText: event.raw ?? `event: ${event.eventType}`,
      ...(eventType ? { eventType } : {}),
      ...(event.stage ? { stage: event.stage } : {}),
      ...(event.params ? { params: event.params } : {}),
      ...(readNormalizedValue(event.params) !== undefined
        ? { normalizedValue: readNormalizedValue(event.params) }
        : {}),
      ...(event.linkedStepId ? { linkedStepId: event.linkedStepId } : {}),
      ...(event.provenance ? { provenance: event.provenance } : {}),
      confidence: eventType ? 1 : 0.4
    }
  };
};

const buildExplicitObservationResult = (node: ObservationNode): ObservationLoweringResult => {
  const diagnostics: V03Diagnostic[] = [];
  const events: ObservationEventNode[] = [];

  node.events?.forEach((event, index) => {
    const converted = toExplicitObservationEvent(node, index, event);
    diagnostics.push(...converted.diagnostics);
    events.push(converted.event);
  });

  return {
    observationId: node.id,
    events,
    diagnostics
  };
};

export const resolveObservationEvents = (node: ObservationNode): ObservationLoweringResult => {
  if (node.events && node.events.length > 0) {
    return buildExplicitObservationResult(node);
  }

  return lowerObservationToEvents({
    observationId: node.id,
    body: node.body
  });
};

export const validateObservationEventLinks = (
  observationResults: ObservationLoweringResult[],
  steps: CanonicalStepNode[]
): V03Diagnostic[] => {
  const stepIds = new Set(steps.map((step) => step.stepId));

  return observationResults.flatMap((result) =>
    result.events
      .filter((event) => event.linkedStepId && !stepIds.has(event.linkedStepId))
      .map((event) =>
        createObservationDiagnostic(
          "E_OBSERVATION_LINKED_STEP_MISSING",
          `Observation event ${event.eventId ?? result.observationId} links to missing step: ${event.linkedStepId}`,
          event.eventId ?? result.observationId,
          { field: "linkedStep", linked_step_id: event.linkedStepId }
        )
      )
  );
};

import type { ChemdTrainingGraphIndexV1 } from "@chemd/exporter-training";
import type {
  CanonicalProcedureControlNode,
  CanonicalStepNode
} from "@chemd/step-ontology";

import type {
  LinkChemdModulesResult,
  LinkedChemdModule
} from "./module-linker";

type GraphNode = ChemdTrainingGraphIndexV1["nodes"][number];
type GraphEdge = ChemdTrainingGraphIndexV1["edges"][number];

export interface WorkspaceRuntimeTraceEvent {
  documentId?: string;
  eventId: string;
  runId: string;
  timestamp: string;
  type: string;
  artifactId?: string;
  controlId?: string;
  payload?: Record<string, unknown>;
  procedureId?: string;
  stepId?: string;
}

export interface WorkspaceRuntimeTraceInput {
  events: WorkspaceRuntimeTraceEvent[];
  runId: string;
  stepIds?: string[];
}

interface RuntimeTargetIndex {
  controls: RuntimeTargetMaps;
  steps: RuntimeTargetMaps;
}

interface RuntimeTargetMaps {
  byDocument: Map<string, string | null>;
  byGlobal: Map<string, string | null>;
  byScope: Map<string, string>;
}

interface OrderedTraceEvent {
  event: WorkspaceRuntimeTraceEvent;
  order: number;
}

export const createRuntimeTraceGraph = (
  linked: LinkChemdModulesResult,
  traces: WorkspaceRuntimeTraceInput[]
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const targetIndex = createRuntimeTargetIndex(linked);
  const graphs = traces.map((trace) => createTraceOverlay(trace, targetIndex));

  return {
    nodes: graphs.flatMap((graph) => graph.nodes),
    edges: graphs.flatMap((graph) => graph.edges)
  };
};

const createTraceOverlay = (
  trace: WorkspaceRuntimeTraceInput,
  targetIndex: RuntimeTargetIndex
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const events = orderedTraceEvents(trace);

  return {
    nodes: events.flatMap(({ event, order }) => [
      createTraceEventNode(trace.runId, event, order),
      createRuntimeStateNode(trace.runId, event, order)
    ]),
    edges: [
      ...createSequentialEdges(trace.runId, events, "trace_event_precedes_event", traceEventNodeId),
      ...createSequentialEdges(trace.runId, events, "runtime_state_precedes_state", runtimeStateNodeId),
      ...events.flatMap(({ event }) => createTargetEdges(trace.runId, event, targetIndex))
    ]
  };
};

const orderedTraceEvents = (trace: WorkspaceRuntimeTraceInput): OrderedTraceEvent[] =>
  trace.events
    .filter((event) => event.runId === trace.runId)
    .map((event, order) => ({ event, order }))
    .sort((left, right) => {
      const byTime = Date.parse(left.event.timestamp) - Date.parse(right.event.timestamp);
      return Number.isNaN(byTime) || byTime === 0 ? left.order - right.order : byTime;
    });

const createTraceEventNode = (
  runId: string,
  event: WorkspaceRuntimeTraceEvent,
  order: number
): GraphNode => ({
  node_id: traceEventNodeId(runId, event.eventId),
  node_type: "runtime_trace_event",
  entity_id: traceEventNodeId(runId, event.eventId),
  label: `${event.type} ${event.eventId}`,
  original_id: event.eventId,
  properties: {
    event_type: event.type,
    order,
    run_id: runId,
    timestamp: event.timestamp
  }
});

const createRuntimeStateNode = (
  runId: string,
  event: WorkspaceRuntimeTraceEvent,
  order: number
): GraphNode => ({
  node_id: runtimeStateNodeId(runId, event.eventId),
  node_type: "runtime_state_snapshot",
  entity_id: runtimeStateNodeId(runId, event.eventId),
  label: `state after ${event.eventId}`,
  original_id: event.eventId,
  properties: {
    event_id: event.eventId,
    event_type: event.type,
    order,
    run_id: runId,
    timestamp: event.timestamp
  }
});

const createSequentialEdges = (
  runId: string,
  events: OrderedTraceEvent[],
  edgeType: string,
  nodeId: (runId: string, eventId: string) => string
): GraphEdge[] =>
  events.slice(1).map(({ event }, index) => {
    const previous = events[index]!.event;
    return createEdge(edgeType, nodeId(runId, previous.eventId), nodeId(runId, event.eventId), runId);
  });

const createTargetEdges = (
  runId: string,
  event: WorkspaceRuntimeTraceEvent,
  targetIndex: RuntimeTargetIndex
): GraphEdge[] => [
  ...(event.stepId && resolveRuntimeTarget(targetIndex.steps, event.stepId, event)
    ? [createEdge(
        "trace_event_targets_step",
        traceEventNodeId(runId, event.eventId),
        resolveRuntimeTarget(targetIndex.steps, event.stepId, event)!,
        runId
      )]
    : []),
  ...(event.controlId && resolveRuntimeTarget(targetIndex.controls, event.controlId, event)
    ? [createEdge(
        "trace_event_targets_control",
        traceEventNodeId(runId, event.eventId),
        resolveRuntimeTarget(targetIndex.controls, event.controlId, event)!,
        runId
      )]
    : [])
];

const createRuntimeTargetIndex = (linked: LinkChemdModulesResult): RuntimeTargetIndex => {
  const steps = createTargetMaps();
  const controls = createTargetMaps();

  for (const module of linked.modules) {
    for (const step of module.coreResult.stepGraph.steps) {
      addRuntimeTarget(steps, module.documentId, procedureIdForStep(step), step.stepId, stepNodeId(module, step));
    }
    for (const control of module.coreResult.stepGraph.controls ?? []) {
      addRuntimeTarget(
        controls,
        module.documentId,
        procedureIdForControl(control),
        control.controlId,
        controlNodeId(module, control)
      );
    }
  }

  return { controls, steps };
};

const createTargetMaps = (): RuntimeTargetMaps => ({
  byDocument: new Map(),
  byGlobal: new Map(),
  byScope: new Map()
});

const addRuntimeTarget = (
  maps: RuntimeTargetMaps,
  documentId: string,
  procedureId: string,
  localId: string,
  nodeId: string
): void => {
  addUniqueTarget(maps.byGlobal, localId, nodeId);
  addUniqueTarget(maps.byDocument, documentTargetKey(documentId, localId), nodeId);
  maps.byScope.set(scopedTargetKey(documentId, procedureId, localId), nodeId);
};

const addUniqueTarget = (
  index: Map<string, string | null>,
  key: string,
  value: string
): void => {
  if (!index.has(key)) {
    index.set(key, value);
    return;
  }

  if (index.get(key) !== value) {
    index.set(key, null);
  }
};

const resolveRuntimeTarget = (
  maps: RuntimeTargetMaps,
  localId: string,
  event: WorkspaceRuntimeTraceEvent
): string | undefined => {
  if (event.documentId && event.procedureId) {
    return maps.byScope.get(scopedTargetKey(event.documentId, event.procedureId, localId));
  }
  if (event.documentId) {
    return maps.byDocument.get(documentTargetKey(event.documentId, localId)) ?? undefined;
  }
  const globalTarget = maps.byGlobal.get(localId);
  return globalTarget ?? undefined;
};

const scopedTargetKey = (
  documentId: string,
  procedureId: string,
  localId: string
): string => `${documentId}::${procedureId}::${localId}`;

const documentTargetKey = (
  documentId: string,
  localId: string
): string => `${documentId}::${localId}`;

const stepNodeId = (
  module: LinkedChemdModule,
  step: CanonicalStepNode
): string => `step::${module.documentId}::${procedureIdForStep(step)}::${step.stepId}`;

const controlNodeId = (
  module: LinkedChemdModule,
  control: CanonicalProcedureControlNode
): string => `control::${module.documentId}::${procedureIdForControl(control)}::${control.controlId}`;

const procedureIdForStep = (step: CanonicalStepNode): string =>
  step.source.sourceNodeId ?? "procedure";

const procedureIdForControl = (control: CanonicalProcedureControlNode): string =>
  control.source.sourceNodeId ?? "procedure";

const traceEventNodeId = (runId: string, eventId: string): string =>
  `trace_event::${runId}::${eventId}`;

const runtimeStateNodeId = (runId: string, eventId: string): string =>
  `runtime_state::${runId}::${eventId}`;

const createEdge = (
  edgeType: string,
  fromNodeId: string,
  toNodeId: string,
  runId: string
): GraphEdge => ({
  edge_id: `runtime::${edgeType}::${fromNodeId}::${toNodeId}`,
  edge_type: edgeType,
  from_node_id: fromNodeId,
  to_node_id: toNodeId,
  confidence: 1,
  properties: {
    edge_source: "runtime_trace",
    run_id: runId
  }
});

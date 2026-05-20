import type { ChemdDocument, TraceNode } from "@chemd/core";
import type { ObservationLoweringResult, ProcedureLoweringResult, StepGraph } from "@chemd/step-ontology";
import type { V03Diagnostic } from "@chemd/diagnostics";

import {
  buildAnalysisNode,
  buildArtifactNode,
  buildBatchNode,
  buildConditionVariesNode,
  buildMaterialNode,
  buildMoleculeNode,
  buildObservationNode,
  buildProcedureNode,
  buildReactionNode,
  buildResultNode,
  buildSampleNode,
  buildTraceNode,
  type BuiltTypedNode
} from "./nodes";
import { buildTypedObservationEventNodes, buildTypedStepNode } from "./graph-nodes";
import { resolveObservationEvents, validateObservationEventLinks } from "./observations";
import { augmentReactionRouteGraph } from "./reaction-routes";
import { createExternalTargetIndex, createObjectIndex } from "./references";
import { resolveProcedureSteps } from "./steps";
import { collectNodes, isObjectNode } from "./traversal";
import type {
  ExternalTargetIndex,
  ObjectNode,
  ProcedureMode,
  QuantityType,
  TypedSemanticGraph,
  TypedSemanticNode,
  TypecheckOptions,
  TypecheckResult
} from "./types";

export * from "./types";

interface Accumulator {
  nodes: TypedSemanticNode[];
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
  procedureResults: ProcedureLoweringResult[];
  observationResults: ObservationLoweringResult[];
  stepGraphDiagnostics: V03Diagnostic[];
  stepGraphSteps: StepGraph["steps"];
  stepGraphControls: NonNullable<StepGraph["controls"]>;
  traces: TraceNode[];
}

interface ProcedureProcessContext {
  accumulator: Accumulator;
  objectIndex: Map<string, ObjectNode>;
  externalTargetIndex: ExternalTargetIndex;
  procedureMode: ProcedureMode;
}

interface ObjectProcessContext {
  documentId: string;
  objectIndex: Map<string, ObjectNode>;
  externalTargetIndex: ExternalTargetIndex;
  accumulator: Accumulator;
  procedureMode: ProcedureMode;
}

const createAccumulator = (): Accumulator => ({
  nodes: [],
  quantities: [],
  diagnostics: [],
  procedureResults: [],
  observationResults: [],
  stepGraphDiagnostics: [],
  stepGraphSteps: [],
  stepGraphControls: [],
  traces: []
});

const appendBuiltNode = (accumulator: Accumulator, built: BuiltTypedNode) => {
  accumulator.nodes.push(built.node);
  accumulator.quantities.push(...built.quantities);
  accumulator.diagnostics.push(...built.diagnostics);
};

const processProcedure = (
  node: Extract<ObjectNode, { type: "procedure" }>,
  context: ProcedureProcessContext
) => {
  const { accumulator, objectIndex, procedureMode } = context;
  const { result: lowered, quantities } = resolveProcedureSteps(
    node,
    procedureMode,
    objectIndex,
    context.externalTargetIndex
  );

  accumulator.procedureResults.push(lowered);
  accumulator.quantities.push(...quantities);
  accumulator.stepGraphSteps.push(...lowered.steps);
  accumulator.stepGraphControls.push(...(lowered.controls ?? []));
  accumulator.stepGraphDiagnostics.push(...lowered.diagnostics);
  appendBuiltNode(accumulator, buildProcedureNode(node, lowered.structureHint));
};

const processObservation = (node: Extract<ObjectNode, { type: "observation" }>, accumulator: Accumulator) => {
  const lowered = resolveObservationEvents(node);

  accumulator.observationResults.push(lowered);
  accumulator.stepGraphDiagnostics.push(...lowered.diagnostics);
  appendBuiltNode(accumulator, buildObservationNode(node));
};

const normalizeRefId = (value: string | undefined): string | undefined =>
  value?.trim().replace(/^@/, "");

const createTraceDiagnostic = (
  code: string,
  message: string,
  node: TraceNode,
  field: string,
  facts: Record<string, unknown> = {}
): V03Diagnostic => ({
  code,
  severity: "error",
  message,
  sourceLayer: "typechecker",
  sourceNodeType: "trace",
  sourceNodeId: node.id,
  sourceField: field,
  facts
});

const isIsoDateTime = (value: string): boolean =>
  !Number.isNaN(Date.parse(value)) && /T/.test(value);

const collectPlanStepIds = (
  stepGraph: Pick<StepGraph, "steps">,
  planId: string
): Set<string> =>
  new Set(
    stepGraph.steps
      .filter((step) => normalizeRefId(step.source.sourceNodeId) === planId)
      .map((step) => step.stepId)
  );

const collectPlanControlIds = (
  stepGraph: Pick<StepGraph, "controls">,
  planId: string
): Set<string> =>
  new Set(
    (stepGraph.controls ?? [])
      .filter((control) => normalizeRefId(control.source.sourceNodeId) === planId)
      .map((control) => control.controlId)
  );

const validateTraceNodes = (
  traces: TraceNode[],
  objectIndex: Map<string, ObjectNode>,
  stepGraph: Pick<StepGraph, "steps" | "controls">
): V03Diagnostic[] => {
  const objectIds = new Set(objectIndex.keys());
  const diagnostics: V03Diagnostic[] = [];

  for (const trace of traces) {
    const planId = normalizeRefId(trace.plan);
    const plan = planId ? objectIndex.get(planId) : undefined;
    const stepIds = planId && plan?.type === "procedure" ? collectPlanStepIds(stepGraph, planId) : new Set<string>();
    const controlIds = planId && plan?.type === "procedure" ? collectPlanControlIds(stepGraph, planId) : new Set<string>();
    if (!planId || plan?.type !== "procedure") {
      diagnostics.push(createTraceDiagnostic(
        "E_TRACE_PLAN_REFERENCE",
        `Trace ${trace.id ?? "(anonymous)"} must reference a procedure plan.`,
        trace,
        "plan",
        { plan: trace.plan }
      ));
    }

    let previousTime = Number.NEGATIVE_INFINITY;
    const startedSteps = new Set<string>();
    for (const event of trace.events ?? []) {
      if (event.at) {
        const time = Date.parse(event.at);
        if (!isIsoDateTime(event.at) || time < previousTime) {
          diagnostics.push(createTraceDiagnostic(
            "E_TRACE_EVENT_TIME",
            `Trace event time must be ISO datetime and monotonic: ${event.at}`,
            trace,
            "event",
            { event_type: event.eventType, at: event.at }
          ));
        }
        previousTime = Math.max(previousTime, time);
      }

      if (event.stepId && !stepIds.has(event.stepId)) {
        diagnostics.push(createTraceDiagnostic(
          "E_TRACE_EVENT_REFERENCE",
          `Trace event references unknown step: ${event.stepId}`,
          trace,
          "event",
          { event_type: event.eventType, step_id: event.stepId }
        ));
      }
      if (event.controlId && !controlIds.has(event.controlId)) {
        diagnostics.push(createTraceDiagnostic(
          "E_TRACE_EVENT_REFERENCE",
          `Trace event references unknown control: ${event.controlId}`,
          trace,
          "event",
          { event_type: event.eventType, control_id: event.controlId }
        ));
      }
      for (const [field, value] of Object.entries({
        artifact: event.artifact,
        analysis: event.analysis,
        result: event.result
      })) {
        const id = normalizeRefId(value);
        if (id && !objectIds.has(id)) {
          diagnostics.push(createTraceDiagnostic(
            "E_TRACE_EVENT_REFERENCE",
            `Trace event references unknown ${field}: ${value}`,
            trace,
            "event",
            { event_type: event.eventType, field, ref: value }
          ));
        }
      }

      if (event.eventType === "step_started" && event.stepId) {
        startedSteps.add(event.stepId);
      }
      if (event.eventType === "step_completed" && event.stepId && !startedSteps.has(event.stepId)) {
        diagnostics.push({
          ...createTraceDiagnostic(
            "W_TRACE_STEP_STATE",
            `Trace step_completed has no prior step_started: ${event.stepId}`,
            trace,
            "event",
            { event_type: event.eventType, step_id: event.stepId }
          ),
          severity: trace.mode === "robot-run" || trace.mode === "replay-run" ? "error" : "warning"
        });
      }

      if (event.eventType === "deviation_recorded") {
        for (const required of ["field", "expected", "actual"]) {
          if (!event.params?.[required]) {
            diagnostics.push(createTraceDiagnostic(
              "E_TRACE_EVENT_PAYLOAD",
              `deviation_recorded requires ${required}.`,
              trace,
              "event",
              { event_type: event.eventType, required }
            ));
          }
        }
      }
      if (event.eventType === "resource_consumed" && (!event.params?.material && !event.params?.resource || !event.params?.amount)) {
        diagnostics.push(createTraceDiagnostic(
          "E_TRACE_EVENT_PAYLOAD",
          "resource_consumed requires material/resource and amount.",
          trace,
          "event",
          { event_type: event.eventType }
        ));
      }
    }
  }

  return diagnostics;
};

const processObjectNode = (
  node: ObjectNode,
  context: ObjectProcessContext
) => {
  const { accumulator, documentId, objectIndex, externalTargetIndex, procedureMode } = context;

  if (node.type === "procedure") {
    processProcedure(node, { accumulator, objectIndex, externalTargetIndex, procedureMode });
    return;
  }

  if (node.type === "observation") {
    processObservation(node, accumulator);
    return;
  }

  if (node.type === "trace") {
    accumulator.traces.push(node);
    appendBuiltNode(accumulator, buildTraceNode(node, { documentId, objectIndex, externalTargetIndex }));
    return;
  }

  appendBuiltNode(accumulator, buildTypedObjectNode(node, documentId, objectIndex, externalTargetIndex));
};

const buildTypedObjectNode = (
  node: Exclude<ObjectNode, { type: "procedure" | "trace" | "observation" }>,
  documentId: string,
  objectIndex: Map<string, ObjectNode>,
  externalTargetIndex: ExternalTargetIndex
): BuiltTypedNode => {
  if (node.type === "molecule") {
    return buildMoleculeNode(node, { documentId, objectIndex, externalTargetIndex });
  }

  if (node.type === "material") {
    return buildMaterialNode(node, { documentId, objectIndex, externalTargetIndex });
  }

  if (node.type === "batch") {
    return buildBatchNode(node, { documentId, objectIndex, externalTargetIndex });
  }

  if (node.type === "reaction") {
    return buildReactionNode(node, {
      documentId,
      objectIndex,
      externalTargetIndex
    });
  }

  if (node.type === "result") {
    return buildResultNode(node, { documentId, objectIndex, externalTargetIndex });
  }

  if (node.type === "analysis") {
    return buildAnalysisNode(node, { documentId, objectIndex, externalTargetIndex });
  }

  if (node.type === "sample") {
    return buildSampleNode(node, { documentId, objectIndex, externalTargetIndex });
  }

  if (node.type === "condition_varies") {
    return buildConditionVariesNode(node, { documentId, objectIndex, externalTargetIndex });
  }

  return buildArtifactNode(node, { documentId, objectIndex, externalTargetIndex });
};

const buildStepGraph = (accumulator: Accumulator): StepGraph => ({
  steps: accumulator.stepGraphSteps,
  controls: accumulator.stepGraphControls,
  procedures: accumulator.procedureResults,
  observations: accumulator.observationResults,
  diagnostics: accumulator.stepGraphDiagnostics
});

export const typecheckDocument = (
  document: ChemdDocument,
  options: TypecheckOptions = {}
): TypecheckResult => {
  const objectNodes = collectNodes(document.children).filter(isObjectNode);
  const objectIndex = createObjectIndex(document.meta.id, objectNodes);
  const externalTargetIndex = createExternalTargetIndex(options.referenceContext, options.reactionRouteContext);
  const accumulator = createAccumulator();
  const procedureMode = options.procedureMode ?? "auto";

  for (const node of objectNodes) {
    processObjectNode(node, {
      documentId: document.meta.id,
      objectIndex,
      externalTargetIndex,
      accumulator,
      procedureMode
    });
  }

  const routeAugmentation = augmentReactionRouteGraph({
    documentId: document.meta.id,
    nodes: accumulator.nodes,
    objectIndex,
    externalTargetIndex
  });
  accumulator.nodes = routeAugmentation.nodes;
  accumulator.diagnostics.push(...routeAugmentation.diagnostics);

  accumulator.stepGraphDiagnostics.push(
    ...validateObservationEventLinks(accumulator.observationResults, accumulator.stepGraphSteps),
    ...validateTraceNodes(accumulator.traces, objectIndex, {
      steps: accumulator.stepGraphSteps,
      controls: accumulator.stepGraphControls
    })
  );
  accumulator.diagnostics.push(...accumulator.stepGraphDiagnostics);
  const stepGraph = buildStepGraph(accumulator);

  const typedGraph: TypedSemanticGraph = {
    documentId: document.meta.id,
    nodes: [
      ...accumulator.nodes,
      ...stepGraph.steps.map(buildTypedStepNode),
      ...buildTypedObservationEventNodes(stepGraph.observations)
    ],
    quantities: accumulator.quantities,
    diagnostics: accumulator.diagnostics
  };

  return {
    document,
    typedGraph,
    stepGraph,
    diagnostics: accumulator.diagnostics
  };
};

export const buildTypedSemanticGraph = (document: ChemdDocument): TypedSemanticGraph =>
  typecheckDocument(document).typedGraph;

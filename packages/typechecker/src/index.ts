import type { ChemdDocument } from "@chemd/core";
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
  stepGraphSteps: []
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
  accumulator.stepGraphDiagnostics.push(...lowered.diagnostics);
  appendBuiltNode(accumulator, buildProcedureNode(node, lowered.structureHint));
};

const processObservation = (node: Extract<ObjectNode, { type: "observation" }>, accumulator: Accumulator) => {
  const lowered = resolveObservationEvents(node);

  accumulator.observationResults.push(lowered);
  accumulator.stepGraphDiagnostics.push(...lowered.diagnostics);
  appendBuiltNode(accumulator, buildObservationNode(node));
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

  appendBuiltNode(accumulator, buildTypedObjectNode(node, documentId, objectIndex, externalTargetIndex));
};

const buildTypedObjectNode = (
  node: Exclude<ObjectNode, { type: "procedure" | "observation" }>,
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
    ...validateObservationEventLinks(accumulator.observationResults, accumulator.stepGraphSteps)
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

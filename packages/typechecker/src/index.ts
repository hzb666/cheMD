import type { ChemdDocument } from "@chemd/core";
import {
  lowerObservationToEvents,
  lowerProcedureToSteps,
  type ObservationLoweringResult,
  type ProcedureLoweringResult,
  type StepGraph
} from "@chemd/step-ontology";
import type { V03Diagnostic } from "@chemd/diagnostics";

import {
  buildAnalysisNode,
  buildMoleculeNode,
  buildObservationNode,
  buildProcedureNode,
  buildReactionNode,
  buildResultNode,
  buildSampleNode,
  type BuiltTypedNode
} from "./nodes";
import { createObjectIndex } from "./references";
import { collectNodes, isObjectNode } from "./traversal";
import type {
  ObjectNode,
  QuantityType,
  TypedSemanticGraph,
  TypedSemanticNode,
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

const processProcedure = (node: Extract<ObjectNode, { type: "procedure" }>, accumulator: Accumulator) => {
  const lowered = lowerProcedureToSteps({
    procedureId: node.id,
    body: node.body
  });

  accumulator.procedureResults.push(lowered);
  accumulator.stepGraphSteps.push(...lowered.steps);
  accumulator.stepGraphDiagnostics.push(...lowered.diagnostics);
  appendBuiltNode(accumulator, buildProcedureNode(node, lowered.structureHint));
};

const processObservation = (node: Extract<ObjectNode, { type: "observation" }>, accumulator: Accumulator) => {
  const lowered = lowerObservationToEvents({
    observationId: node.id,
    body: node.body
  });

  accumulator.observationResults.push(lowered);
  accumulator.stepGraphDiagnostics.push(...lowered.diagnostics);
  appendBuiltNode(accumulator, buildObservationNode(node));
};

const processObjectNode = (
  node: ObjectNode,
  objectIndex: Map<string, ObjectNode>,
  accumulator: Accumulator
) => {
  if (node.type === "procedure") {
    processProcedure(node, accumulator);
    return;
  }

  if (node.type === "observation") {
    processObservation(node, accumulator);
    return;
  }

  appendBuiltNode(accumulator, buildTypedObjectNode(node, objectIndex));
};

const buildTypedObjectNode = (
  node: Exclude<ObjectNode, { type: "procedure" | "observation" }>,
  objectIndex: Map<string, ObjectNode>
): BuiltTypedNode => {
  if (node.type === "molecule") {
    return buildMoleculeNode(node);
  }

  if (node.type === "reaction") {
    return buildReactionNode(node, { objectIndex });
  }

  if (node.type === "result") {
    return buildResultNode(node);
  }

  if (node.type === "analysis") {
    return buildAnalysisNode(node);
  }

  return buildSampleNode(node);
};

const buildStepGraph = (accumulator: Accumulator): StepGraph => ({
  steps: accumulator.stepGraphSteps,
  procedures: accumulator.procedureResults,
  observations: accumulator.observationResults,
  diagnostics: accumulator.stepGraphDiagnostics
});

export const typecheckDocument = (document: ChemdDocument): TypecheckResult => {
  const objectNodes = collectNodes(document.children).filter(isObjectNode);
  const objectIndex = createObjectIndex(objectNodes);
  const accumulator = createAccumulator();

  for (const node of objectNodes) {
    processObjectNode(node, objectIndex, accumulator);
  }

  accumulator.diagnostics.push(...accumulator.stepGraphDiagnostics);

  const typedGraph: TypedSemanticGraph = {
    documentId: document.meta.id,
    nodes: accumulator.nodes,
    quantities: accumulator.quantities,
    diagnostics: accumulator.diagnostics
  };

  return {
    document,
    typedGraph,
    stepGraph: buildStepGraph(accumulator),
    diagnostics: accumulator.diagnostics
  };
};

export const buildTypedSemanticGraph = (document: ChemdDocument): TypedSemanticGraph =>
  typecheckDocument(document).typedGraph;

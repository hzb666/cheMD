import type {
  ChemdDeclaration,
  ChemdProgramDocument
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalProcedureControlNode,
  CanonicalStepNode,
  ProcedureLoweringResult,
  StepGraph
} from "@chemd/step-ontology";

import { buildAgentRunNode } from "./program-agent-graph";
import {
  buildTypedFieldNode,
  collectDeclarationQuantities
} from "./program-field-graph";
import {
  buildProcedureDeclaration,
  type ProcedureBuildResult
} from "./program-procedure-graph";
import type { ProgramFieldDeclaration, ProgramSymbolTable } from "./program-utils";
import type {
  QuantityType,
  TypedSemanticGraph,
  TypedSemanticNode
} from "./types";

interface ProgramGraphResult {
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
}

export const buildProgramTypedGraph = (
  program: ChemdProgramDocument,
  symbols: ProgramSymbolTable,
  diagnostics: V03Diagnostic[]
): ProgramGraphResult => {
  const quantities: QuantityType[] = [];
  const typedNodes: TypedSemanticNode[] = [];
  const procedureResults: ProcedureLoweringResult[] = [];
  const stepGraphSteps: CanonicalStepNode[] = [];
  const stepGraphControls: CanonicalProcedureControlNode[] = [];
  const stepDiagnostics: V03Diagnostic[] = [];

  for (const declaration of program.declarations) {
    const built = buildDeclarationNodes(declaration, symbols);
    typedNodes.push(...built.nodes);
    quantities.push(...built.quantities);
    diagnostics.push(...built.diagnostics);
    if (built.procedure) {
      procedureResults.push(built.procedure.lowering);
      typedNodes.push(...built.procedure.typedSteps);
      quantities.push(...built.procedure.quantities);
      stepGraphSteps.push(...built.procedure.lowering.steps);
      stepGraphControls.push(...(built.procedure.lowering.controls ?? []));
      stepDiagnostics.push(...built.procedure.lowering.diagnostics);
    }
  }

  diagnostics.push(...stepDiagnostics);
  return createGraphResult(program.meta.id, typedNodes, quantities, diagnostics, {
    steps: stepGraphSteps,
    controls: stepGraphControls,
    procedures: procedureResults,
    observations: [],
    diagnostics: stepDiagnostics
  });
};

const createGraphResult = (
  documentId: string,
  nodes: TypedSemanticNode[],
  quantities: QuantityType[],
  diagnostics: V03Diagnostic[],
  stepGraph: StepGraph
): ProgramGraphResult => ({
  typedGraph: { documentId, nodes, quantities, diagnostics },
  stepGraph
});

const buildDeclarationNodes = (
  declaration: ChemdDeclaration,
  symbols: ProgramSymbolTable
): {
  nodes: TypedSemanticNode[];
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
  procedure?: ProcedureBuildResult;
} => {
  if (declaration.kind === "procedure") {
    return buildProcedureDeclaration(declaration, symbols);
  }
  if (declaration.kind === "agent_run") {
    return { nodes: [buildAgentRunNode(declaration)], quantities: [], diagnostics: [] };
  }
  if (!("fields" in declaration)) {
    return { nodes: [], quantities: [], diagnostics: [] };
  }
  return buildFieldDeclarationNode(declaration, symbols);
};

const buildFieldDeclarationNode = (
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
) => ({
  nodes: [buildTypedFieldNode(declaration, symbols)],
  quantities: collectDeclarationQuantities(declaration),
  diagnostics: []
});

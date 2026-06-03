import type { ChemdProgramDocument } from "@chemd/core";
import type { Diagnostic } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { validateProgramAgentRuns } from "./program-agent";
import { buildProgramTypedGraph } from "./program-graph";
import { augmentProgramReactionRouteGraph } from "./program-reaction-routes";
import {
  buildProgramSymbolTable
} from "./program-utils";
import { validateProgramDeclarationSchemas } from "./program-validation";
import type {
  TypecheckOptions,
  TypecheckResult,
  TypedSemanticGraph
} from "./types";

export * from "./types";

const DIAGNOSTIC_SOURCE_LAYERS = new Set<V03Diagnostic["sourceLayer"]>([
  "frontmatter",
  "parser",
  "resolver",
  "typechecker",
  "lowering",
  "procedure_lowering",
  "runtime_preflight",
  "export",
  "training_export"
]);

const toDiagnosticSourceLayer = (
  sourceLayer: string | undefined
): V03Diagnostic["sourceLayer"] =>
  DIAGNOSTIC_SOURCE_LAYERS.has(sourceLayer as V03Diagnostic["sourceLayer"])
    ? sourceLayer as V03Diagnostic["sourceLayer"]
    : "parser";

const toTypecheckDiagnostic = (diagnostic: Diagnostic): V03Diagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  sourceLayer: toDiagnosticSourceLayer(diagnostic.sourceLayer),
  ...(diagnostic.position ? { position: diagnostic.position } : {}),
  ...(diagnostic.sourceSpan ? { sourceSpan: diagnostic.sourceSpan } : {}),
  ...(diagnostic.nodeId ? { nodeId: diagnostic.nodeId } : {}),
  ...(diagnostic.sourceNodeType ? { sourceNodeType: diagnostic.sourceNodeType } : {}),
  ...(diagnostic.sourceNodeId ? { sourceNodeId: diagnostic.sourceNodeId } : {}),
  ...(diagnostic.sourceField ? { sourceField: diagnostic.sourceField } : {}),
  ...(diagnostic.facts ? { facts: diagnostic.facts } : {})
});

export const typecheckProgram = (
  program: ChemdProgramDocument,
  options: TypecheckOptions = {}
): TypecheckResult => {
  const diagnostics = program.diagnostics.map(toTypecheckDiagnostic);
  const symbols = buildProgramSymbolTable(program);
  diagnostics.push(
    ...validateProgramDeclarationSchemas(program.declarations),
    ...validateProgramAgentRuns(program, symbols)
  );
  const { typedGraph: baseGraph, stepGraph } = buildProgramTypedGraph(program, symbols, diagnostics);
  const routeAugmentation = augmentProgramReactionRouteGraph({
    documentId: program.meta.id,
    nodes: baseGraph.nodes,
    symbols,
    options
  });
  diagnostics.push(...routeAugmentation.diagnostics);
  const typedGraph: TypedSemanticGraph = {
    ...baseGraph,
    nodes: routeAugmentation.nodes,
    diagnostics
  };

  return {
    program,
    document: program,
    typedGraph,
    stepGraph,
    diagnostics
  };
};

export const typecheckDocument = typecheckProgram;

export const buildTypedSemanticGraph = (
  program: ChemdProgramDocument,
  options: TypecheckOptions = {}
): TypedSemanticGraph =>
  typecheckProgram(program, options).typedGraph;

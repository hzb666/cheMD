import type { ProgramConditionExpression } from "@chemd/core";
import type { ChemdTrainingGraphIndexV1 } from "@chemd/exporter-training";
import type { CanonicalProcedureControlNode } from "@chemd/step-ontology";

import type { LinkedChemdModule } from "./module-linker";

type GraphNode = ChemdTrainingGraphIndexV1["nodes"][number];
type GraphEdge = ChemdTrainingGraphIndexV1["edges"][number];

interface RuntimeSymbol {
  label: string;
  namespace: string;
  nodeId: string;
  path: string;
}

export const createControlRuntimeGraph = (
  module: LinkedChemdModule
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const controls = module.coreResult.stepGraph.controls ?? [];
  const runtimeSymbols = uniqueRuntimeSymbols(controls.flatMap((control) =>
    collectRuntimeSymbols(module.documentId, control.condition)
  ));

  return {
    nodes: [
      ...controls.map((control) => createControlNode(module, control)),
      ...runtimeSymbols.map((symbol) => createRuntimeSymbolNode(module.documentId, symbol))
    ],
    edges: [
      ...controls.map((control) => createProcedureControlEdge(module, control)),
      ...controls.flatMap((control) => createRuntimeReadEdges(module, control))
    ]
  };
};

const createControlNode = (
  module: LinkedChemdModule,
  control: CanonicalProcedureControlNode
): GraphNode => ({
  node_id: controlNodeId(module.documentId, control),
  node_type: "procedure_control",
  document_id: module.documentId,
  entity_id: controlNodeId(module.documentId, control),
  label: `${control.kind} ${control.controlId}`,
  original_id: control.controlId,
  properties: {
    control_kind: control.kind,
    dynamic: control.dynamic,
    procedure_id: procedureIdForControl(control)
  }
});

const createRuntimeSymbolNode = (
  documentId: string,
  symbol: RuntimeSymbol
): GraphNode => ({
  node_id: symbol.nodeId,
  node_type: "runtime_symbol",
  document_id: documentId,
  entity_id: symbol.nodeId,
  label: symbol.label,
  original_id: symbol.label,
  properties: {
    namespace: symbol.namespace,
    path: symbol.path
  }
});

const createProcedureControlEdge = (
  module: LinkedChemdModule,
  control: CanonicalProcedureControlNode
): GraphEdge =>
  createEdge(
    "procedure_has_control",
    `proc::${module.documentId}::${procedureIdForControl(control)}`,
    controlNodeId(module.documentId, control),
    module.documentId
  );

const createRuntimeReadEdges = (
  module: LinkedChemdModule,
  control: CanonicalProcedureControlNode
): GraphEdge[] =>
  collectRuntimeSymbols(module.documentId, control.condition).map((symbol) =>
    createEdge(
      "control_reads_runtime_signal",
      controlNodeId(module.documentId, control),
      symbol.nodeId,
      module.documentId
    )
  );

const collectRuntimeSymbols = (
  documentId: string,
  expression: ProgramConditionExpression | undefined
): RuntimeSymbol[] => {
  if (!expression) return [];
  if (expression.kind === "runtime_reference") {
    const label = `${expression.namespace}.${expression.path}`;
    return [{
      label,
      namespace: expression.namespace,
      nodeId: `runtime::${documentId}::${label}`,
      path: expression.path
    }];
  }
  if (expression.kind === "binary") {
    return [
      ...collectRuntimeSymbols(documentId, expression.left),
      ...collectRuntimeSymbols(documentId, expression.right)
    ];
  }
  if (expression.kind === "unary") {
    return collectRuntimeSymbols(documentId, expression.argument);
  }
  if (expression.kind === "list") {
    return expression.items.flatMap((item) => collectRuntimeSymbols(documentId, item));
  }
  return [];
};

const uniqueRuntimeSymbols = (symbols: RuntimeSymbol[]): RuntimeSymbol[] =>
  uniqueBy(symbols, (symbol) => symbol.nodeId);

const controlNodeId = (
  documentId: string,
  control: CanonicalProcedureControlNode
): string => `control::${documentId}::${procedureIdForControl(control)}::${control.controlId}`;

const procedureIdForControl = (
  control: CanonicalProcedureControlNode
): string => control.source.sourceNodeId ?? "procedure";

const createEdge = (
  edgeType: string,
  fromNodeId: string,
  toNodeId: string,
  documentId: string
): GraphEdge => ({
  edge_id: `workspace::${edgeType}::${fromNodeId}::${toNodeId}`,
  edge_type: edgeType,
  from_node_id: fromNodeId,
  to_node_id: toNodeId,
  document_id: documentId,
  confidence: 1,
  properties: {
    edge_source: "workspace_linker"
  }
});

const uniqueBy = <TItem>(
  items: TItem[],
  keyOf: (item: TItem) => string
): TItem[] => {
  const seen = new Set<string>();
  const result: TItem[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

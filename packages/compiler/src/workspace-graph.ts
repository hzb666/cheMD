import type { ReferenceTargetKind } from "@chemd/core";
import {
  buildTrainingGraphIndexFromUnderstandings,
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument,
  type ChemdTrainingGraphIndexV1
} from "@chemd/exporter-training";
import type { ReferenceOrLiteral, TypedSemanticNode } from "@chemd/typechecker";

import type {
  LinkChemdModulesResult,
  LinkedChemdModule
} from "./module-linker";
import {
  declarationNodeId,
  docNodeId,
  entityNodeId,
  findModule,
  hasWorkspaceGraphNode,
  nodeTypeForDeclaration,
  readDeclarationLabel,
  resolveReference
} from "./workspace-graph-helpers";
import { createControlRuntimeGraph } from "./workspace-graph-runtime";
import {
  createRuntimeTraceGraph,
  type WorkspaceRuntimeTraceInput
} from "./workspace-graph-trace";

type GraphNode = ChemdTrainingGraphIndexV1["nodes"][number];
type GraphEdge = ChemdTrainingGraphIndexV1["edges"][number];

export interface WorkspaceTrainingGraphOptions {
  runtimeTraces?: WorkspaceRuntimeTraceInput[];
}

export const buildWorkspaceTrainingGraphIndex = (
  linked: LinkChemdModulesResult,
  options: WorkspaceTrainingGraphOptions = {}
): ChemdTrainingGraphIndexV1 => {
  const understandings = linked.modules.map((module) => buildTrainingUnderstandingFromRecord(
    exportTrainingRecordFromDocument(module.coreResult.program, {
      lnf: module.coreResult.lnf,
      stepGraph: module.coreResult.stepGraph,
      typedGraph: module.coreResult.typedSemanticGraph
    })
  ));
  const base = buildTrainingGraphIndexFromUnderstandings(understandings, {
    document_sources: linked.modules.map((module) => ({
      document_id: module.documentId,
      ...(module.input.path ? { file_path: module.input.path } : {})
    }))
  });
  const overlay = buildWorkspaceOverlay(linked, options);

  return {
    ...base,
    nodes: uniqueBy(base.nodes, overlay.nodes, (node) => node.node_id),
    edges: uniqueBy(base.edges, overlay.edges, (edge) => edge.edge_id)
  };
};

const buildWorkspaceOverlay = (
  linked: LinkChemdModulesResult,
  options: WorkspaceTrainingGraphOptions
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const nodes = linked.modules.flatMap(createWorkspaceNodes);
  const controlRuntimeGraphs = linked.modules.map(createControlRuntimeGraph);
  const runtimeTraceGraph = createRuntimeTraceGraph(linked, options.runtimeTraces ?? []);
  const importEdges = linked.importGraph.edges.flatMap((edge) => {
    const from = findModule(linked, edge.fromModule);
    const to = edge.toModule ? findModule(linked, edge.toModule) : undefined;
    return from && to
      ? [createEdge("document_imports_document", docNodeId(from.documentId), docNodeId(to.documentId), from.documentId, {
          alias: edge.alias ?? null,
          import_from: edge.importFrom,
          import_module: edge.importModuleName
        })]
      : [];
  });
  const semanticEdges = linked.modules.flatMap((module) => createModuleSemanticEdges(module, linked));

  return {
    nodes: [
      ...nodes,
      ...controlRuntimeGraphs.flatMap((graph) => graph.nodes),
      ...runtimeTraceGraph.nodes
    ],
    edges: [
      ...importEdges,
      ...semanticEdges,
      ...controlRuntimeGraphs.flatMap((graph) => graph.edges),
      ...runtimeTraceGraph.edges
    ]
  };
};

const createWorkspaceNodes = (module: LinkedChemdModule): GraphNode[] =>
  module.coreResult.program.declarations.flatMap((declaration) => {
    if (!hasWorkspaceGraphNode(declaration)) return [];
    return [{
      node_id: declarationNodeId(module.documentId, declaration),
      node_type: nodeTypeForDeclaration(declaration),
      document_id: module.documentId,
      entity_id: declarationNodeId(module.documentId, declaration),
      label: readDeclarationLabel(declaration),
      original_id: declaration.id,
      properties: {
        module_name: module.moduleName
      }
    }];
  });

const createModuleSemanticEdges = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult
): GraphEdge[] =>
  module.coreResult.typedSemanticGraph.nodes.flatMap((node) => {
    if (node.kind === "reaction") return createReactionEdges(module, linked, node);
    if (node.kind === "condition_screen") return createConditionScreenEdges(module, linked, node);
    if (node.kind === "step") return createProcedureStepEdges(module, linked, node);
    return [];
  });

const createReactionEdges = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult,
  node: Extract<TypedSemanticNode, { kind: "reaction" }>
): GraphEdge[] => {
  const reactionId = entityNodeId("rxn", module.documentId, node.nodeId);
  return [
    ...createReactionUseEdges(module, linked, reactionId, node.reactants, "reactants"),
    ...createReactionUseEdges(module, linked, reactionId, node.reagents, "reagents"),
    ...createReactionUseEdges(module, linked, reactionId, node.catalyst, "catalyst"),
    ...createReactionUseEdges(module, linked, reactionId, node.solvent, "solvent"),
    ...createReferenceEdges({
      edgeType: "reaction_produces_imported_product",
      fromNodeId: reactionId,
      linked,
      module,
      references: node.products,
      targetKinds: ["molecule", "batch", "sample"]
    }),
    ...createReferenceEdges({
      edgeType: "reaction_instantiates_template",
      fromNodeId: reactionId,
      linked,
      module,
      references: node.template ? [node.template] : [],
      targetKinds: ["template"]
    }),
    ...node.prev.flatMap((reference) => createPrevReactionEdges(module, linked, reactionId, reference))
  ];
};

const REACTION_USE_TARGETS = new Set<ReferenceTargetKind>([
  "molecule",
  "material",
  "batch"
]);

const createReactionUseEdges = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult,
  reactionId: string,
  references: ReferenceOrLiteral[],
  field: "reactants" | "reagents" | "catalyst" | "solvent"
): GraphEdge[] =>
  references.flatMap((reference) => {
    const target = resolveReference(module, linked, reference);
    if (!target || !REACTION_USE_TARGETS.has(target.targetKind)) return [];
    return [createEdge(
      `reaction_uses_imported_${target.targetKind}`,
      reactionId,
      target.nodeId,
      module.documentId,
      { field }
    )];
  });

const createConditionScreenEdges = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult,
  node: Extract<TypedSemanticNode, { kind: "condition_screen" }>
): GraphEdge[] => {
  const screenId = entityNodeId("condition_screen", module.documentId, node.nodeId);
  return [
    ...createReferenceEdges({
      edgeType: "condition_screen_compares_reaction",
      fromNodeId: screenId,
      linked,
      module,
      references: node.reaction ? [node.reaction] : [],
      targetKinds: ["reaction"]
    }),
    ...createReferenceEdges({
      edgeType: "condition_screen_uses_standard",
      fromNodeId: screenId,
      linked,
      module,
      references: node.standard ? [node.standard] : [],
      targetKinds: ["reaction", "result"]
    })
  ];
};

const STEP_REFERENCE_TARGETS = new Set<ReferenceTargetKind>([
  "molecule",
  "material",
  "batch",
  "sample"
]);

const createProcedureStepEdges = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult,
  node: Extract<TypedSemanticNode, { kind: "step" }>
): GraphEdge[] => {
  const procedureId = node.source.sourceNodeId ?? "procedure";
  const stepId = entityNodeId("step", module.documentId, `${procedureId}::${node.stepId}`);

  return (node.inputs ?? []).flatMap((input) => {
    if (!input.reference) return [];
    const target = resolveReference(module, linked, input.reference);
    if (!target || !STEP_REFERENCE_TARGETS.has(target.targetKind)) return [];
    return [createEdge(
      `procedure_step_uses_${target.targetKind}`,
      stepId,
      target.nodeId,
      module.documentId,
      { raw: input.raw }
    )];
  });
};

const createPrevReactionEdges = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult,
  reactionId: string,
  reference: ReferenceOrLiteral
): GraphEdge[] => {
  const target = resolveReference(module, linked, reference);
  if (!target || target.targetKind !== "reaction") return [];
  return [
    createEdge("reaction_has_previous_reaction", reactionId, target.nodeId, module.documentId),
    createEdge("reaction_depends_on_reaction", reactionId, target.nodeId, module.documentId),
    createEdge("reaction_precedes_reaction", target.nodeId, reactionId, target.documentId)
  ];
};

const createReferenceEdges = (input: {
  edgeType: string;
  fromNodeId: string;
  linked: LinkChemdModulesResult;
  module: LinkedChemdModule;
  references: ReferenceOrLiteral[];
  targetKinds: ReferenceTargetKind[];
}): GraphEdge[] =>
  input.references.flatMap((reference) => {
    const target = resolveReference(input.module, input.linked, reference);
    return target && input.targetKinds.includes(target.targetKind)
      ? [createEdge(input.edgeType, input.fromNodeId, target.nodeId, input.module.documentId)]
      : [];
  });

const createEdge = (
  edgeType: string,
  fromNodeId: string,
  toNodeId: string,
  documentId: string,
  properties: GraphEdge["properties"] = {}
): GraphEdge => ({
  edge_id: `workspace::${edgeType}::${fromNodeId}::${toNodeId}`,
  edge_type: edgeType,
  from_node_id: fromNodeId,
  to_node_id: toNodeId,
  document_id: documentId,
  confidence: 1,
  properties: {
    edge_source: "workspace_linker",
    ...properties
  }
});

const uniqueBy = <TItem>(
  first: TItem[],
  second: TItem[],
  keyOf: (item: TItem) => string
): TItem[] => {
  const seen = new Set<string>();
  const merged: TItem[] = [];
  for (const item of [...first, ...second]) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
};

import { compileChemdForEditor } from "./compile";
import {
  asRecord,
  confidenceFromScore,
  createEdge,
  createNode,
  indexGraphNodes,
  makeId,
  readEntityRange,
  readString,
  routeEdgeType
} from "./graph-rag-helpers";
import type {
  BuildEditorGraphRagRecordsInput,
  EditorGraphRagCitationCandidate,
  EditorGraphRagEdge,
  EditorGraphRagNode,
  EditorGraphRagRecords,
  EditorGraphRagSourceRange,
  EntityCandidate,
  GraphBuildContext
} from "./graph-rag-types";
import {
  buildBlockRangeMap,
  createDocumentRange,
  createSourceHash
} from "./ranges";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdOutlineItem
} from "./types";

const createOutlineNode = (
  context: GraphBuildContext,
  item: ChemdOutlineItem
): EditorGraphRagNode => createNode({
  context,
  nodeKind: item.kind === "metadata" ? "metadata" : "block",
  entityId: item.id,
  sourceRange: item.range,
  payload: { label: item.label, outline_kind: item.kind },
  blockId: item.kind === "metadata" ? undefined : item.id
});

const collectEntityCandidates = (
  output: Extract<ChemdLanguageCompileOutput, { status: "ok" }>,
  blockRanges: Map<string, EditorGraphRagSourceRange>,
  fallback: EditorGraphRagSourceRange
): EntityCandidate[] => {
  const semantic = output.result.trainingExport.semantic_layer;
  const groups = [
    ["molecule", semantic.molecules],
    ["reaction", semantic.reactions],
    ["result", semantic.results],
    ["analysis", semantic.analyses],
    ["sample", semantic.samples],
    ["artifact", semantic.artifacts],
    ["condition_variation", semantic.condition_variations],
    ["condition_variation_attempt", semantic.condition_variation_attempts],
    ["documentation", semantic.documentation_blocks]
  ] as const;

  return groups.flatMap(([kind, entities]) => entities.flatMap((entity) => {
    const payload = asRecord(entity);
    const entityId = readString(payload, "entity_id") ?? readString(payload, "doc_id");
    if (!entityId) {
      return [];
    }
    return [{
      entityId,
      kind,
      sourceRange: readEntityRange(payload, blockRanges, fallback),
      payload,
      originalId: readString(payload, "original_id") ?? readString(payload, "doc_id")
    }];
  }));
};

const buildNodes = (
  output: ChemdLanguageCompileOutput,
  context: GraphBuildContext
): EditorGraphRagNode[] => {
  const documentNode = createNode({
    context,
    nodeKind: "document",
    entityId: context.input.experimentId,
    sourceRange: context.documentRange,
    payload: {
      document_uri: context.input.documentUri,
      source_hash: createSourceHash(context.input.source)
    }
  });
  const outlineNodes = output.outline.map((item) => createOutlineNode(context, item));
  const entityNodes = [...context.entityById.values()].map((entity) => createNode({
    context,
    nodeKind: "entity",
    entityId: entity.entityId,
    sourceRange: entity.sourceRange,
    payload: { ...entity.payload, entity_kind: entity.kind },
    blockId: entity.originalId
  }));
  const diagnosticNodes = output.diagnostics.map((diagnostic, index) => createDiagnosticNode(context, diagnostic, index));
  return [documentNode, ...outlineNodes, ...entityNodes, ...diagnosticNodes];
};

const createDiagnosticNode = (
  context: GraphBuildContext,
  diagnostic: ChemdEditorDiagnostic,
  index: number
): EditorGraphRagNode => createNode({
  context,
  nodeKind: "diagnostic",
  entityId: makeId("diagnostic", String(index), diagnostic.code),
  sourceRange: diagnostic.range,
  payload: {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    source_node_id: diagnostic.sourceNodeId
  },
  blockId: diagnostic.sourceNodeId
});

const buildOrderEdges = (
  context: GraphBuildContext,
  nodes: readonly EditorGraphRagNode[]
): EditorGraphRagEdge[] => nodes.slice(1).map((node, index) => createEdge({
  context,
  edgeType: "document_order",
  fromNodeId: nodes[index].nodeId,
  toNodeId: node.nodeId,
  confidence: "high",
  evidence: { source: "editor_outline_order" }
}));

const buildContainmentEdges = (context: GraphBuildContext): EditorGraphRagEdge[] =>
  [...context.entityById.values()].flatMap((entity) => {
    const blockNode = entity.originalId ? context.nodeByBlockId.get(entity.originalId) : undefined;
    const entityNode = context.nodeByEntityId.get(entity.entityId);
    if (!blockNode || !entityNode) {
      return [];
    }
    return [createEdge({
      context,
      edgeType: "block_contains_entity",
      fromNodeId: blockNode.nodeId,
      toNodeId: entityNode.nodeId,
      confidence: "high",
      evidence: {
        source: "training_export_entity_original_id",
        block_id: entity.originalId,
        entity_id: entity.entityId
      }
    })];
  });

const buildRouteEdges = (
  output: Extract<ChemdLanguageCompileOutput, { status: "ok" }>,
  context: GraphBuildContext
): EditorGraphRagEdge[] => output.result.trainingExport.semantic_layer.links.flatMap((relation) => {
  const payload = asRecord(relation);
  const edgeType = routeEdgeType(payload.relation_type);
  const from = readString(payload, "from_entity_id");
  const to = readString(payload, "to_entity_id");
  if (!edgeType || !from || !to) {
    return [];
  }
  const fromNode = context.nodeByEntityId.get(from);
  const toNode = context.nodeByEntityId.get(to);
  if (!fromNode || !toNode) {
    return [];
  }
  return [createEdge({
    context,
    edgeType,
    fromNodeId: fromNode.nodeId,
    toNodeId: toNode.nodeId,
    confidence: confidenceFromScore(payload.confidence),
    evidence: {
      source: "training_export_semantic_relation",
      relation
    }
  })];
});

const findDiagnosticSourceNode = (
  context: GraphBuildContext,
  diagnostic: ChemdEditorDiagnostic
): EditorGraphRagNode | undefined => {
  const sourceNodeId = diagnostic.sourceNodeId;
  return sourceNodeId
    ? context.nodeByBlockId.get(sourceNodeId) ?? [...context.entityById.values()]
      .map((entity) => entity.originalId === sourceNodeId ? context.nodeByEntityId.get(entity.entityId) : undefined)
      .find(Boolean)
    : context.nodeByEntityId.get(context.input.experimentId);
};

const buildDiagnosticEdges = (
  output: ChemdLanguageCompileOutput,
  context: GraphBuildContext
): EditorGraphRagEdge[] => output.diagnostics.flatMap((diagnostic, index) => {
  const sourceNode = findDiagnosticSourceNode(context, diagnostic);
  const diagnosticNode = context.nodeByEntityId.get(makeId("diagnostic", String(index), diagnostic.code));
  if (!sourceNode || !diagnosticNode) {
    return [];
  }
  return [createEdge({
    context,
    edgeType: "diagnostic_evidence",
    fromNodeId: sourceNode.nodeId,
    toNodeId: diagnosticNode.nodeId,
    confidence: sourceNode.nodeKind === "document" ? "low" : "high",
    evidence: {
      source: "editor_diagnostic_range",
      diagnostic_code: diagnostic.code,
      source_node_id: diagnostic.sourceNodeId,
      source_range: diagnostic.range
    }
  })];
});

const buildEdges = (
  output: ChemdLanguageCompileOutput,
  context: GraphBuildContext,
  nodes: readonly EditorGraphRagNode[]
): EditorGraphRagEdge[] => {
  const outlineNodes = nodes.filter((node) => node.nodeKind === "metadata" || node.nodeKind === "block");
  return [
    ...buildOrderEdges(context, outlineNodes),
    ...buildContainmentEdges(context),
    ...(output.status === "ok" ? buildRouteEdges(output, context) : []),
    ...buildDiagnosticEdges(output, context)
  ];
};

const buildCitationCandidates = (
  output: ChemdLanguageCompileOutput,
  context: GraphBuildContext
): EditorGraphRagCitationCandidate[] => {
  if (output.status !== "ok") {
    return [];
  }
  return output.result.ragExport.chunks.map((chunk) => {
    const entityId = chunk.source_entity_ids.find((id) => context.entityById.has(id));
    const entity = entityId ? context.entityById.get(entityId) : undefined;
    const sourceRange = entity?.sourceRange ?? context.documentRange;
    return {
      citationId: makeId(context.input.revisionId, "citation", chunk.chunk_id),
      revisionId: context.input.revisionId,
      chunkId: chunk.chunk_id,
      experimentId: context.input.experimentId,
      documentUri: context.input.documentUri,
      entityId,
      blockId: entity?.originalId,
      sourceRange,
      citation: {
        experimentId: context.input.experimentId,
        revisionId: context.input.revisionId,
        chunkId: chunk.chunk_id,
        documentUri: context.input.documentUri,
        entityId,
        sourceRange
      },
      quality: {
        rag_eligible: output.result.ragExport.quality.rag_eligible,
        source_entity_ids: chunk.source_entity_ids,
        range_source: entity ? "source_entity" : "document_fallback",
        confidence: entity ? "high" : "low"
      },
      createdAt: context.input.createdAt
    };
  });
};

const buildCompileOutput = (
  input: BuildEditorGraphRagRecordsInput
): ChemdLanguageCompileOutput => input.compileOutput ?? compileChemdForEditor({
  source: input.source,
  documentUri: input.documentUri,
  options: input.options
}, {
  ...input.dependencies,
  now: input.dependencies?.now ?? (() => new Date(input.createdAt))
});

export const buildEditorGraphRagRecords = (
  input: BuildEditorGraphRagRecordsInput
): EditorGraphRagRecords => {
  const compileOutput = buildCompileOutput(input);
  const documentRange = createDocumentRange(input.source);
  const blockRanges = buildBlockRangeMap(input.source);
  const entities = compileOutput.status === "ok"
    ? collectEntityCandidates(compileOutput, blockRanges, documentRange)
    : [];
  const context: GraphBuildContext = {
    graphSnapshotId: input.graphSnapshotId ?? `${input.revisionId}::editor-graph-rag`,
    input,
    documentRange,
    entityById: new Map(entities.map((entity) => [entity.entityId, entity])),
    nodeByBlockId: new Map(),
    nodeByEntityId: new Map()
  };
  const reactionGraphNodes = buildNodes(compileOutput, context);
  indexGraphNodes(context, reactionGraphNodes);
  const reactionGraphEdges = buildEdges(compileOutput, context, reactionGraphNodes);
  const ragCitationCandidates = buildCitationCandidates(compileOutput, context);
  return {
    compileOutput,
    graphSnapshot: {
      graphSnapshotId: context.graphSnapshotId,
      experimentId: input.experimentId,
      sourceRevisionIds: [input.revisionId],
      graphKind: "reaction",
      nodeCount: reactionGraphNodes.length,
      edgeCount: reactionGraphEdges.length,
      createdAt: input.createdAt
    },
    reactionGraphNodes,
    reactionGraphEdges,
    ragCitationCandidates
  };
};

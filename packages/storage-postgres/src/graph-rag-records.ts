import type {
  BuildPostgresGraphRagStorageInput,
  PostgresCitationRecord,
  PostgresGraphRagStorageRecords,
  PostgresRagChunkCitationRecord,
  PostgresReactionGraphEdgeRecord,
  PostgresReactionGraphEdgeType,
  PostgresReactionGraphNodeRecord,
  PostgresReactionGraphSnapshotRecord,
  PostgresSourceRangeRecord
} from "./graph-rag-types";
import type { JsonRecord } from "./types";

const toJsonRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : { value };

const assertSourceRange = (
  range: PostgresSourceRangeRecord | undefined,
  ownerId: string
): PostgresSourceRangeRecord => {
  if (!range) {
    throw new Error(`Missing source range for ${ownerId}`);
  }
  return range;
};

const isSourceRange = (value: unknown): value is PostgresSourceRangeRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const firstSourceRange = (value: unknown): PostgresSourceRangeRecord | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return Object.values(value).find(isSourceRange);
};

const findCompiledEntitySourceRange = (
  input: BuildPostgresGraphRagStorageInput,
  entityId: string
): PostgresSourceRangeRecord | undefined => {
  const semanticLayer = input.trainingExport.semantic_layer;
  const groups = [
    semanticLayer.molecules,
    semanticLayer.reactions,
    semanticLayer.results,
    semanticLayer.analyses,
    semanticLayer.samples,
    semanticLayer.artifacts,
    semanticLayer.condition_variations,
    semanticLayer.condition_variation_attempts,
    semanticLayer.markdown_blocks
  ] as readonly unknown[][];
  const entity = groups.flat().find((item) =>
    toJsonRecord(item).entity_id === entityId
  );
  return firstSourceRange(toJsonRecord(entity).field_source_spans);
};

const resolveEntitySourceRange = (
  input: BuildPostgresGraphRagStorageInput,
  entityId: string
): PostgresSourceRangeRecord | undefined =>
  input.sourceRangesByEntityId?.[entityId] ?? findCompiledEntitySourceRange(input, entityId);

const buildCitation = (
  input: BuildPostgresGraphRagStorageInput,
  chunkId: string,
  entityId: string | undefined,
  sourceRange: PostgresSourceRangeRecord
): PostgresCitationRecord => ({
  experimentId: input.experimentId,
  revisionId: input.revisionId,
  chunkId,
  entityId,
  sourceRange
});

const getCreatedAt = (input: BuildPostgresGraphRagStorageInput): string =>
  input.createdAt ?? input.trainingExport.exported_at;

const buildGraphSnapshot = (
  input: BuildPostgresGraphRagStorageInput,
  createdAt: string
): PostgresReactionGraphSnapshotRecord | undefined => {
  if (!input.graphIndex) {
    return undefined;
  }
  return {
    graphSnapshotId: input.graphSnapshotId ?? `${input.revisionId}::reaction-graph`,
    experimentId: input.experimentId,
    sourceRevisionIds: [input.revisionId],
    graphKind: input.graphKind ?? "reaction",
    nodeCount: input.graphIndex.reaction_features.length,
    edgeCount: input.graphIndex.reaction_similarity_edges.length + input.graphIndex.edges.length,
    createdAt
  };
};

const buildReactionGraphNodes = (
  input: BuildPostgresGraphRagStorageInput,
  graphSnapshot: PostgresReactionGraphSnapshotRecord | undefined,
  createdAt: string
): PostgresReactionGraphNodeRecord[] => {
  if (!input.graphIndex || !graphSnapshot) {
    return [];
  }
  return input.graphIndex.reaction_features.map((feature) => ({
    nodeId: feature.reaction_entity_id,
    graphSnapshotId: graphSnapshot.graphSnapshotId,
    experimentId: input.experimentId,
    revisionId: input.revisionId,
    entityId: feature.reaction_entity_id,
    reactionFamily: feature.reaction_family,
    routeId: feature.route_id,
    sourceRange: assertSourceRange(
      resolveEntitySourceRange(input, feature.reaction_entity_id),
      feature.reaction_entity_id
    ),
    payload: toJsonRecord(feature),
    createdAt
  }));
};

const confidenceFromScore = (
  score: number | null | undefined
): PostgresReactionGraphEdgeRecord["confidence"] => {
  if (score == null) {
    return "unknown";
  }
  return score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low";
};

const allowedGraphEdgeTypes = new Set<PostgresReactionGraphEdgeType>([
  "route_prev",
  "route_next",
  "same_family",
  "same_condition_signature",
  "same_substrate",
  "same_product",
  "campaign_trajectory",
  "semantic_similarity",
  "evidence_link"
]);

const toGraphEdgeType = (edgeType: string): PostgresReactionGraphEdgeType =>
  allowedGraphEdgeTypes.has(edgeType as PostgresReactionGraphEdgeType)
    ? edgeType as PostgresReactionGraphEdgeType
    : "evidence_link";

const buildSimilarityEdges = (
  input: BuildPostgresGraphRagStorageInput,
  graphSnapshotId: string,
  createdAt: string
): PostgresReactionGraphEdgeRecord[] =>
  input.graphIndex?.reaction_similarity_edges.map((edge) => ({
    edgeId: edge.edge_id,
    graphSnapshotId,
    experimentId: input.experimentId,
    fromNodeId: edge.from_reaction_entity_id,
    toNodeId: edge.to_reaction_entity_id,
    edgeType: "semantic_similarity",
    confidence: confidenceFromScore(edge.score),
    evidence: {
      source: "chemd_training_graph_index",
      experiment_id: input.experimentId,
      revision_id: input.revisionId,
      basis: edge.basis,
      warnings: edge.warnings,
      source_ranges: [
        resolveEntitySourceRange(input, edge.from_reaction_entity_id),
        resolveEntitySourceRange(input, edge.to_reaction_entity_id)
      ].filter(Boolean)
    },
    createdAt
  })) ?? [];

const buildIndexEdges = (
  input: BuildPostgresGraphRagStorageInput,
  graphSnapshotId: string,
  createdAt: string
): PostgresReactionGraphEdgeRecord[] =>
  input.graphIndex?.edges.map((edge) => ({
    edgeId: edge.edge_id,
    graphSnapshotId,
    experimentId: input.experimentId,
    fromNodeId: edge.from_node_id,
    toNodeId: edge.to_node_id,
    edgeType: toGraphEdgeType(edge.edge_type),
    confidence: confidenceFromScore(edge.confidence),
    evidence: input.graphEdgeEvidenceByEdgeId?.[edge.edge_id] ?? {
      source: "chemd_training_graph_index",
      experiment_id: input.experimentId,
      revision_id: input.revisionId,
      document_id: edge.document_id,
      properties: edge.properties ?? {}
    },
    createdAt
  })) ?? [];

const buildReactionGraphEdges = (
  input: BuildPostgresGraphRagStorageInput,
  graphSnapshot: PostgresReactionGraphSnapshotRecord | undefined,
  createdAt: string
): PostgresReactionGraphEdgeRecord[] => {
  if (!graphSnapshot) {
    return [];
  }
  return [
    ...buildSimilarityEdges(input, graphSnapshot.graphSnapshotId, createdAt),
    ...buildIndexEdges(input, graphSnapshot.graphSnapshotId, createdAt)
  ];
};

const buildRagChunkCitations = (
  input: BuildPostgresGraphRagStorageInput,
  createdAt: string
): PostgresRagChunkCitationRecord[] =>
  input.ragExport.chunks.map((chunk) => {
    const entityId = chunk.source_entity_ids[0];
    const sourceRange = assertSourceRange(
      input.sourceRangesByChunkId?.[chunk.chunk_id]
        ?? (entityId ? resolveEntitySourceRange(input, entityId) : undefined),
      chunk.chunk_id
    );
    return {
      revisionId: input.revisionId,
      chunkId: chunk.chunk_id,
      experimentId: input.experimentId,
      entityId,
      sourceRange,
      citation: buildCitation(input, chunk.chunk_id, entityId, sourceRange),
      quality: {
        rag_eligible: input.ragExport.quality.rag_eligible,
        source_entity_ids: chunk.source_entity_ids
      },
      createdAt
    };
  });

export const buildPostgresGraphRagStorageRecords = (
  input: BuildPostgresGraphRagStorageInput
): PostgresGraphRagStorageRecords => {
  const createdAt = getCreatedAt(input);
  const graphSnapshot = buildGraphSnapshot(input, createdAt);
  return {
    graphSnapshot,
    reactionGraphNodes: buildReactionGraphNodes(input, graphSnapshot, createdAt),
    reactionGraphEdges: buildReactionGraphEdges(input, graphSnapshot, createdAt),
    ragChunkCitations: buildRagChunkCitations(input, createdAt),
    agentRuns: [...(input.agentRuns ?? [])],
    agentToolCalls: [...(input.agentToolCalls ?? [])],
    patchProposals: [...(input.patchProposals ?? [])]
  };
};

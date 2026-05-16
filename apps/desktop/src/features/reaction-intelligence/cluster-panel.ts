import type { ChemdLanguageCompileOutput } from "@chemd/language-service";

export type ReactionClusterPanelState = "ready" | "fallback";

export type ReactionClusterPanelReason =
  | "compile_failed"
  | "missing_graph_index"
  | "no_reaction_clusters";

export interface ReactionClusterGraphSource {
  document_id: string;
  file_path?: string;
  content_hash?: string;
}

export interface ReactionGraphFeature {
  reaction_entity_id: string;
  document_id?: string;
  participant_signature?: string;
  reaction_family?: string;
}

export interface ReactionCluster {
  cluster_id: string;
  basis: string;
  key: string;
  member_reaction_entity_ids: string[];
  document_ids: string[];
  confidence: string;
  shared_features: string[];
  warnings: string[];
}

export interface ReactionSimilarityEdge {
  edge_id: string;
  from_reaction_entity_id: string;
  to_reaction_entity_id: string;
  basis: string[];
  score: number;
  confidence?: string;
  provider_ids?: string[];
  warnings: string[];
}

export interface ReactionClusterGraphIndex {
  schema_version?: string;
  index_scope?: {
    sources?: ReactionClusterGraphSource[];
  };
  reaction_features?: ReactionGraphFeature[];
  reaction_clusters?: ReactionCluster[];
  reaction_similarity_edges?: ReactionSimilarityEdge[];
  warnings?: string[];
}

export interface ReactionClusterPanelInput {
  compileOutput?: ChemdLanguageCompileOutput;
  graphIndex?: ReactionClusterGraphIndex;
  selectedClusterId?: string;
  compiledAt?: string;
  documentUri?: string;
}

export interface ReactionClusterPanelSummary {
  clusterCount: number;
  reactionCount: number;
  similarityEdgeCount: number;
  selectedClusterId: string | null;
  reason: ReactionClusterPanelReason | null;
}

export interface ReactionClusterPanelMember {
  reactionEntityId: string;
  documentId: string | null;
  label: string;
  sourceIds: string[];
}

export interface ReactionClusterPanelEdge {
  edgeId: string;
  fromReactionEntityId: string;
  toReactionEntityId: string;
  basis: string[];
  computedBasis: string[];
  semanticBasis: string[];
  score: number;
  confidence: string | null;
  providerIds: string[];
  warnings: string[];
}

export interface ReactionClusterPanelDetail {
  clusterId: string;
  label: string;
  basis: string;
  confidence: string;
  memberCount: number;
  edgeCount: number;
  sharedFeatures: string[];
  similarityEdgeBasis: string[];
  computedSimilarityBasis: string[];
  semanticSimilarityBasis: string[];
  providerIds: string[];
  edgeConfidences: string[];
  maxSimilarityScore: number | null;
  semanticOnly: boolean;
  weak: boolean;
  warnings: string[];
  members: ReactionClusterPanelMember[];
  edges: ReactionClusterPanelEdge[];
}

export interface ReactionClusterPanel {
  state: ReactionClusterPanelState;
  reason: ReactionClusterPanelReason | null;
  message: string;
  summary: ReactionClusterPanelSummary;
  clusters: ReactionClusterPanelDetail[];
  details: ReactionClusterPanelDetail[];
  selectedDetail: ReactionClusterPanelDetail | null;
  warnings: string[];
  compiledAt?: string;
  documentUri?: string;
}

const missingGraphIndexMessage = "Reaction clusters are unavailable because no graph index was provided.";
const noClustersMessage = "Reaction clusters are unavailable because the graph index has no clusters.";
const readyMessage = "Reaction cluster panel is ready.";

const basisLabels: Record<string, string> = {
  reaction_signature: "Reaction signature",
  reaction_family: "Reaction family",
  procedure_signature: "Procedure signature",
  family_procedure: "Family procedure",
  route: "Route",
  condition_signature: "Condition signature",
  chemistry_feature_ref: "Chemistry feature ref",
  campaign_trajectory: "Campaign trajectory"
};

const uniqueStrings = (values: readonly (string | undefined | null)[]): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();

const computedSimilarityBasis = new Set([
  "rdkit_fingerprint_tanimoto",
  "rxnfp_cosine",
  "same_reaction_center",
  "compatible_reaction_center",
  "hybrid_consensus"
]);

const semanticSimilarityBasis = new Set([
  "semantic_family_support",
  "semantic_procedure_support",
  "same_reaction_family"
]);

const isCompileOutput = (
  input: ChemdLanguageCompileOutput | ReactionClusterGraphIndex | ReactionClusterPanelInput
):
  input is ChemdLanguageCompileOutput => "status" in input;

const isGraphIndex = (
  input: ChemdLanguageCompileOutput | ReactionClusterGraphIndex | ReactionClusterPanelInput
): input is ReactionClusterGraphIndex =>
  "schema_version" in input || "reaction_clusters" in input || "reaction_features" in input;

const normalizeInput = (
  input: ChemdLanguageCompileOutput | ReactionClusterGraphIndex | ReactionClusterPanelInput
): ReactionClusterPanelInput => {
  if (isCompileOutput(input)) {
    return { compileOutput: input };
  }
  if (isGraphIndex(input)) {
    return { graphIndex: input };
  }
  return input;
};

const sourceIdsForDocuments = (
  documentIds: readonly string[],
  sources: readonly ReactionClusterGraphSource[]
): string[] => uniqueStrings(documentIds.map((documentId) => {
  const source = sources.find((item) => item.document_id === documentId);
  return source?.content_hash ?? source?.file_path ?? source?.document_id ?? documentId;
}));

const getClusterEdges = (
  cluster: ReactionCluster,
  edges: readonly ReactionSimilarityEdge[]
): ReactionSimilarityEdge[] => {
  const members = new Set(cluster.member_reaction_entity_ids);
  return edges
    .filter((edge) => members.has(edge.from_reaction_entity_id) && members.has(edge.to_reaction_entity_id))
    .sort((left, right) => left.edge_id.localeCompare(right.edge_id));
};

const memberLabel = (feature: ReactionGraphFeature | undefined, reactionId: string): string => {
  if (!feature) return reactionId;
  if (feature.reaction_family) return `${feature.reaction_family}: ${feature.participant_signature ?? reactionId}`;
  return feature.participant_signature ?? reactionId;
};

const hasSemanticOnlyEvidence = (
  cluster: ReactionCluster,
  basis: readonly string[],
  warnings: readonly string[]
): boolean =>
  !hasComputedSimilarityBasis(basis)
  && (
    cluster.basis === "reaction_family"
    || basis.some((item) => semanticSimilarityBasis.has(item))
    || warnings.some((warning) => warning.includes("semantic") || warning.includes("fingerprint"))
  );

const filterComputedBasis = (basis: readonly string[]): string[] =>
  uniqueStrings(basis.filter((item) => computedSimilarityBasis.has(item)));

const filterSemanticBasis = (basis: readonly string[]): string[] =>
  uniqueStrings(basis.filter((item) => semanticSimilarityBasis.has(item)));

const hasComputedSimilarityBasis = (basis: readonly string[]): boolean =>
  basis.some((item) => computedSimilarityBasis.has(item));

const hasWeakEvidence = (
  cluster: ReactionCluster,
  edgeCount: number,
  warnings: readonly string[]
): boolean =>
  cluster.confidence === "low"
  || edgeCount === 0
  || warnings.some((warning) => warning.includes("weak") || warning.includes("review_required"));

const buildMembers = (
  cluster: ReactionCluster,
  features: ReadonlyMap<string, ReactionGraphFeature>,
  sources: readonly ReactionClusterGraphSource[]
): ReactionClusterPanelMember[] => cluster.member_reaction_entity_ids.slice().sort().map((reactionId) => {
  const feature = features.get(reactionId);
  const documentId = feature?.document_id ?? null;
  return {
    reactionEntityId: reactionId,
    documentId,
    label: memberLabel(feature, reactionId),
    sourceIds: documentId ? sourceIdsForDocuments([documentId], sources) : []
  };
});

const buildDetail = (
  cluster: ReactionCluster,
  graphIndex: ReactionClusterGraphIndex,
  features: ReadonlyMap<string, ReactionGraphFeature>
): ReactionClusterPanelDetail => {
  const edges = getClusterEdges(cluster, graphIndex.reaction_similarity_edges ?? []);
  const edgeBasis = uniqueStrings(edges.flatMap((edge) => edge.basis));
  const computedBasis = filterComputedBasis(edgeBasis);
  const semanticBasis = filterSemanticBasis(edgeBasis);
  const providerIds = uniqueStrings(edges.flatMap((edge) => edge.provider_ids ?? []));
  const edgeConfidences = uniqueStrings(edges.map((edge) => edge.confidence));
  const warnings = uniqueStrings([
    ...cluster.warnings,
    ...edges.flatMap((edge) => edge.warnings),
    cluster.shared_features.length === 0 && edges.length === 0 ? "cluster_evidence_not_available" : undefined
  ]);
  const scores = edges.map((edge) => edge.score);
  return {
    clusterId: cluster.cluster_id,
    label: `${basisLabels[cluster.basis] ?? cluster.basis}: ${cluster.key}`,
    basis: cluster.basis,
    confidence: cluster.confidence,
    memberCount: cluster.member_reaction_entity_ids.length,
    edgeCount: edges.length,
    sharedFeatures: cluster.shared_features.slice().sort(),
    similarityEdgeBasis: edgeBasis,
    computedSimilarityBasis: computedBasis,
    semanticSimilarityBasis: semanticBasis,
    providerIds,
    edgeConfidences,
    maxSimilarityScore: scores.length > 0 ? Math.max(...scores) : null,
    semanticOnly: hasSemanticOnlyEvidence(cluster, edgeBasis, warnings),
    weak: hasWeakEvidence(cluster, edges.length, warnings),
    warnings,
    members: buildMembers(cluster, features, graphIndex.index_scope?.sources ?? []),
    edges: edges.map((edge) => ({
      edgeId: edge.edge_id,
      fromReactionEntityId: edge.from_reaction_entity_id,
      toReactionEntityId: edge.to_reaction_entity_id,
      basis: edge.basis.slice().sort(),
      computedBasis: filterComputedBasis(edge.basis),
      semanticBasis: filterSemanticBasis(edge.basis),
      score: edge.score,
      confidence: edge.confidence ?? null,
      providerIds: uniqueStrings(edge.provider_ids ?? []),
      warnings: edge.warnings.slice().sort()
    }))
  };
};

const sortDetails = (details: ReactionClusterPanelDetail[]): ReactionClusterPanelDetail[] =>
  details.sort((left, right) =>
    right.memberCount - left.memberCount
    || right.edgeCount - left.edgeCount
    || left.label.localeCompare(right.label)
    || left.clusterId.localeCompare(right.clusterId)
  );

const buildFallbackPanel = (
  input: ReactionClusterPanelInput,
  reason: ReactionClusterPanelReason,
  message: string,
  warnings: string[] = []
): ReactionClusterPanel => ({
  state: "fallback",
  reason,
  message,
  summary: {
    clusterCount: 0,
    reactionCount: 0,
    similarityEdgeCount: 0,
    selectedClusterId: null,
    reason
  },
  clusters: [],
  details: [],
  selectedDetail: null,
  warnings,
  compiledAt: input.compiledAt ?? input.compileOutput?.compiledAt,
  documentUri: input.documentUri ?? input.compileOutput?.documentUri
});

const getPanelCompiledAt = (input: ReactionClusterPanelInput): string | undefined =>
  input.compiledAt ?? input.compileOutput?.compiledAt;

const getPanelDocumentUri = (input: ReactionClusterPanelInput): string | undefined =>
  input.documentUri ?? input.compileOutput?.documentUri;

const getReactionCount = (
  graphIndex: ReactionClusterGraphIndex
): number => new Set((graphIndex.reaction_features ?? []).map((feature) =>
  feature.reaction_entity_id
)).size;

const selectClusterDetail = (
  details: readonly ReactionClusterPanelDetail[],
  selectedClusterId: string | undefined
): ReactionClusterPanelDetail | null =>
  details.find((detail) => detail.clusterId === selectedClusterId)
  ?? details[0]
  ?? null;

const buildReadyPanel = (
  input: ReactionClusterPanelInput,
  graphIndex: ReactionClusterGraphIndex,
  details: ReactionClusterPanelDetail[]
): ReactionClusterPanel => {
  const selectedDetail = selectClusterDetail(details, input.selectedClusterId);
  const warnings = uniqueStrings([
    ...(graphIndex.warnings ?? []),
    ...details.flatMap((detail) => detail.warnings)
  ]);

  return {
    state: "ready",
    reason: null,
    message: readyMessage,
    summary: {
      clusterCount: details.length,
      reactionCount: getReactionCount(graphIndex),
      similarityEdgeCount: graphIndex.reaction_similarity_edges?.length ?? 0,
      selectedClusterId: selectedDetail?.clusterId ?? null,
      reason: null
    },
    clusters: details,
    details,
    selectedDetail,
    warnings,
    compiledAt: getPanelCompiledAt(input),
    documentUri: getPanelDocumentUri(input)
  };
};

const buildGraphIndexPanel = (
  input: ReactionClusterPanelInput,
  graphIndex: ReactionClusterGraphIndex
): ReactionClusterPanel => {
  const features = new Map((graphIndex.reaction_features ?? []).map((feature) => [
    feature.reaction_entity_id,
    feature
  ]));
  const details = sortDetails((graphIndex.reaction_clusters ?? []).map((cluster) =>
    buildDetail(cluster, graphIndex, features)
  ));

  return details.length === 0
    ? buildFallbackPanel(
        input,
        "no_reaction_clusters",
        noClustersMessage,
        graphIndex.warnings?.slice().sort() ?? []
      )
    : buildReadyPanel(input, graphIndex, details);
};

export const buildReactionClusterPanel = (
  rawInput: ChemdLanguageCompileOutput | ReactionClusterGraphIndex | ReactionClusterPanelInput
): ReactionClusterPanel => {
  const input = normalizeInput(rawInput);
  if (input.compileOutput?.status === "failed") {
    return buildFallbackPanel(input, "compile_failed", `Compile failed: ${input.compileOutput.error.message}`);
  }

  const graphIndex = input.graphIndex;
  if (!graphIndex) {
    return buildFallbackPanel(input, "missing_graph_index", missingGraphIndexMessage);
  }

  return buildGraphIndexPanel(input, graphIndex);
};

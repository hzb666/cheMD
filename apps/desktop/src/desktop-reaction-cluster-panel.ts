import type { ChemdLanguageCompileOutput } from "@chemd/language-service";

export type DesktopReactionClusterPanelState = "ready" | "fallback";

export type DesktopReactionClusterPanelReason =
  | "compile_failed"
  | "missing_graph_index"
  | "no_reaction_clusters";

export interface DesktopReactionClusterGraphSource {
  document_id: string;
  file_path?: string;
  content_hash?: string;
}

export interface DesktopReactionGraphFeature {
  reaction_entity_id: string;
  document_id?: string;
  participant_signature?: string;
  reaction_family?: string;
}

export interface DesktopReactionCluster {
  cluster_id: string;
  basis: string;
  key: string;
  member_reaction_entity_ids: string[];
  document_ids: string[];
  confidence: string;
  shared_features: string[];
  warnings: string[];
}

export interface DesktopReactionSimilarityEdge {
  edge_id: string;
  from_reaction_entity_id: string;
  to_reaction_entity_id: string;
  basis: string[];
  score: number;
  warnings: string[];
}

export interface DesktopReactionClusterGraphIndex {
  schema_version?: string;
  index_scope?: {
    sources?: DesktopReactionClusterGraphSource[];
  };
  reaction_features?: DesktopReactionGraphFeature[];
  reaction_clusters?: DesktopReactionCluster[];
  reaction_similarity_edges?: DesktopReactionSimilarityEdge[];
  warnings?: string[];
}

export interface DesktopReactionClusterPanelInput {
  compileOutput?: ChemdLanguageCompileOutput;
  graphIndex?: DesktopReactionClusterGraphIndex;
  selectedClusterId?: string;
  compiledAt?: string;
  documentUri?: string;
}

export interface DesktopReactionClusterPanelSummary {
  clusterCount: number;
  reactionCount: number;
  similarityEdgeCount: number;
  selectedClusterId: string | null;
  reason: DesktopReactionClusterPanelReason | null;
}

export interface DesktopReactionClusterPanelMember {
  reactionEntityId: string;
  documentId: string | null;
  label: string;
  sourceIds: string[];
}

export interface DesktopReactionClusterPanelEdge {
  edgeId: string;
  fromReactionEntityId: string;
  toReactionEntityId: string;
  basis: string[];
  score: number;
  warnings: string[];
}

export interface DesktopReactionClusterPanelDetail {
  clusterId: string;
  label: string;
  basis: string;
  confidence: string;
  memberCount: number;
  edgeCount: number;
  sharedFeatures: string[];
  similarityEdgeBasis: string[];
  maxSimilarityScore: number | null;
  semanticOnly: boolean;
  weak: boolean;
  warnings: string[];
  members: DesktopReactionClusterPanelMember[];
  edges: DesktopReactionClusterPanelEdge[];
}

export interface DesktopReactionClusterPanel {
  state: DesktopReactionClusterPanelState;
  reason: DesktopReactionClusterPanelReason | null;
  message: string;
  summary: DesktopReactionClusterPanelSummary;
  clusters: DesktopReactionClusterPanelDetail[];
  details: DesktopReactionClusterPanelDetail[];
  selectedDetail: DesktopReactionClusterPanelDetail | null;
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

const isCompileOutput = (
  input: ChemdLanguageCompileOutput | DesktopReactionClusterGraphIndex | DesktopReactionClusterPanelInput
):
  input is ChemdLanguageCompileOutput => "status" in input;

const isGraphIndex = (
  input: ChemdLanguageCompileOutput | DesktopReactionClusterGraphIndex | DesktopReactionClusterPanelInput
): input is DesktopReactionClusterGraphIndex =>
  "schema_version" in input || "reaction_clusters" in input || "reaction_features" in input;

const normalizeInput = (
  input: ChemdLanguageCompileOutput | DesktopReactionClusterGraphIndex | DesktopReactionClusterPanelInput
): DesktopReactionClusterPanelInput => {
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
  sources: readonly DesktopReactionClusterGraphSource[]
): string[] => uniqueStrings(documentIds.map((documentId) => {
  const source = sources.find((item) => item.document_id === documentId);
  return source?.content_hash ?? source?.file_path ?? source?.document_id ?? documentId;
}));

const getClusterEdges = (
  cluster: DesktopReactionCluster,
  edges: readonly DesktopReactionSimilarityEdge[]
): DesktopReactionSimilarityEdge[] => {
  const members = new Set(cluster.member_reaction_entity_ids);
  return edges
    .filter((edge) => members.has(edge.from_reaction_entity_id) && members.has(edge.to_reaction_entity_id))
    .sort((left, right) => left.edge_id.localeCompare(right.edge_id));
};

const memberLabel = (feature: DesktopReactionGraphFeature | undefined, reactionId: string): string => {
  if (!feature) return reactionId;
  if (feature.reaction_family) return `${feature.reaction_family}: ${feature.participant_signature ?? reactionId}`;
  return feature.participant_signature ?? reactionId;
};

const hasSemanticOnlyEvidence = (
  cluster: DesktopReactionCluster,
  basis: readonly string[],
  warnings: readonly string[]
): boolean =>
  cluster.basis === "reaction_family"
  || basis.includes("same_reaction_family")
  || warnings.some((warning) => warning.includes("semantic") || warning.includes("fingerprint"));

const hasWeakEvidence = (
  cluster: DesktopReactionCluster,
  edgeCount: number,
  warnings: readonly string[]
): boolean =>
  cluster.confidence === "low"
  || edgeCount === 0
  || warnings.some((warning) => warning.includes("weak") || warning.includes("review_required"));

const buildMembers = (
  cluster: DesktopReactionCluster,
  features: ReadonlyMap<string, DesktopReactionGraphFeature>,
  sources: readonly DesktopReactionClusterGraphSource[]
): DesktopReactionClusterPanelMember[] => cluster.member_reaction_entity_ids.slice().sort().map((reactionId) => {
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
  cluster: DesktopReactionCluster,
  graphIndex: DesktopReactionClusterGraphIndex,
  features: ReadonlyMap<string, DesktopReactionGraphFeature>
): DesktopReactionClusterPanelDetail => {
  const edges = getClusterEdges(cluster, graphIndex.reaction_similarity_edges ?? []);
  const edgeBasis = uniqueStrings(edges.flatMap((edge) => edge.basis));
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
      score: edge.score,
      warnings: edge.warnings.slice().sort()
    }))
  };
};

const sortDetails = (details: DesktopReactionClusterPanelDetail[]): DesktopReactionClusterPanelDetail[] =>
  details.sort((left, right) =>
    right.memberCount - left.memberCount
    || right.edgeCount - left.edgeCount
    || left.label.localeCompare(right.label)
    || left.clusterId.localeCompare(right.clusterId)
  );

const buildFallbackPanel = (
  input: DesktopReactionClusterPanelInput,
  reason: DesktopReactionClusterPanelReason,
  message: string,
  warnings: string[] = []
): DesktopReactionClusterPanel => ({
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

export const buildDesktopReactionClusterPanel = (
  rawInput: ChemdLanguageCompileOutput | DesktopReactionClusterGraphIndex | DesktopReactionClusterPanelInput
): DesktopReactionClusterPanel => {
  const input = normalizeInput(rawInput);
  if (input.compileOutput?.status === "failed") {
    return buildFallbackPanel(input, "compile_failed", `Compile failed: ${input.compileOutput.error.message}`);
  }

  const graphIndex = input.graphIndex;
  if (!graphIndex) {
    return buildFallbackPanel(input, "missing_graph_index", missingGraphIndexMessage);
  }

  const features = new Map((graphIndex.reaction_features ?? []).map((feature) => [
    feature.reaction_entity_id,
    feature
  ]));
  const details = sortDetails((graphIndex.reaction_clusters ?? []).map((cluster) =>
    buildDetail(cluster, graphIndex, features)
  ));

  if (details.length === 0) {
    return buildFallbackPanel(input, "no_reaction_clusters", noClustersMessage, graphIndex.warnings?.slice().sort() ?? []);
  }

  const selectedDetail = details.find((detail) => detail.clusterId === input.selectedClusterId) ?? details[0];
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
      reactionCount: new Set((graphIndex.reaction_features ?? []).map((feature) => feature.reaction_entity_id)).size,
      similarityEdgeCount: graphIndex.reaction_similarity_edges?.length ?? 0,
      selectedClusterId: selectedDetail?.clusterId ?? null,
      reason: null
    },
    clusters: details,
    details,
    selectedDetail: selectedDetail ?? null,
    warnings,
    compiledAt: input.compiledAt ?? input.compileOutput?.compiledAt,
    documentUri: input.documentUri ?? input.compileOutput?.documentUri
  };
};

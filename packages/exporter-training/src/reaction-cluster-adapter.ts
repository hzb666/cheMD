import type {
  ChemdTrainingGraphIndexV1,
  TrainingGraphIndexDocumentSourceV1,
  TrainingReactionClusterBasisV1,
  TrainingReactionClusterV1,
  TrainingReactionGraphFeatureV1,
  TrainingReactionSimilarityBasisV1,
  TrainingReactionSimilarityEdgeV1
} from "./graph-index-types";
import type { TrainingInferenceConfidenceV1 } from "./projection-types";

export interface ReactionClusterSimilaritySummaryViewModel {
  edge_count: number;
  bases: TrainingReactionSimilarityBasisV1[];
  max_score?: number;
  warnings: string[];
}

export interface ReactionClusterListItemViewModel {
  cluster_id: string;
  label: string;
  basis: TrainingReactionClusterBasisV1;
  confidence: TrainingInferenceConfidenceV1;
  reaction_count: number;
  edge_count: number;
  representative_reaction_id?: string;
  citation_ids: string[];
  source_ids: string[];
  warnings: string[];
  similarity_summary: ReactionClusterSimilaritySummaryViewModel;
}

export interface ReactionClusterMemberViewModel {
  reaction_entity_id: string;
  document_id?: string;
  label: string;
  citation_ids: string[];
  source_ids: string[];
}

export interface ReactionClusterEdgeViewModel {
  edge_id: string;
  from_reaction_entity_id: string;
  to_reaction_entity_id: string;
  basis: TrainingReactionSimilarityBasisV1[];
  score: number;
  warnings: string[];
}

export interface ReactionClusterEvidenceSummaryViewModel {
  basis: TrainingReactionClusterBasisV1;
  confidence: TrainingInferenceConfidenceV1;
  shared_features: string[];
  similarity_bases: TrainingReactionSimilarityBasisV1[];
  max_similarity_score?: number;
  warnings: string[];
}

export interface ReactionClusterDetailViewModel extends ReactionClusterListItemViewModel {
  key: string;
  shared_features: string[];
  members: ReactionClusterMemberViewModel[];
  similarity_edges: ReactionClusterEdgeViewModel[];
  evidence_summary: ReactionClusterEvidenceSummaryViewModel;
}

export interface ReactionClusterViewModelSummary {
  cluster_count: number;
  reaction_count: number;
  similarity_edge_count: number;
  citation_ids: string[];
  source_ids: string[];
  warnings: string[];
  empty_reason?: "no_reaction_clusters";
}

export interface ReactionClusterViewModel {
  schema_version: "chemd-reaction-cluster-view-model/v0.1";
  summary: ReactionClusterViewModelSummary;
  clusters: ReactionClusterListItemViewModel[];
  details: ReactionClusterDetailViewModel[];
}

const basisLabels: Record<TrainingReactionClusterBasisV1, string> = {
  reaction_signature: "Reaction signature",
  reaction_family: "Reaction family",
  procedure_signature: "Procedure signature",
  family_procedure: "Family procedure",
  route: "Route",
  condition_signature: "Condition signature",
  chemistry_feature_ref: "Chemistry feature ref",
  campaign_trajectory: "Campaign trajectory"
};

const uniqueStrings = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();

const sourceIdsForDocuments = (
  documentIds: string[],
  sources: TrainingGraphIndexDocumentSourceV1[]
): string[] => uniqueStrings(documentIds.map((documentId) => {
  const source = sources.find((item) => item.document_id === documentId);
  return source?.content_hash ?? source?.file_path ?? source?.document_id ?? documentId;
}));

const getClusterEdges = (
  cluster: TrainingReactionClusterV1,
  edges: TrainingReactionSimilarityEdgeV1[]
): TrainingReactionSimilarityEdgeV1[] => {
  const members = new Set(cluster.member_reaction_entity_ids);
  return edges
    .filter((edge) => members.has(edge.from_reaction_entity_id) && members.has(edge.to_reaction_entity_id))
    .sort((left, right) => left.edge_id.localeCompare(right.edge_id));
};

const summarizeSimilarity = (
  edges: TrainingReactionSimilarityEdgeV1[]
): ReactionClusterSimilaritySummaryViewModel => {
  const scores = edges.map((edge) => edge.score);
  return {
    edge_count: edges.length,
    bases: uniqueStrings(edges.flatMap((edge) => edge.basis)) as TrainingReactionSimilarityBasisV1[],
    ...(scores.length > 0 ? { max_score: Math.max(...scores) } : {}),
    warnings: uniqueStrings(edges.flatMap((edge) => edge.warnings))
  };
};

const representativeReactionId = (
  cluster: TrainingReactionClusterV1,
  edges: TrainingReactionSimilarityEdgeV1[]
): string | undefined => {
  const degree = new Map(cluster.member_reaction_entity_ids.map((id) => [id, 0]));
  edges.forEach((edge) => {
    degree.set(edge.from_reaction_entity_id, (degree.get(edge.from_reaction_entity_id) ?? 0) + 1);
    degree.set(edge.to_reaction_entity_id, (degree.get(edge.to_reaction_entity_id) ?? 0) + 1);
  });
  return Array.from(degree.entries()).sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0])
  )[0]?.[0];
};

const memberLabel = (feature: TrainingReactionGraphFeatureV1 | undefined, reactionId: string): string => {
  if (!feature) return reactionId;
  if (feature.reaction_family) return `${feature.reaction_family}: ${feature.participant_signature}`;
  return feature.participant_signature || reactionId;
};

const buildMembers = (
  cluster: TrainingReactionClusterV1,
  features: Map<string, TrainingReactionGraphFeatureV1>,
  sources: TrainingGraphIndexDocumentSourceV1[]
): ReactionClusterMemberViewModel[] => cluster.member_reaction_entity_ids.slice().sort().map((reactionId) => {
  const feature = features.get(reactionId);
  const citationIds = uniqueStrings([feature?.document_id]);
  return {
    reaction_entity_id: reactionId,
    ...(feature?.document_id ? { document_id: feature.document_id } : {}),
    label: memberLabel(feature, reactionId),
    citation_ids: citationIds,
    source_ids: sourceIdsForDocuments(citationIds, sources)
  };
});

const adapterWarnings = (
  cluster: TrainingReactionClusterV1,
  similarity: ReactionClusterSimilaritySummaryViewModel
): string[] => uniqueStrings([
  ...cluster.warnings,
  ...similarity.warnings,
  cluster.shared_features.length === 0 && similarity.edge_count === 0 ? "cluster_evidence_not_available" : undefined
]);

const buildEdgeViewModels = (
  edges: TrainingReactionSimilarityEdgeV1[]
): ReactionClusterEdgeViewModel[] => edges.map((edge) => ({
  edge_id: edge.edge_id,
  from_reaction_entity_id: edge.from_reaction_entity_id,
  to_reaction_entity_id: edge.to_reaction_entity_id,
  basis: edge.basis.slice().sort(),
  score: edge.score,
  warnings: edge.warnings.slice().sort()
}));

const buildDetail = (
  cluster: TrainingReactionClusterV1,
  input: ChemdTrainingGraphIndexV1,
  features: Map<string, TrainingReactionGraphFeatureV1>
): ReactionClusterDetailViewModel => {
  const edges = getClusterEdges(cluster, input.reaction_similarity_edges);
  const similarity = summarizeSimilarity(edges);
  const warnings = adapterWarnings(cluster, similarity);
  const citationIds = uniqueStrings(cluster.document_ids);
  return {
    cluster_id: cluster.cluster_id,
    label: `${basisLabels[cluster.basis]}: ${cluster.key}`,
    basis: cluster.basis,
    confidence: cluster.confidence,
    reaction_count: cluster.member_reaction_entity_ids.length,
    edge_count: edges.length,
    representative_reaction_id: representativeReactionId(cluster, edges),
    citation_ids: citationIds,
    source_ids: sourceIdsForDocuments(citationIds, input.index_scope.sources),
    warnings,
    similarity_summary: similarity,
    key: cluster.key,
    shared_features: cluster.shared_features.slice().sort(),
    members: buildMembers(cluster, features, input.index_scope.sources),
    similarity_edges: buildEdgeViewModels(edges),
    evidence_summary: {
      basis: cluster.basis,
      confidence: cluster.confidence,
      shared_features: cluster.shared_features.slice().sort(),
      similarity_bases: similarity.bases,
      ...(similarity.max_score !== undefined ? { max_similarity_score: similarity.max_score } : {}),
      warnings
    }
  };
};

const sortDetails = (details: ReactionClusterDetailViewModel[]): ReactionClusterDetailViewModel[] =>
  details.sort((left, right) =>
    right.reaction_count - left.reaction_count
    || right.edge_count - left.edge_count
    || left.label.localeCompare(right.label)
    || left.cluster_id.localeCompare(right.cluster_id)
  );

export const buildReactionClusterViewModel = (
  input: ChemdTrainingGraphIndexV1
): ReactionClusterViewModel => {
  const features = new Map(input.reaction_features.map((feature) => [feature.reaction_entity_id, feature]));
  const details = sortDetails(input.reaction_clusters.map((cluster) => buildDetail(cluster, input, features)));
  const citationIds = uniqueStrings(details.flatMap((detail) => detail.citation_ids));
  return {
    schema_version: "chemd-reaction-cluster-view-model/v0.1",
    summary: {
      cluster_count: details.length,
      reaction_count: uniqueStrings(input.reaction_features.map((feature) => feature.reaction_entity_id)).length,
      similarity_edge_count: input.reaction_similarity_edges.length,
      citation_ids: citationIds,
      source_ids: sourceIdsForDocuments(citationIds, input.index_scope.sources),
      warnings: uniqueStrings(input.warnings),
      ...(details.length === 0 ? { empty_reason: "no_reaction_clusters" as const } : {})
    },
    clusters: details.map(({ key, shared_features, members, similarity_edges, evidence_summary, ...item }) => item),
    details
  };
};

export const findReactionClusterDetail = (
  viewModel: ReactionClusterViewModel,
  clusterId: string
): ReactionClusterDetailViewModel | undefined =>
  viewModel.details.find((detail) => detail.cluster_id === clusterId);

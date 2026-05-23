import type { ChemdTrainingGraphIndexV1, TrainingReactionGraphFeatureV1 } from "./graph-index-types";
import type {
  MergedReactionIntelligenceLayer,
  ReactionIntelligenceStrictReactionCluster,
  ReactionIntelligenceStrictReactionClusterProfile
} from "./reaction-intelligence-types";

type ClusterProfileCommonFields = ReactionIntelligenceStrictReactionClusterProfile["common_fields"];

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort();

const commonString = (
  features: TrainingReactionGraphFeatureV1[],
  field: keyof TrainingReactionGraphFeatureV1
): string | undefined => {
  const values = uniqueSorted(features.flatMap((feature) => {
    const value = feature[field];
    return typeof value === "string" ? [value] : [];
  }));
  return values.length === 1 ? values[0] : undefined;
};

const commonList = (
  features: TrainingReactionGraphFeatureV1[],
  field: "changed_variable_fields" | "controlled_variable_fields" | "chemistry_feature_ref_ids"
): string[] => {
  if (features.length === 0) return [];
  const [first, ...rest] = features.map((feature) => new Set(feature[field]));
  return [...first].filter((value) => rest.every((set) => set.has(value))).sort();
};

const profileLabel = (
  cluster: ReactionIntelligenceStrictReactionCluster,
  features: TrainingReactionGraphFeatureV1[]
): string => {
  const family = commonString(features, "reaction_family");
  const procedure = commonString(features, "procedure_signature");
  const reactionSignature = commonString(features, "reaction_signature");
  if (family && procedure) return `${family} / ${procedure}`;
  if (family) return family;
  if (reactionSignature) return reactionSignature;
  return `strict reaction cluster (${cluster.reaction_entity_ids.length} reactions)`;
};

const representativeReactionId = (
  cluster: ReactionIntelligenceStrictReactionCluster,
  featuresByReactionId: ReadonlyMap<string, TrainingReactionGraphFeatureV1>
): string => {
  if (featuresByReactionId.has(cluster.representative_reaction_entity_id)) {
    return cluster.representative_reaction_entity_id;
  }
  return cluster.reaction_entity_ids.find((reactionId) => featuresByReactionId.has(reactionId))
    ?? cluster.reaction_entity_ids[0]
    ?? cluster.representative_reaction_entity_id;
};

const missingFeatureWarnings = (
  cluster: ReactionIntelligenceStrictReactionCluster,
  featuresByReactionId: ReadonlyMap<string, TrainingReactionGraphFeatureV1>
): string[] =>
  cluster.reaction_entity_ids
    .filter((reactionId) => !featuresByReactionId.has(reactionId))
    .map((reactionId) => `strict_cluster_profile_missing_reaction_feature:${reactionId}`);

const clusterFeatures = (
  cluster: ReactionIntelligenceStrictReactionCluster,
  featuresByReactionId: ReadonlyMap<string, TrainingReactionGraphFeatureV1>
): TrainingReactionGraphFeatureV1[] =>
  cluster.reaction_entity_ids.flatMap((reactionId) => {
    const feature = featuresByReactionId.get(reactionId);
    return feature ? [feature] : [];
  });

const optionalCommonStrings = (
  features: TrainingReactionGraphFeatureV1[]
): Partial<ClusterProfileCommonFields> => {
  const fields: Partial<ClusterProfileCommonFields> = {};
  for (const field of [
    "reaction_signature",
    "participant_signature",
    "reaction_family",
    "procedure_signature",
    "condition_signature",
    "route_id"
  ] as const) {
    const value = commonString(features, field);
    if (value) fields[field] = value;
  }
  return fields;
};

const commonFields = (features: TrainingReactionGraphFeatureV1[]): ClusterProfileCommonFields => ({
  ...optionalCommonStrings(features),
  changed_variable_fields: commonList(features, "changed_variable_fields"),
  controlled_variable_fields: commonList(features, "controlled_variable_fields"),
  chemistry_feature_ref_ids: commonList(features, "chemistry_feature_ref_ids")
});

const clusterProfile = (
  cluster: ReactionIntelligenceStrictReactionCluster,
  featuresByReactionId: ReadonlyMap<string, TrainingReactionGraphFeatureV1>
): ReactionIntelligenceStrictReactionClusterProfile => {
  const features = clusterFeatures(cluster, featuresByReactionId);
  const representative = representativeReactionId(cluster, featuresByReactionId);
  const documentIds = uniqueSorted(features.map((feature) => feature.document_id));
  const warnings = uniqueSorted([
    ...cluster.warnings,
    ...missingFeatureWarnings(cluster, featuresByReactionId)
  ]);
  return {
    profile_id: `strict-reaction-cluster-profile::${cluster.cluster_id}`,
    cluster_id: cluster.cluster_id,
    reaction_entity_ids: [...cluster.reaction_entity_ids],
    representative_reaction_entity_id: representative,
    label: profileLabel(cluster, features),
    member_count: cluster.reaction_entity_ids.length,
    document_ids: documentIds,
    score_summary: {
      mean_score: cluster.mean_score,
      min_edge_score: cluster.min_edge_score
    },
    evidence_basis: [...cluster.basis_summary],
    common_fields: commonFields(features),
    warnings,
    source: "strict_reaction_cluster_profile"
  };
};

export const buildStrictReactionClusterProfiles = (
  index: ChemdTrainingGraphIndexV1,
  layer: Pick<MergedReactionIntelligenceLayer, "strict_reaction_clusters">
): ReactionIntelligenceStrictReactionClusterProfile[] => {
  const featuresByReactionId = new Map(
    index.reaction_features.map((feature) => [feature.reaction_entity_id, feature])
  );
  return (layer.strict_reaction_clusters ?? [])
    .map((cluster) => clusterProfile(cluster, featuresByReactionId))
    .sort((left, right) => left.profile_id.localeCompare(right.profile_id));
};

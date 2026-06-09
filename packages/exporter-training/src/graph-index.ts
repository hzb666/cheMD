import type {
  ChemdTrainingUnderstandingV1,
  TrainingInferenceConfidenceV1,
  TrainingReactionFamilyV1,
  TrainingReactionV1
} from "./projection-types";
import type {
  BuildTrainingGraphIndexOptions,
  ChemdTrainingGraphIndexV1,
  TrainingGraphIndexDocumentSourceV1,
  TrainingGraphIndexEdgeV1,
  TrainingGraphIndexNodeV1,
  TrainingReactionClusterBasisV1,
  TrainingReactionClusterV1,
  TrainingReactionGraphFeatureV1,
  TrainingReactionSimilarityBasisV1,
  TrainingReactionSimilarityEdgeV1
} from "./graph-index-types";
import { buildTrainingCampaignFromUnderstandings } from "./campaign-projections";

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean))).sort();

const createStableHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const getProcedureSignature = (understanding: ChemdTrainingUnderstandingV1): string | undefined => {
  const families = understanding.procedure_logic.procedure_to_steps.flatMap((pair) =>
    pair.steps.map((step) => step.family)
  );
  return families.length > 0 ? families.join(">") : undefined;
};

const joinParticipants = (items: TrainingReactionV1["reactants"]): string =>
  items.map((item) => item.target_original_id ?? item.raw).join("+") || "none";

const getFamily = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string
): TrainingReactionFamilyV1 | undefined =>
  understanding.experiment_logic.reaction_taxonomy.find((item) =>
    item.reaction_entity_id === reactionEntityId
  )?.reaction_family;

const isKnownFamily = (
  family: TrainingReactionFamilyV1 | undefined
): family is Exclude<TrainingReactionFamilyV1, "unknown"> =>
  Boolean(family && family !== "unknown");

const getConditionSignature = (reaction: TrainingReactionV1): string | undefined => {
  const conditions = reaction.normalized_conditions;
  const values = [
    conditions.solvent?.normalized ? `solvent=${conditions.solvent.normalized}` : "",
    conditions.catalyst?.normalized ? `catalyst=${conditions.catalyst.normalized}` : "",
    conditions.reagents?.normalized.length ? `reagents=${conditions.reagents.normalized.join("+")}` : "",
    conditions.atmosphere?.normalized ? `atmosphere=${conditions.atmosphere.normalized}` : "",
    conditions.temperature ? `temperature=${conditions.temperature.value} ${conditions.temperature.unit}` : "",
    conditions.time ? `time=${conditions.time.value} ${conditions.time.unit}` : "",
    conditions.pressure ? `pressure=${conditions.pressure.value} ${conditions.pressure.unit}` : ""
  ].filter(Boolean);

  return values.length > 0 ? values.join("|") : undefined;
};

const buildClusterKeys = (
  feature: Omit<TrainingReactionGraphFeatureV1, "cluster_keys">
): TrainingReactionGraphFeatureV1["cluster_keys"] => [
  { basis: "reaction_signature", key: feature.reaction_signature },
  ...(feature.reaction_family ? [{ basis: "reaction_family" as const, key: feature.reaction_family }] : []),
  ...(feature.procedure_signature ? [{ basis: "procedure_signature" as const, key: feature.procedure_signature }] : []),
  ...(feature.reaction_family && feature.procedure_signature
    ? [{ basis: "family_procedure" as const, key: `${feature.reaction_family}::${feature.procedure_signature}` }]
    : []),
  ...(feature.route_id ? [{ basis: "route" as const, key: feature.route_id }] : []),
  ...(feature.condition_signature ? [{ basis: "condition_signature" as const, key: feature.condition_signature }] : []),
  ...feature.chemistry_feature_ref_ids.map((key) => ({ basis: "chemistry_feature_ref" as const, key }))
];

const buildReactionFeatures = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingReactionGraphFeatureV1[] => {
  const procedureSignature = getProcedureSignature(understanding);
  return understanding.entities.reactions.map((reaction) => {
    const rawFamily = getFamily(understanding, reaction.entity_id);
    const family = isKnownFamily(rawFamily) ? rawFamily : undefined;
    const route = understanding.experiment_logic.reaction_routes.find((item) =>
      item.reaction_entity_id === reaction.entity_id
    );
    const context = understanding.experiment_logic.design_contexts.find((item) =>
      item.reaction_entity_id === reaction.entity_id
    );
    const participantSignature = `${joinParticipants(reaction.reactants)}=>${joinParticipants(reaction.products)}`;
    const base = {
      reaction_entity_id: reaction.entity_id,
      document_id: understanding.document.document_id,
      reaction_signature: `${family ?? "unknown"}::${participantSignature}`,
      participant_signature: participantSignature,
      fingerprint_status: reaction.chemistry_feature_ref_ids?.length ? "external_ref_available" as const : "not_available" as const,
      chemistry_feature_ref_ids: uniqueStrings(reaction.chemistry_feature_ref_ids ?? []),
      changed_variable_fields: uniqueStrings(context?.changed_variables.map((item) => item.field) ?? []),
      controlled_variable_fields: uniqueStrings(context?.controlled_variables ?? []),
      ...(family ? { reaction_family: family } : {}),
      ...(procedureSignature ? { procedure_signature: procedureSignature } : {}),
      ...(route?.route_id ? { route_id: route.route_id } : {}),
      ...(getConditionSignature(reaction) ? { condition_signature: getConditionSignature(reaction) } : {})
    };
    return { ...base, cluster_keys: buildClusterKeys(base) };
  });
};

const createDocumentNodes = (
  understandings: ChemdTrainingUnderstandingV1[],
  sources: TrainingGraphIndexDocumentSourceV1[]
): TrainingGraphIndexNodeV1[] =>
  understandings.map((item) => ({
    node_id: `doc::${item.document.document_id}`,
    node_type: "document",
    document_id: item.document.document_id,
    label: item.document.title,
    properties: {
      date: item.document.date,
      file_path: sources.find((source) => source.document_id === item.document.document_id)?.file_path ?? null
    }
  }));

const createKnowledgeNodes = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingGraphIndexNodeV1[] =>
  understanding.knowledge_graph.nodes.map((node) => ({
    node_id: node.node_id,
    node_type: node.node_type,
    document_id: understanding.document.document_id,
    entity_id: node.node_id,
    label: node.label,
    original_id: node.original_id
  }));

const createKnowledgeEdges = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingGraphIndexEdgeV1[] =>
  understanding.knowledge_graph.edges.map((edge) => ({
    edge_id: edge.edge_id,
    edge_type: edge.edge_type,
    from_node_id: edge.from_node_id,
    to_node_id: edge.to_node_id,
    document_id: understanding.document.document_id,
    confidence: edge.confidence,
    properties: {
      edge_source: edge.edge_source,
      role: edge.role ?? null
    }
  }));

const getSimilarityBases = (
  left: TrainingReactionGraphFeatureV1,
  right: TrainingReactionGraphFeatureV1
): TrainingReactionSimilarityBasisV1[] => uniqueStrings([
  left.reaction_signature === right.reaction_signature ? "same_reaction_signature" : "",
  left.reaction_family && left.reaction_family === right.reaction_family ? "same_reaction_family" : "",
  left.procedure_signature && left.procedure_signature === right.procedure_signature ? "same_procedure_signature" : "",
  left.reaction_family && left.reaction_family === right.reaction_family
    && left.procedure_signature && left.procedure_signature === right.procedure_signature
    ? "same_family_procedure" : "",
  left.route_id && left.route_id === right.route_id ? "same_route" : "",
  left.condition_signature && left.condition_signature === right.condition_signature ? "same_condition_signature" : "",
  left.chemistry_feature_ref_ids.some((ref) => right.chemistry_feature_ref_ids.includes(ref))
    ? "shared_chemistry_feature_ref" : ""
]) as TrainingReactionSimilarityBasisV1[];

const scoreSimilarity = (basis: TrainingReactionSimilarityBasisV1[]): number => {
  if (basis.includes("same_reaction_signature")) return 1;
  if (basis.includes("shared_chemistry_feature_ref")) return 0.95;
  if (basis.includes("same_family_procedure")) return 0.85;
  if (basis.includes("same_route")) return 0.75;
  if (basis.includes("same_procedure_signature")) return 0.7;
  if (basis.includes("same_reaction_family")) return 0.55;
  return 0.5;
};

const buildSimilarityEdges = (
  features: TrainingReactionGraphFeatureV1[]
): TrainingReactionSimilarityEdgeV1[] => features.flatMap((left, leftIndex) =>
  features.slice(leftIndex + 1).flatMap((right) => {
    const basis = getSimilarityBases(left, right);
    if (basis.length === 0) return [];
    const pairKey = [left.reaction_entity_id, right.reaction_entity_id].sort().join("::");
    return [{
      edge_id: `reaction-similarity::${createStableHash(pairKey)}`,
      from_reaction_entity_id: left.reaction_entity_id,
      to_reaction_entity_id: right.reaction_entity_id,
      basis,
      score: scoreSimilarity(basis),
      warnings: basis.includes("shared_chemistry_feature_ref") ? [] : ["semantic_similarity_without_computed_fingerprint"]
    }];
  })
);

const clusterConfidence = (basis: TrainingReactionClusterBasisV1): TrainingInferenceConfidenceV1 => {
  if (basis === "reaction_signature" || basis === "chemistry_feature_ref") return "high";
  if (basis === "family_procedure" || basis === "campaign_trajectory" || basis === "route") return "medium";
  return "low";
};

const clusterWarnings = (basis: TrainingReactionClusterBasisV1): string[] => {
  if (basis === "chemistry_feature_ref") return ["external_feature_ref_no_vector_similarity"];
  if (basis === "reaction_family") return ["family_only_cluster_review_required"];
  return ["semantic_cluster_no_computed_chemical_fingerprint"];
};

const buildFeatureClusters = (
  features: TrainingReactionGraphFeatureV1[],
  includeSingletons: boolean
): TrainingReactionClusterV1[] => {
  const groups = new Map<string, TrainingReactionGraphFeatureV1[]>();
  features.forEach((feature) => feature.cluster_keys.forEach((clusterKey) => {
    const key = `${clusterKey.basis}::${clusterKey.key}`;
    groups.set(key, [...(groups.get(key) ?? []), feature]);
  }));

  return Array.from(groups.entries()).flatMap(([key, members]) => {
    if (!includeSingletons && members.length < 2) return [];
    const [basis, ...rest] = key.split("::");
    const clusterKey = rest.join("::");
    return [{
      cluster_id: `reaction-cluster::${basis}::${createStableHash(clusterKey)}`,
      basis: basis as TrainingReactionClusterBasisV1,
      key: clusterKey,
      member_reaction_entity_ids: uniqueStrings(members.map((item) => item.reaction_entity_id)),
      document_ids: uniqueStrings(members.map((item) => item.document_id)),
      confidence: clusterConfidence(basis as TrainingReactionClusterBasisV1),
      shared_features: uniqueStrings([clusterKey]),
      warnings: clusterWarnings(basis as TrainingReactionClusterBasisV1),
      ...(members[0]?.reaction_family ? { reaction_family: members[0].reaction_family } : {}),
      ...(members[0]?.procedure_signature ? { procedure_signature: members[0].procedure_signature } : {})
    }];
  });
};

const buildCampaignClusters = (
  understandings: ChemdTrainingUnderstandingV1[]
): TrainingReactionClusterV1[] =>
  buildTrainingCampaignFromUnderstandings(understandings).trajectories.map((trajectory) => ({
    cluster_id: `reaction-cluster::campaign_trajectory::${createStableHash(trajectory.trajectory_id)}`,
    basis: "campaign_trajectory",
    key: trajectory.series_key,
    member_reaction_entity_ids: uniqueStrings(trajectory.runs.map((run) => run.reaction_entity_id)),
    document_ids: trajectory.document_ids,
    confidence: trajectory.warnings.length === 0 ? "medium" : "low",
    shared_features: trajectory.shared_features,
    warnings: trajectory.warnings,
    trajectory_kind: trajectory.trajectory_kind,
    ...(trajectory.reaction_family ? { reaction_family: trajectory.reaction_family } : {}),
    ...(trajectory.procedure_signature ? { procedure_signature: trajectory.procedure_signature } : {})
  }));

export const buildTrainingGraphIndexFromUnderstandings = (
  understandings: ChemdTrainingUnderstandingV1[],
  options: BuildTrainingGraphIndexOptions = {}
): ChemdTrainingGraphIndexV1 => {
  const sources = options.document_sources ?? understandings.map((item) => ({
    document_id: item.document.document_id,
    ...(item.document.source_uri ? { file_path: item.document.source_uri } : {})
  }));
  const features = understandings.flatMap(buildReactionFeatures);
  const nodes = [
    ...createDocumentNodes(understandings, sources),
    ...understandings.flatMap(createKnowledgeNodes)
  ];
  const edges = understandings.flatMap(createKnowledgeEdges);
  const reactionClusters = [
    ...buildFeatureClusters(features, options.include_singleton_clusters ?? false),
    ...buildCampaignClusters(understandings)
  ];

  return {
    schema_version: "chemd-training-graph-index/v0.1",
    index_scope: {
      document_ids: uniqueStrings(understandings.map((item) => item.document.document_id)),
      sources
    },
    nodes,
    edges,
    reaction_features: features,
    reaction_clusters: reactionClusters,
    reaction_similarity_edges: buildSimilarityEdges(features),
    warnings: features.some((feature) => feature.fingerprint_status === "not_available")
      ? ["computed_reaction_fingerprints_not_available"]
      : []
  };
};

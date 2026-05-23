import type {
  BuildReactionIntelligenceCanonicalInputOptions,
  ChemdReactionIntelligenceGraphIndex,
  MergeReactionIntelligenceOptions,
  MergedReactionIntelligenceLayer,
  ReactionIntelligenceCanonicalInput,
  ReactionIntelligenceCanonicalReactionInput,
  ReactionIntelligenceServiceJob,
  ReactionIntelligenceServiceJobBuildResult,
  BuildReactionIntelligenceServiceJobOptions,
  ReactionIntelligenceArtifact,
  ReactionIntelligenceCluster,
  ReactionIntelligenceComputedFeature,
  ReactionIntelligenceComputedSimilarityEdge,
  ReactionIntelligenceLayout
} from "./reaction-intelligence-types";
import type { ChemdTrainingGraphIndexV1 } from "./graph-index-types";

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean))).sort();

const createStableHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const sourceHashForReaction = (
  index: ChemdTrainingGraphIndexV1,
  reaction: ChemdTrainingGraphIndexV1["reaction_features"][number]
): string => {
  const sourceHash = index.index_scope.sources.find((source) =>
    source.document_id === reaction.document_id
  )?.content_hash;
  if (sourceHash) return sourceHash;
  return `sha256:graph-feature:${createStableHash([
    reaction.reaction_entity_id,
    reaction.reaction_signature,
    reaction.participant_signature,
    reaction.procedure_signature ?? "",
    reaction.condition_signature ?? ""
  ].join("|"))}`;
};

const canonicalSmilesForFeatureRefs = (
  featureRefs: string[],
  values: Record<string, string>
): string | undefined =>
  featureRefs.map((ref) => values[ref]?.trim()).find((value): value is string =>
    typeof value === "string" && value.length > 0
  );

const buildCanonicalReactionInput = (
  index: ChemdTrainingGraphIndexV1,
  reaction: ChemdTrainingGraphIndexV1["reaction_features"][number],
  options: BuildReactionIntelligenceCanonicalInputOptions
): ReactionIntelligenceCanonicalReactionInput => {
  const canonicalRxnSmiles = canonicalSmilesForFeatureRefs(
    reaction.chemistry_feature_ref_ids,
    options.canonical_rxn_smiles_by_feature_ref ?? {}
  );
  const warnings = canonicalRxnSmiles ? [] : ["canonical_rxn_smiles_not_available"];
  return {
    reaction_entity_id: reaction.reaction_entity_id,
    document_id: reaction.document_id,
    source_hash: sourceHashForReaction(index, reaction),
    participant_signature: reaction.participant_signature,
    reaction_signature: reaction.reaction_signature,
    ...(canonicalRxnSmiles ? { canonical_rxn_smiles: canonicalRxnSmiles } : {}),
    chemistry_feature_ref_ids: [...reaction.chemistry_feature_ref_ids],
    semantic_context: {
      ...(reaction.reaction_family ? { reaction_family: reaction.reaction_family } : {}),
      ...(reaction.procedure_signature ? { procedure_signature: reaction.procedure_signature } : {}),
      ...(reaction.condition_signature ? { condition_signature: reaction.condition_signature } : {}),
      ...(reaction.route_id ? { route_id: reaction.route_id } : {}),
      changed_variable_fields: [...reaction.changed_variable_fields],
      controlled_variable_fields: [...reaction.controlled_variable_fields]
    },
    warnings
  };
};

export const buildReactionIntelligenceCanonicalInput = (
  index: ChemdTrainingGraphIndexV1,
  options: BuildReactionIntelligenceCanonicalInputOptions = {}
): ReactionIntelligenceCanonicalInput => {
  const reactions = index.reaction_features.map((reaction) =>
    buildCanonicalReactionInput(index, reaction, options)
  );
  const missingCount = reactions.filter((reaction) =>
    reaction.canonical_rxn_smiles === undefined
  ).length;
  return {
    schema_version: "chemd-reaction-intelligence-canonical-input/v0.1",
    graph_index_id: options.graph_index_id ?? `graph-index::${createStableHash(index.index_scope.document_ids.join("|"))}`,
    graph_index_schema_version: index.schema_version,
    document_ids: [...index.index_scope.document_ids],
    source_compile_run_ids: [...(options.source_compile_run_ids ?? [])],
    reactions,
    compute_ready_reaction_count: reactions.length - missingCount,
    warnings: missingCount > 0 ? [`canonical_rxn_smiles_missing_for_reactions:${missingCount}`] : []
  };
};

const defaultProviderPolicy = (
  policy: BuildReactionIntelligenceServiceJobOptions["provider_policy"] = {}
): ReactionIntelligenceServiceJob["provider_policy"] => ({
  missing_dependency: policy.missing_dependency ?? "skip",
  per_reaction_failure: policy.per_reaction_failure ?? "warn",
  allow_network: false
});

const serviceJobReaction = (
  reaction: ReactionIntelligenceCanonicalReactionInput
): ReactionIntelligenceServiceJob["reactions"][number] | undefined => {
  if (!reaction.canonical_rxn_smiles) return undefined;
  return {
    reaction_entity_id: reaction.reaction_entity_id,
    document_id: reaction.document_id,
    canonical_rxn_smiles: reaction.canonical_rxn_smiles,
    participant_signature: reaction.participant_signature,
    source_hash: reaction.source_hash,
    ...(reaction.semantic_context.reaction_family
      ? { reaction_family: reaction.semantic_context.reaction_family }
      : {}),
    ...(reaction.semantic_context.procedure_signature
      ? { procedure_signature: reaction.semantic_context.procedure_signature }
      : {}),
    ...(reaction.semantic_context.condition_signature
      ? { condition_signature: reaction.semantic_context.condition_signature }
      : {})
  };
};

export const buildReactionIntelligenceServiceJob = (
  input: ReactionIntelligenceCanonicalInput,
  options: BuildReactionIntelligenceServiceJobOptions = {}
): ReactionIntelligenceServiceJobBuildResult => {
  const reactions = input.reactions.flatMap((reaction) => {
    const serviceReaction = serviceJobReaction(reaction);
    return serviceReaction ? [serviceReaction] : [];
  });
  const skippedReactionEntityIds = input.reactions
    .filter((reaction) => !reaction.canonical_rxn_smiles)
    .map((reaction) => reaction.reaction_entity_id);
  return {
    job: {
      schema_version: "chemd-reaction-intelligence-job/v0.1",
      job_id: options.job_id ?? `reaction-intelligence-job::${createStableHash(input.graph_index_id)}`,
      graph_index_id: input.graph_index_id,
      source_compile_run_ids: [...input.source_compile_run_ids],
      reactions,
      requested_providers: [...(options.requested_providers ?? ["rdkit_fingerprint", "hybrid_graph"])],
      provider_policy: defaultProviderPolicy(options.provider_policy)
    },
    skipped_reaction_entity_ids: skippedReactionEntityIds,
    warnings: skippedReactionEntityIds.map((reactionId) =>
      `service_job_reaction_skipped_missing_canonical_rxn_smiles:${reactionId}`
    )
  };
};

const cloneGraphIndex = (index: ChemdTrainingGraphIndexV1): ChemdTrainingGraphIndexV1 => ({
  ...index,
  index_scope: {
    document_ids: [...index.index_scope.document_ids],
    sources: index.index_scope.sources.map((source) => ({ ...source }))
  },
  nodes: index.nodes.map((node) => ({
    ...node,
    ...(node.properties ? { properties: { ...node.properties } } : {})
  })),
  edges: index.edges.map((edge) => ({
    ...edge,
    ...(edge.properties ? { properties: { ...edge.properties } } : {})
  })),
  reaction_features: index.reaction_features.map((feature) => ({
    ...feature,
    chemistry_feature_ref_ids: [...feature.chemistry_feature_ref_ids],
    cluster_keys: feature.cluster_keys.map((key) => ({ ...key })),
    changed_variable_fields: [...feature.changed_variable_fields],
    controlled_variable_fields: [...feature.controlled_variable_fields]
  })),
  reaction_clusters: index.reaction_clusters.map((cluster) => ({
    ...cluster,
    member_reaction_entity_ids: [...cluster.member_reaction_entity_ids],
    document_ids: [...cluster.document_ids],
    shared_features: [...cluster.shared_features],
    warnings: [...cluster.warnings]
  })),
  reaction_similarity_edges: index.reaction_similarity_edges.map((edge) => ({
    ...edge,
    basis: [...edge.basis],
    warnings: [...edge.warnings]
  })),
  warnings: [...index.warnings]
});

const emptyLayer = (warnings: string[]): MergedReactionIntelligenceLayer => ({
  schema_version: "chemd-reaction-intelligence-graph-layer/v0.1",
  provider_statuses: [],
  computed_features: [],
  computed_similarity_edges: [],
  warnings
});

const featureIsMergeable = (
  feature: ReactionIntelligenceComputedFeature,
  reactionIds: ReadonlySet<string>,
  options: MergeReactionIntelligenceOptions
): boolean =>
  reactionIds.has(feature.reaction_entity_id)
  && (feature.status === "AVAILABLE" || options.keep_unavailable_features === true);

const edgeIsMergeable = (
  edge: ReactionIntelligenceComputedSimilarityEdge,
  reactionIds: ReadonlySet<string>
): boolean =>
  reactionIds.has(edge.from_reaction_entity_id)
  && reactionIds.has(edge.to_reaction_entity_id)
  && edge.source === "computed_artifact"
  && Number.isFinite(edge.score);

const normalizeFeatures = (
  artifact: ReactionIntelligenceArtifact,
  reactionIds: ReadonlySet<string>,
  options: MergeReactionIntelligenceOptions
): ReactionIntelligenceComputedFeature[] =>
  artifact.computed_features
    .filter((feature) => featureIsMergeable(feature, reactionIds, options))
    .map((feature) => ({
      ...feature,
      warnings: [...feature.warnings]
    }));

const normalizeEdges = (
  artifact: ReactionIntelligenceArtifact,
  reactionIds: ReadonlySet<string>
): ReactionIntelligenceComputedSimilarityEdge[] =>
  artifact.computed_similarity_edges
    .filter((edge) => edgeIsMergeable(edge, reactionIds))
    .map((edge) => ({
      ...edge,
      basis: [...edge.basis],
      contributions: edge.contributions.map((contribution) => ({
        ...contribution,
        warnings: [...contribution.warnings]
      })),
      warnings: [...edge.warnings]
    }));

const normalizeLayout = (
  artifact: ReactionIntelligenceArtifact,
  reactionIds: ReadonlySet<string>
): ReactionIntelligenceLayout | undefined => {
  if (!artifact.layout) return undefined;
  if (artifact.layout.status !== "OK") {
    return {
      ...artifact.layout,
      nodes: artifact.layout.nodes.map((node) => ({ ...node, warnings: [...node.warnings] })),
      warnings: [...artifact.layout.warnings]
    };
  }
  return {
    ...artifact.layout,
    nodes: artifact.layout.nodes
      .filter((node) => reactionIds.has(node.reaction_entity_id))
      .map((node) => ({ ...node, warnings: [...node.warnings] })),
    warnings: [...artifact.layout.warnings]
  };
};

const normalizeClusters = (
  artifact: ReactionIntelligenceArtifact,
  reactionIds: ReadonlySet<string>
): ReactionIntelligenceCluster[] | undefined => {
  if (!artifact.clusters) return undefined;
  return artifact.clusters
    .filter((cluster) =>
      cluster.reaction_entity_ids.length > 0
      && cluster.reaction_entity_ids.every((reactionId) => reactionIds.has(reactionId))
      && reactionIds.has(cluster.representative_reaction_entity_id)
    )
    .map((cluster) => ({
      ...cluster,
      reaction_entity_ids: [...cluster.reaction_entity_ids],
      basis_summary: [...cluster.basis_summary],
      warnings: [...cluster.warnings]
    }));
};

const skippedProviderWarnings = (artifact: ReactionIntelligenceArtifact): string[] =>
  artifact.provider_statuses.flatMap((status) => [
    ...status.warnings,
    ...(status.status === "SKIP" ? [`provider_skipped:${status.provider}`] : []),
    ...(status.status === "ERROR" ? [`provider_error:${status.provider}`] : [])
  ]);

const droppedArtifactWarnings = (
  artifact: ReactionIntelligenceArtifact,
  features: ReactionIntelligenceComputedFeature[],
  edges: ReactionIntelligenceComputedSimilarityEdge[]
): string[] => {
  const featureIds = new Set(features.map((feature) => feature.feature_id));
  const edgeIds = new Set(edges.map((edge) => edge.edge_id));
  return uniqueStrings([
    ...artifact.computed_features
      .filter((feature) => !featureIds.has(feature.feature_id))
      .map((feature) => `computed_feature_not_merged:${feature.feature_id}`),
    ...artifact.computed_similarity_edges
      .filter((edge) => !edgeIds.has(edge.edge_id))
      .map((edge) => `computed_similarity_edge_not_merged:${edge.edge_id}`)
  ]);
};

const buildLayer = (
  artifact: ReactionIntelligenceArtifact,
  reactionIds: ReadonlySet<string>,
  options: MergeReactionIntelligenceOptions
): MergedReactionIntelligenceLayer => {
  const computedFeatures = normalizeFeatures(artifact, reactionIds, options);
  const computedEdges = normalizeEdges(artifact, reactionIds);
  const layout = normalizeLayout(artifact, reactionIds);
  const clusters = normalizeClusters(artifact, reactionIds);
  return {
    schema_version: "chemd-reaction-intelligence-graph-layer/v0.1",
    source_artifact_id: artifact.artifact_id,
    job_id: artifact.job_id,
    provider_statuses: artifact.provider_statuses.map((status) => ({
      ...status,
      warnings: [...status.warnings]
    })),
    computed_features: computedFeatures,
    computed_similarity_edges: computedEdges,
    ...(clusters ? { clusters } : {}),
    ...(layout ? { layout } : {}),
    warnings: uniqueStrings([
      ...artifact.warnings,
      ...skippedProviderWarnings(artifact),
      ...droppedArtifactWarnings(artifact, computedFeatures, computedEdges)
    ])
  };
};

export const mergeReactionIntelligenceArtifactIntoGraphIndex = (
  index: ChemdTrainingGraphIndexV1,
  artifact?: ReactionIntelligenceArtifact,
  options: MergeReactionIntelligenceOptions = {}
): ChemdReactionIntelligenceGraphIndex => {
  const clonedIndex = cloneGraphIndex(index);
  if (!artifact) {
    return {
      ...clonedIndex,
      reaction_intelligence: emptyLayer(["reaction_intelligence_artifact_not_available"])
    };
  }

  const reactionIds = new Set(clonedIndex.reaction_features.map((feature) => feature.reaction_entity_id));
  return {
    ...clonedIndex,
    reaction_intelligence: buildLayer(artifact, reactionIds, options)
  };
};

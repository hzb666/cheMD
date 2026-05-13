import {
  REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION,
  type ChemdReactionIntelligenceArtifactV1
} from "@chemd/reaction-map";
import type {
  BuildPostgresRuntimeGraphRagInput,
  RuntimeEditorGraphEdge,
  RuntimeEditorGraphNode
} from "./graph-rag-runtime-types";

export type { ChemdReactionIntelligenceArtifactV1 } from "@chemd/reaction-map";

type ReactionIntelligenceSimilarityEdge =
  ChemdReactionIntelligenceArtifactV1["similarity_edges"][number];

export interface ReactionIntelligenceArtifactValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BuildReactionIntelligenceRuntimeGraphRagInputOptions {
  artifact?: ChemdReactionIntelligenceArtifactV1 | null;
  baseInput: BuildPostgresRuntimeGraphRagInput;
}

export interface BuildReactionIntelligenceRuntimeGraphRagInputResult {
  input: BuildPostgresRuntimeGraphRagInput;
  appendedEdgeCount: number;
  validation: ReactionIntelligenceArtifactValidationResult;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString);

const uniqueStrings = (values: readonly string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "en")
  );

const validateArtifact = (
  artifact: ChemdReactionIntelligenceArtifactV1 | null | undefined
): ReactionIntelligenceArtifactValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(artifact)) {
    return { valid: false, errors: ["artifact is required"], warnings };
  }
  if (artifact.schema_version !== REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION) {
    errors.push("schema_version is invalid");
  }
  ["artifact_id", "job_id", "graph_index_id", "generated_at"].forEach((field) => {
    if (!isNonEmptyString(artifact[field])) {
      errors.push(`${field} is required`);
    }
  });
  if (!Array.isArray(artifact.providers)) errors.push("providers must be a list");
  if (!Array.isArray(artifact.reaction_features)) errors.push("reaction_features must be a list");
  if (!Array.isArray(artifact.similarity_edges)) errors.push("similarity_edges must be a list");
  if (!isStringArray(artifact.warnings)) errors.push("warnings must be strings");
  if (Array.isArray(artifact.similarity_edges) && artifact.similarity_edges.length === 0) {
    warnings.push("similarity_edges is empty");
  }
  if (Array.isArray(artifact.similarity_edges)) {
    artifact.similarity_edges.forEach((edge, index) => validateEdge(edge, index, errors));
  }
  return { valid: errors.length === 0, errors, warnings };
};

const validateEdge = (
  edge: unknown,
  index: number,
  errors: string[]
): void => {
  if (!isRecord(edge)) {
    errors.push(`similarity_edges[${index}] must be an object`);
    return;
  }
  [
    "edge_id",
    "from_reaction_entity_id",
    "to_reaction_entity_id",
    "confidence"
  ].forEach((field) => {
    if (!isNonEmptyString(edge[field])) {
      errors.push(`similarity_edges[${index}].${field} is required`);
    }
  });
  if (typeof edge.score !== "number" || !Number.isFinite(edge.score)) {
    errors.push(`similarity_edges[${index}].score must be a finite number`);
  }
  ["basis", "provider_ids", "source_hashes", "warnings"].forEach((field) => {
    if (!isStringArray(edge[field])) {
      errors.push(`similarity_edges[${index}].${field} must be strings`);
    }
  });
};

const mergeInput = (
  baseInput: BuildPostgresRuntimeGraphRagInput,
  appendedEdges: readonly RuntimeEditorGraphEdge[]
): BuildPostgresRuntimeGraphRagInput => {
  const edges = [...(baseInput.edges ?? []), ...appendedEdges];
  return {
    ...baseInput,
    graphSnapshot: {
      ...baseInput.graphSnapshot,
      nodeCount: baseInput.graphSnapshot.nodeCount ?? baseInput.nodes?.length ?? 0,
      edgeCount: edges.length
    },
    nodes: baseInput.nodes,
    edges
  };
};

const nodeIdForReaction = (
  reactionEntityId: string,
  nodes: readonly RuntimeEditorGraphNode[] | undefined
): string => {
  const node = nodes?.find((item) =>
    item.entityId === reactionEntityId || item.nodeId === reactionEntityId
  );
  return node?.nodeId ?? reactionEntityId;
};

const featureEvidence = (
  artifact: ChemdReactionIntelligenceArtifactV1,
  edge: ReactionIntelligenceSimilarityEdge
): Record<string, unknown>[] =>
  artifact.reaction_features
    .filter((feature) =>
      feature.reaction_entity_id === edge.from_reaction_entity_id
      || feature.reaction_entity_id === edge.to_reaction_entity_id
      || edge.source_hashes.includes(feature.source_hash)
    )
    .map((feature) => ({
      reaction_entity_id: feature.reaction_entity_id,
      source_hash: feature.source_hash,
      fingerprint_refs: feature.fingerprint_refs,
      atom_mapping: feature.atom_mapping
        ? {
          provider: feature.atom_mapping.provider,
          confidence: feature.atom_mapping.confidence,
          mapping_hash: feature.atom_mapping.mapping_hash,
          warnings: feature.atom_mapping.warnings
        }
        : undefined,
      reaction_center: feature.reaction_center,
      warnings: feature.warnings
    }));

const providerEvidence = (
  artifact: ChemdReactionIntelligenceArtifactV1,
  providerIds: readonly string[]
): Record<string, unknown>[] => {
  const selected = new Set(providerIds);
  return artifact.providers
    .filter((provider) => selected.has(provider.provider_id))
    .map((provider) => ({
      provider_id: provider.provider_id,
      kind: provider.kind,
      status: provider.status,
      package_name: provider.package_name,
      package_version: provider.package_version,
      model_id: provider.model_id,
      model_hash: provider.model_hash,
      warnings: provider.warnings
    }));
};

const edgeEvidence = (
  artifact: ChemdReactionIntelligenceArtifactV1,
  edge: ReactionIntelligenceSimilarityEdge
): Record<string, unknown> => ({
  source: "chemd_reaction_intelligence_artifact",
  artifact_id: artifact.artifact_id,
  job_id: artifact.job_id,
  graph_index_id: artifact.graph_index_id,
  artifact_generated_at: artifact.generated_at,
  similarity_edge_id: edge.edge_id,
  score: edge.score,
  basis: edge.basis,
  provider_ids: edge.provider_ids,
  providers: providerEvidence(artifact, edge.provider_ids),
  source_hashes: edge.source_hashes,
  reaction_features: featureEvidence(artifact, edge),
  warnings: uniqueStrings([...artifact.warnings, ...edge.warnings])
});

const buildArtifactEdges = (
  artifact: ChemdReactionIntelligenceArtifactV1,
  baseInput: BuildPostgresRuntimeGraphRagInput
): RuntimeEditorGraphEdge[] =>
  artifact.similarity_edges.map((edge) => ({
    edgeId: `reaction-intelligence::${artifact.artifact_id}::${edge.edge_id}`,
    graphSnapshotId: baseInput.graphSnapshot.graphSnapshotId,
    experimentId: baseInput.graphSnapshot.experimentId,
    fromNodeId: nodeIdForReaction(edge.from_reaction_entity_id, baseInput.nodes),
    toNodeId: nodeIdForReaction(edge.to_reaction_entity_id, baseInput.nodes),
    edgeType: "semantic_similarity",
    confidence: edge.confidence,
    evidence: edgeEvidence(artifact, edge),
    createdAt: artifact.generated_at
  }));

export const buildReactionIntelligenceRuntimeGraphRagInput = (
  options: BuildReactionIntelligenceRuntimeGraphRagInputOptions
): BuildReactionIntelligenceRuntimeGraphRagInputResult => {
  const validation = validateArtifact(options.artifact);
  if (!validation.valid || !options.artifact) {
    return {
      input: mergeInput(options.baseInput, []),
      appendedEdgeCount: 0,
      validation
    };
  }
  const appendedEdges = buildArtifactEdges(options.artifact, options.baseInput);
  return {
    input: mergeInput(options.baseInput, appendedEdges),
    appendedEdgeCount: appendedEdges.length,
    validation
  };
};

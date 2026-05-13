import type { ChemdTrainingGraphIndexV1, TrainingReactionGraphFeatureV1 } from "@chemd/exporter-training";

export const REACTION_INTELLIGENCE_JOB_SCHEMA_VERSION = "chemd-reaction-intelligence-job/v0.1";
export const REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION = "chemd-reaction-intelligence-artifact/v0.1";

export type ChemdReactionIntelligenceProviderKindV1 = "rdkit_fingerprint" | "rxnmapper" | "rxnfp" | "hybrid_graph" | "tmap_layout";

export type ChemdReactionIntelligenceProviderStatusV1 = "PASS" | "SKIP" | "ERROR";
export type ChemdReactionIntelligenceMissingDependencyPolicyV1 = "skip" | "error" | "fallback";
export type ChemdReactionIntelligencePerReactionFailurePolicyV1 = "warn" | "error";
export type ChemdComputedReactionFeatureProviderV1 = "rdkit" | "rxnfp";
export type ChemdComputedReactionFeatureKindV1 = "bit_vector" | "float_embedding" | "minhash";
export type ChemdComputedReactionFeatureStorageV1 = "inline" | "sidecar_file" | "postgres_vector";
export type ChemdReactionIntelligenceConfidenceV1 = "high" | "medium" | "low";

export type ChemdComputedSimilarityBasisV1 = "rdkit_fingerprint_tanimoto" | "rxnfp_cosine" | "same_reaction_center" | "compatible_reaction_center" | "semantic_family_support" | "semantic_procedure_support" | "hybrid_consensus";

export interface ChemdReactionIntelligenceReactionInputV1 {
  reaction_entity_id: string;
  document_id: string;
  source_range?: unknown;
  canonical_rxn_smiles: string;
  participant_signature: string;
  reaction_family?: string;
  procedure_signature?: string;
  condition_signature?: string;
  source_hash: string;
}

export interface ChemdReactionIntelligenceProviderPolicyV1 {
  missing_dependency: ChemdReactionIntelligenceMissingDependencyPolicyV1;
  per_reaction_failure: ChemdReactionIntelligencePerReactionFailurePolicyV1;
  allow_network: false;
}

export interface ChemdReactionIntelligenceJobInputV1 {
  schema_version: typeof REACTION_INTELLIGENCE_JOB_SCHEMA_VERSION;
  job_id: string;
  graph_index_id: string;
  source_compile_run_ids: string[];
  reactions: ChemdReactionIntelligenceReactionInputV1[];
  requested_providers: ChemdReactionIntelligenceProviderKindV1[];
  provider_policy: ChemdReactionIntelligenceProviderPolicyV1;
}

export interface ChemdReactionIntelligenceProviderReportV1 {
  provider_id: string;
  kind: ChemdReactionIntelligenceProviderKindV1;
  status: ChemdReactionIntelligenceProviderStatusV1;
  package_name?: string;
  package_version?: string;
  model_id?: string;
  model_hash?: string;
  warnings: string[];
}

export interface ChemdComputedReactionFingerprintRefV1 {
  feature_ref_id: string;
  provider: ChemdComputedReactionFeatureProviderV1;
  kind: ChemdComputedReactionFeatureKindV1;
  dimension: number;
  storage: ChemdComputedReactionFeatureStorageV1;
  hash: string;
}

export interface ChemdComputedReactionFeatureV1 {
  reaction_entity_id: string;
  source_hash: string;
  canonical_rxn_smiles: string;
  fingerprint_refs: ChemdComputedReactionFingerprintRefV1[];
  atom_mapping?: {
    provider: "rxnmapper";
    mapped_rxn: string;
    confidence: number;
    mapping_hash: string;
    warnings: string[];
  };
  reaction_center?: {
    provider: "rxnmapper_derived";
    center_signature: string;
    changed_bonds: string[];
    changed_atoms: string[];
    confidence: ChemdReactionIntelligenceConfidenceV1;
    warnings: string[];
  };
  warnings: string[];
}

export interface ChemdComputedReactionSimilarityEdgeV1 {
  edge_id: string;
  from_reaction_entity_id: string;
  to_reaction_entity_id: string;
  score: number;
  confidence: ChemdReactionIntelligenceConfidenceV1;
  basis: ChemdComputedSimilarityBasisV1[];
  provider_ids: string[];
  source_hashes: string[];
  warnings: string[];
}

export interface ChemdReactionIntelligenceArtifactV1 {
  schema_version: typeof REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION;
  artifact_id: string;
  job_id: string;
  graph_index_id: string;
  generated_at: string;
  providers: ChemdReactionIntelligenceProviderReportV1[];
  reaction_features: ChemdComputedReactionFeatureV1[];
  similarity_edges: ChemdComputedReactionSimilarityEdgeV1[];
  layout?: unknown;
  warnings: string[];
}

export interface ReactionIntelligenceSourceMetadata {
  canonical_rxn_smiles: string;
  source_hash: string;
  source_range?: unknown;
}

export interface BuildReactionIntelligenceJobInputOptions {
  job_id: string;
  graph_index_id?: string;
  source_compile_run_ids?: string[];
  requested_providers: ChemdReactionIntelligenceProviderKindV1[];
  provider_policy?: ChemdReactionIntelligenceProviderPolicyV1;
  reaction_sources: Record<string, ReactionIntelligenceSourceMetadata>;
}

const DEFAULT_PROVIDER_POLICY: ChemdReactionIntelligenceProviderPolicyV1 = {
  missing_dependency: "skip",
  per_reaction_failure: "warn",
  allow_network: false
};

const PROVIDER_KINDS = new Set<string>(["rdkit_fingerprint", "rxnmapper", "rxnfp", "hybrid_graph", "tmap_layout"]);
const PROVIDER_STATUSES = new Set<string>(["PASS", "SKIP", "ERROR"]);
const CONFIDENCE_VALUES = new Set<string>(["high", "medium", "low"]);
const COMPUTED_SIMILARITY_BASIS = new Set<string>(["rdkit_fingerprint_tanimoto", "rxnfp_cosine", "same_reaction_center", "compatible_reaction_center", "semantic_family_support", "semantic_procedure_support", "hybrid_consensus"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const pushMissingString = (
  errors: string[],
  record: Record<string, unknown>,
  field: string,
  label = field
): void => {
  if (!isString(record[field])) errors.push(`${label} is required`);
};

const validateProviderPolicy = (value: unknown, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push("provider_policy is required");
    return;
  }
  if (!["skip", "error", "fallback"].includes(String(value.missing_dependency))) {
    errors.push("provider_policy.missing_dependency is invalid");
  }
  if (!["warn", "error"].includes(String(value.per_reaction_failure))) {
    errors.push("provider_policy.per_reaction_failure is invalid");
  }
  if (value.allow_network !== false) errors.push("provider_policy.allow_network must be false");
};

const validateReactionInput = (value: unknown, index: number, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push(`reactions[${index}] must be an object`);
    return;
  }
  [
    "reaction_entity_id",
    "document_id",
    "canonical_rxn_smiles",
    "participant_signature",
    "source_hash"
  ].forEach((field) => pushMissingString(errors, value, field, `reactions[${index}].${field}`));
};

export const validateReactionIntelligenceJobInput = (value: unknown): string[] => {
  const errors: string[] = [];
  if (!isRecord(value)) return ["input must be an object"];
  if (value.schema_version !== REACTION_INTELLIGENCE_JOB_SCHEMA_VERSION) {
    errors.push("schema_version is invalid");
  }
  ["job_id", "graph_index_id"].forEach((field) => pushMissingString(errors, value, field));
  if (!isStringArray(value.source_compile_run_ids)) errors.push("source_compile_run_ids must be strings");
  if (!isStringArray(value.requested_providers)) errors.push("requested_providers must be strings");
  else if (value.requested_providers.some((item) => !PROVIDER_KINDS.has(item))) {
    errors.push("requested_providers contains invalid provider");
  }
  if (!Array.isArray(value.reactions)) errors.push("reactions must be a list");
  else value.reactions.forEach((item, index) => validateReactionInput(item, index, errors));
  validateProviderPolicy(value.provider_policy, errors);
  return errors;
};

const validateProviderReport = (value: unknown, index: number, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push(`providers[${index}] must be an object`);
    return;
  }
  ["provider_id", "kind", "status"].forEach((field) => pushMissingString(errors, value, field, `providers[${index}].${field}`));
  if (isString(value.kind) && !PROVIDER_KINDS.has(value.kind)) errors.push(`providers[${index}].kind is invalid`);
  if (isString(value.status) && !PROVIDER_STATUSES.has(value.status)) errors.push(`providers[${index}].status is invalid`);
  if (!isStringArray(value.warnings)) errors.push(`providers[${index}].warnings must be strings`);
};

const validateComputedFeature = (value: unknown, index: number, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push(`reaction_features[${index}] must be an object`);
    return;
  }
  ["reaction_entity_id", "source_hash", "canonical_rxn_smiles"].forEach((field) => pushMissingString(errors, value, field, `reaction_features[${index}].${field}`));
  if (!Array.isArray(value.fingerprint_refs)) errors.push(`reaction_features[${index}].fingerprint_refs must be a list`);
  if (!isStringArray(value.warnings)) errors.push(`reaction_features[${index}].warnings must be strings`);
};

const validateComputedEdge = (value: unknown, index: number, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push(`similarity_edges[${index}] must be an object`);
    return;
  }
  ["edge_id", "from_reaction_entity_id", "to_reaction_entity_id", "confidence"].forEach((field) => pushMissingString(errors, value, field, `similarity_edges[${index}].${field}`));
  if (typeof value.score !== "number") errors.push(`similarity_edges[${index}].score must be a number`);
  if (isString(value.confidence) && !CONFIDENCE_VALUES.has(value.confidence)) {
    errors.push(`similarity_edges[${index}].confidence is invalid`);
  }
  ["basis", "provider_ids", "source_hashes", "warnings"].forEach((field) => {
    if (!isStringArray(value[field])) errors.push(`similarity_edges[${index}].${field} must be strings`);
  });
  if (isStringArray(value.basis) && value.basis.some((item) => !COMPUTED_SIMILARITY_BASIS.has(item))) {
    errors.push(`similarity_edges[${index}].basis contains invalid basis`);
  }
};

export const validateReactionIntelligenceArtifact = (value: unknown): string[] => {
  const errors: string[] = [];
  if (!isRecord(value)) return ["artifact must be an object"];
  if (value.schema_version !== REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION) {
    errors.push("schema_version is invalid");
  }
  ["artifact_id", "job_id", "graph_index_id", "generated_at"].forEach((field) => pushMissingString(errors, value, field));
  if (!Array.isArray(value.providers)) errors.push("providers must be a list");
  else value.providers.forEach((item, index) => validateProviderReport(item, index, errors));
  if (!Array.isArray(value.reaction_features)) errors.push("reaction_features must be a list");
  else value.reaction_features.forEach((item, index) => validateComputedFeature(item, index, errors));
  if (!Array.isArray(value.similarity_edges)) errors.push("similarity_edges must be a list");
  else value.similarity_edges.forEach((item, index) => validateComputedEdge(item, index, errors));
  if (!isStringArray(value.warnings)) errors.push("warnings must be strings");
  return errors;
};

const toReactionInput = (
  feature: TrainingReactionGraphFeatureV1,
  source: ReactionIntelligenceSourceMetadata
): ChemdReactionIntelligenceReactionInputV1 => ({
  reaction_entity_id: feature.reaction_entity_id,
  document_id: feature.document_id,
  source_range: source.source_range,
  canonical_rxn_smiles: source.canonical_rxn_smiles,
  participant_signature: feature.participant_signature,
  reaction_family: feature.reaction_family,
  procedure_signature: feature.procedure_signature,
  condition_signature: feature.condition_signature,
  source_hash: source.source_hash
});

export const buildReactionIntelligenceJobInputFromGraphIndex = (
  graphIndex: ChemdTrainingGraphIndexV1,
  options: BuildReactionIntelligenceJobInputOptions
): ChemdReactionIntelligenceJobInputV1 => {
  const reactions = graphIndex.reaction_features.map((feature) => {
    const source = options.reaction_sources[feature.reaction_entity_id];
    if (!source) throw new Error(`missing reaction source metadata for ${feature.reaction_entity_id}`);
    return toReactionInput(feature, source);
  });
  return {
    schema_version: REACTION_INTELLIGENCE_JOB_SCHEMA_VERSION,
    job_id: options.job_id,
    graph_index_id: options.graph_index_id ?? "graph-index::reaction-intelligence",
    source_compile_run_ids: options.source_compile_run_ids ?? graphIndex.index_scope.document_ids,
    reactions,
    requested_providers: options.requested_providers,
    provider_policy: options.provider_policy ?? DEFAULT_PROVIDER_POLICY
  };
};

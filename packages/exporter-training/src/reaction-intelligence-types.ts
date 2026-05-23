import type {
  ChemdTrainingGraphIndexV1,
  TrainingReactionSimilarityEdgeV1
} from "./graph-index-types";

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type ReactionIntelligenceJsonObject = { [key: string]: JsonValue };

export type ReactionIntelligenceProvider =
  | "semantic"
  | "drfp"
  | "rdkit_fingerprint"
  | "rxnmapper"
  | "rxnfp"
  | "reaction_center"
  | "tmap_layout";

export type ReactionIntelligenceProviderState = "OK" | "SKIP" | "ERROR";

export interface ReactionIntelligenceProviderStatus {
  provider: ReactionIntelligenceProvider;
  status: ReactionIntelligenceProviderState;
  reason_code?: string;
  message?: string;
  warnings: string[];
  metadata?: ReactionIntelligenceJsonObject;
}

export interface ReactionIntelligenceJobReaction {
  reaction_entity_id: string;
  document_id: string;
  reaction_smiles?: string;
  chemistry_feature_ref_ids: string[];
  source: "training_graph_index";
}

export interface ReactionIntelligenceJob {
  schema_version: "chemd-reaction-intelligence-job/v0.1";
  job_id: string;
  created_at?: string;
  graph_index_schema_version: ChemdTrainingGraphIndexV1["schema_version"];
  document_ids: string[];
  requested_providers: ReactionIntelligenceProvider[];
  reactions: ReactionIntelligenceJobReaction[];
  options?: ReactionIntelligenceJsonObject;
}

export type ReactionIntelligenceComputedFeatureKind =
  | "drfp_reaction_fingerprint"
  | "rdkit_reaction_fingerprint"
  | "rxnfp_embedding"
  | "atom_mapping"
  | "reaction_center";

export type ReactionIntelligenceComputedFeatureStatus = "AVAILABLE" | "SKIP" | "ERROR";

export interface ReactionIntelligenceComputedFeature {
  feature_id: string;
  reaction_entity_id: string;
  provider: ReactionIntelligenceProvider;
  feature_kind: ReactionIntelligenceComputedFeatureKind;
  status: ReactionIntelligenceComputedFeatureStatus;
  source: "computed_artifact";
  confidence?: number;
  fingerprint_ref?: string;
  vector_ref?: string;
  embedding_dimension?: number;
  mapped_reaction_smiles?: string;
  reaction_center_signature?: string;
  warnings: string[];
  metadata?: ReactionIntelligenceJsonObject;
}

export type ReactionIntelligenceComputedSimilarityBasis =
  | "semantic_similarity"
  | "drfp_tanimoto"
  | "rdkit_tanimoto"
  | "rxnfp_cosine"
  | "atom_mapping_reaction_center"
  | "reaction_center_overlap"
  | "fingerprint_tanimoto"
  | "hybrid_computed";

export interface ReactionIntelligenceSimilarityContribution {
  basis: ReactionIntelligenceComputedSimilarityBasis;
  provider: ReactionIntelligenceProvider;
  score: number | null;
  weight: number;
  warnings: string[];
}

export interface ReactionIntelligenceComputedSimilarityEdge {
  edge_id: string;
  from_reaction_entity_id: string;
  to_reaction_entity_id: string;
  basis: ReactionIntelligenceComputedSimilarityBasis[];
  score: number;
  source: "computed_artifact";
  contributions: ReactionIntelligenceSimilarityContribution[];
  warnings: string[];
  metadata?: ReactionIntelligenceJsonObject;
}

export interface ReactionIntelligenceLayoutNode {
  reaction_entity_id: string;
  x: number;
  y: number;
  warnings: string[];
}

export interface ReactionIntelligenceLayout {
  layout_id: string;
  provider: "tmap_layout";
  status: ReactionIntelligenceProviderState;
  coordinate_system: "tmap_2d";
  nodes: ReactionIntelligenceLayoutNode[];
  warnings: string[];
  diagnostics?: ReactionIntelligenceJsonObject;
}

export interface ReactionIntelligenceCluster {
  cluster_id: string;
  reaction_entity_ids: string[];
  representative_reaction_entity_id: string;
  mean_score: number;
  basis_summary: ReactionIntelligenceComputedSimilarityBasis[];
  warnings: string[];
  metadata?: ReactionIntelligenceJsonObject;
}

export interface ReactionIntelligenceArtifact {
  schema_version: "chemd-reaction-intelligence-artifact/v0.1";
  artifact_id: string;
  job_id: string;
  generated_at?: string;
  graph_index_schema_version?: ChemdTrainingGraphIndexV1["schema_version"];
  provider_statuses: ReactionIntelligenceProviderStatus[];
  computed_features: ReactionIntelligenceComputedFeature[];
  computed_similarity_edges: ReactionIntelligenceComputedSimilarityEdge[];
  clusters?: ReactionIntelligenceCluster[];
  layout?: ReactionIntelligenceLayout;
  warnings: string[];
}

export interface MergedReactionIntelligenceLayer {
  schema_version: "chemd-reaction-intelligence-graph-layer/v0.1";
  source_artifact_id?: string;
  job_id?: string;
  provider_statuses: ReactionIntelligenceProviderStatus[];
  computed_features: ReactionIntelligenceComputedFeature[];
  computed_similarity_edges: ReactionIntelligenceComputedSimilarityEdge[];
  clusters?: ReactionIntelligenceCluster[];
  layout?: ReactionIntelligenceLayout;
  warnings: string[];
}

export interface ChemdReactionIntelligenceGraphIndex extends ChemdTrainingGraphIndexV1 {
  reaction_intelligence: MergedReactionIntelligenceLayer;
}

export interface MergeReactionIntelligenceOptions {
  keep_unavailable_features?: boolean;
}

export type ReactionIntelligenceSemanticSimilarityEdge = TrainingReactionSimilarityEdgeV1;

export interface ReactionIntelligenceCanonicalSemanticContext {
  reaction_family?: string;
  procedure_signature?: string;
  condition_signature?: string;
  route_id?: string;
  changed_variable_fields: string[];
  controlled_variable_fields: string[];
}

export interface ReactionIntelligenceCanonicalReactionInput {
  reaction_entity_id: string;
  document_id: string;
  source_hash: string;
  participant_signature: string;
  reaction_signature: string;
  canonical_rxn_smiles?: string;
  chemistry_feature_ref_ids: string[];
  semantic_context: ReactionIntelligenceCanonicalSemanticContext;
  warnings: string[];
}

export interface ReactionIntelligenceCanonicalInput {
  schema_version: "chemd-reaction-intelligence-canonical-input/v0.1";
  graph_index_id: string;
  graph_index_schema_version: ChemdTrainingGraphIndexV1["schema_version"];
  document_ids: string[];
  source_compile_run_ids: string[];
  reactions: ReactionIntelligenceCanonicalReactionInput[];
  compute_ready_reaction_count: number;
  warnings: string[];
}

export interface BuildReactionIntelligenceCanonicalInputOptions {
  graph_index_id?: string;
  source_compile_run_ids?: string[];
  canonical_rxn_smiles_by_feature_ref?: Record<string, string>;
}

export type ReactionIntelligenceServiceProvider =
  | "rdkit_fingerprint"
  | "rxnmapper"
  | "rxnfp"
  | "hybrid_graph"
  | "tmap_layout";

export interface ReactionIntelligenceServiceProviderPolicy {
  missing_dependency: "skip" | "error" | "fallback";
  per_reaction_failure: "warn" | "error";
  allow_network: false;
}

export interface ReactionIntelligenceServiceJobReaction {
  reaction_entity_id: string;
  document_id: string;
  canonical_rxn_smiles: string;
  participant_signature: string;
  source_hash: string;
  reaction_family?: string;
  procedure_signature?: string;
  condition_signature?: string;
}

export interface ReactionIntelligenceServiceJob {
  schema_version: "chemd-reaction-intelligence-job/v0.1";
  job_id: string;
  graph_index_id: string;
  source_compile_run_ids: string[];
  reactions: ReactionIntelligenceServiceJobReaction[];
  requested_providers: ReactionIntelligenceServiceProvider[];
  provider_policy: ReactionIntelligenceServiceProviderPolicy;
}

export interface BuildReactionIntelligenceServiceJobOptions {
  job_id?: string;
  requested_providers?: ReactionIntelligenceServiceProvider[];
  provider_policy?: Partial<ReactionIntelligenceServiceProviderPolicy>;
}

export interface ReactionIntelligenceServiceJobBuildResult {
  job: ReactionIntelligenceServiceJob;
  skipped_reaction_entity_ids: string[];
  warnings: string[];
}

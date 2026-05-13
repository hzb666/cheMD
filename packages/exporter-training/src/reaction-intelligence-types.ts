import type {
  ChemdTrainingGraphIndexV1,
  TrainingReactionSimilarityEdgeV1
} from "./graph-index-types";

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type ReactionIntelligenceJsonObject = { [key: string]: JsonValue };

export type ReactionIntelligenceProvider =
  | "semantic"
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
  | "rdkit_tanimoto"
  | "rxnfp_cosine"
  | "atom_mapping_reaction_center"
  | "reaction_center_overlap"
  | "fingerprint_tanimoto"
  | "hybrid_computed";

export interface ReactionIntelligenceSimilarityContribution {
  basis: ReactionIntelligenceComputedSimilarityBasis;
  provider: ReactionIntelligenceProvider;
  score: number;
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

export interface ReactionIntelligenceArtifact {
  schema_version: "chemd-reaction-intelligence-artifact/v0.1";
  artifact_id: string;
  job_id: string;
  generated_at?: string;
  graph_index_schema_version?: ChemdTrainingGraphIndexV1["schema_version"];
  provider_statuses: ReactionIntelligenceProviderStatus[];
  computed_features: ReactionIntelligenceComputedFeature[];
  computed_similarity_edges: ReactionIntelligenceComputedSimilarityEdge[];
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

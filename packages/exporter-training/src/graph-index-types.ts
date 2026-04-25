import type {
  TrainingCampaignTrajectoryKindV1,
  TrainingInferenceConfidenceV1,
  TrainingReactionFamilyV1
} from "./projection-types";

type JsonScalar = string | number | boolean | null;
type JsonObject = Record<string, JsonScalar | JsonScalar[]>;

export type TrainingReactionClusterBasisV1 =
  | "reaction_signature"
  | "reaction_family"
  | "procedure_signature"
  | "family_procedure"
  | "route"
  | "condition_signature"
  | "chemistry_feature_ref"
  | "campaign_trajectory";

export type TrainingReactionSimilarityBasisV1 =
  | "same_reaction_signature"
  | "same_reaction_family"
  | "same_procedure_signature"
  | "same_family_procedure"
  | "same_route"
  | "same_condition_signature"
  | "shared_chemistry_feature_ref";

export interface TrainingGraphIndexDocumentSourceV1 {
  document_id: string;
  file_path?: string;
  commit?: string;
  content_hash?: string;
}

export interface BuildTrainingGraphIndexOptions {
  document_sources?: TrainingGraphIndexDocumentSourceV1[];
  include_singleton_clusters?: boolean;
}

export interface TrainingGraphIndexNodeV1 {
  node_id: string;
  node_type: string;
  document_id?: string;
  entity_id?: string;
  label?: string;
  original_id?: string;
  properties?: JsonObject;
}

export interface TrainingGraphIndexEdgeV1 {
  edge_id: string;
  edge_type: string;
  from_node_id: string;
  to_node_id: string;
  document_id?: string;
  confidence?: number | null;
  properties?: JsonObject;
}

export interface TrainingReactionGraphFeatureV1 {
  reaction_entity_id: string;
  document_id: string;
  reaction_signature: string;
  participant_signature: string;
  fingerprint_status: "not_available" | "external_ref_available";
  chemistry_feature_ref_ids: string[];
  cluster_keys: Array<{ basis: TrainingReactionClusterBasisV1; key: string }>;
  changed_variable_fields: string[];
  controlled_variable_fields: string[];
  condition_signature?: string;
  procedure_signature?: string;
  reaction_family?: TrainingReactionFamilyV1;
  route_id?: string;
}

export interface TrainingReactionClusterV1 {
  cluster_id: string;
  basis: TrainingReactionClusterBasisV1;
  key: string;
  member_reaction_entity_ids: string[];
  document_ids: string[];
  confidence: TrainingInferenceConfidenceV1;
  shared_features: string[];
  warnings: string[];
  procedure_signature?: string;
  reaction_family?: TrainingReactionFamilyV1;
  trajectory_kind?: TrainingCampaignTrajectoryKindV1;
}

export interface TrainingReactionSimilarityEdgeV1 {
  edge_id: string;
  from_reaction_entity_id: string;
  to_reaction_entity_id: string;
  basis: TrainingReactionSimilarityBasisV1[];
  score: number;
  warnings: string[];
}

export interface ChemdTrainingGraphIndexV1 {
  schema_version: "chemd-training-graph-index/v0.1";
  index_scope: {
    document_ids: string[];
    sources: TrainingGraphIndexDocumentSourceV1[];
  };
  nodes: TrainingGraphIndexNodeV1[];
  edges: TrainingGraphIndexEdgeV1[];
  reaction_features: TrainingReactionGraphFeatureV1[];
  reaction_clusters: TrainingReactionClusterV1[];
  reaction_similarity_edges: TrainingReactionSimilarityEdgeV1[];
  warnings: string[];
}

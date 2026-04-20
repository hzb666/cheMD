import type {
  CanonicalStepNode,
  ObservationEventNode
} from "@chemd/step-ontology";

import type {
  ExportedAnalysisV1,
  ExportedDocumentInfo,
  ExportedMarkdownBlockV1,
  ExportedMoleculeV1,
  ExportedReactionV1,
  ExportedRelationV1,
  ExportedResultV1,
  ExportedSampleV1,
  RetrievalChunkV1,
  TrainingQualityV1
} from "./types";

type SourceMetadataKeys =
  | "node_index"
  | "source_node_type"
  | "source_block_type"
  | "syntax_origin"
  | "declared_kind"
  | "provenance"
  | "text_for_embedding";

export type ChemdRagChunkV1 = Omit<RetrievalChunkV1, "raw_text">;

export interface ChemdRagExportV1 {
  schema_version: "chemd-rag-export/v0.1";
  document: ExportedDocumentInfo;
  chunks: ChemdRagChunkV1[];
  quality: {
    rag_eligible: boolean;
    chunk_count: number;
    exclusion_reasons?: string[];
  };
}

export type TrainingMoleculeV1 = Omit<ExportedMoleculeV1, SourceMetadataKeys>;
export type TrainingReactionV1 = Omit<ExportedReactionV1, SourceMetadataKeys>;
export type TrainingResultV1 = Omit<ExportedResultV1, SourceMetadataKeys>;
export type TrainingAnalysisV1 = Omit<ExportedAnalysisV1, SourceMetadataKeys>;
export type TrainingSampleV1 = Omit<ExportedSampleV1, SourceMetadataKeys>;
export type TrainingNarrativeBlockV1 = Pick<
  ExportedMarkdownBlockV1,
  "entity_id" | "cleaned_text" | "references" | "inline_chem" | "inline_code" | "links"
>;

export interface TrainingUnderstandingEntitiesV1 {
  molecules: TrainingMoleculeV1[];
  reactions: TrainingReactionV1[];
  results: TrainingResultV1[];
  analyses: TrainingAnalysisV1[];
  samples: TrainingSampleV1[];
  narrative_blocks: TrainingNarrativeBlockV1[];
}

export interface TrainingResolvedReferenceV1 {
  raw: string;
  source_entity_id: string;
  source_entity_type: "markdown" | "reaction" | "result" | "analysis" | "sample";
  source_field?: string;
  target_entity_id?: string;
  target_original_id?: string;
  target_field?: string;
  relation_type?: ExportedRelationV1["relation_type"];
  resolution_status?: "resolved" | "unresolved";
  resolution_value?: unknown;
}

export interface TrainingProcedureLogicPairV1 {
  pair_id: string;
  procedure_id?: string;
  source_type?: "explicit_steps" | "lowered_prose";
  source_text: string;
  steps: CanonicalStepNode[];
  low_confidence_step_count?: number;
}

export interface TrainingObservationLogicPairV1 {
  pair_id: string;
  observation_id?: string;
  source_text: string;
  events: ObservationEventNode[];
}

export interface TrainingPrimaryEntityV1 {
  role: "molecule" | "reaction" | "result" | "analysis" | "sample";
  original_id: string;
  entity_id?: string;
}

export interface TrainingOutcomeLogicV1 {
  result_entity_id: string;
  reaction_entity_id?: string;
  status_label?: "success" | "partial" | "failed" | "unknown";
  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
  purity_percent?: number | null;
}

export interface TrainingExperimentVariableDeltaV1 {
  field: string;
  baseline_value?: string | number | boolean | null;
  candidate_value?: string | number | boolean | null;
}

export interface TrainingExperimentDesignContextV1 {
  context_id: string;
  reaction_entity_id: string;
  linked_result_entity_id?: string;
  series_id: string;
  variant_role: "baseline" | "variant" | "single_run";
  baseline_reaction_entity_id?: string;
  changed_variables: TrainingExperimentVariableDeltaV1[];
  controlled_variables: string[];
  evidence_entity_ids: string[];
}

export interface TrainingOutcomeQualityV1 {
  result_entity_id: string;
  reaction_entity_id?: string;
  yield_confidence: "confirmed" | "estimated" | "unknown";
  yield_basis: "isolated" | "nmr" | "lcms" | "crude" | "not_reported" | "unknown";
  result_confirmed_by_analysis: boolean;
  has_conflicting_values: boolean;
  target_usable_for_regression: boolean;
  evidence_entity_ids: string[];
  warnings: string[];
}

export interface TrainingEvidenceLinkV1 {
  evidence_entity_id: string;
  target_entity_id: string;
  relation_type: ExportedRelationV1["relation_type"];
  evidence_type: "analysis" | "sample";
}

export type TrainingKnowledgeNodeType =
  | "document"
  | "molecule"
  | "reaction"
  | "result"
  | "analysis"
  | "sample"
  | "narrative"
  | "procedure"
  | "procedure_step"
  | "observation"
  | "observation_event"
  | "field_value"
  | "normalized_value";

export type TrainingKnowledgeEdgeType =
  | ExportedRelationV1["relation_type"]
  | "procedure_has_step"
  | "step_precedes_step"
  | "step_depends_on_step"
  | "step_mentions_entity"
  | "observation_has_event"
  | "event_observed_step"
  | "entity_has_field_value"
  | "entity_has_normalized_value"
  | "raw_field_normalized_to"
  | "field_supported_by_evidence";

export interface TrainingKnowledgeNodeV1 {
  node_id: string;
  node_type: TrainingKnowledgeNodeType;
  label?: string;
  original_id?: string;
  is_primary?: boolean;
  subject_entity_id?: string;
  field?: string;
  value?: string | number | boolean | null;
}

export interface TrainingKnowledgeEdgeV1 {
  edge_id: string;
  edge_type: TrainingKnowledgeEdgeType;
  from_node_id: string;
  to_node_id: string;
  role?: string;
  confidence?: number | null;
  edge_source: "semantic_relation" | "procedure_logic" | "observation_logic" | "field_evidence" | "normalization";
}

export interface TrainingFieldEvidenceV1 {
  subject_entity_id: string;
  field: string;
  value: string | number | boolean | null;
  raw_value?: string;
  value_node_id: string;
  raw_value_node_id?: string;
  normalized?: boolean;
  evidence_entity_ids: string[];
  source_relation_ids: string[];
}

export interface TrainingMissingLogicV1 {
  code:
    | "no_reactions"
    | "no_results"
    | "primary_entity_unresolved"
    | "reaction_without_outcome"
    | "result_without_reaction_link"
    | "analysis_without_target"
    | "sample_without_lineage"
    | "procedure_without_steps"
    | "procedure_without_reaction_link"
    | "observation_without_event"
    | "observation_without_target"
    | "conflicting_result_values"
    | "unresolved_reference";
  severity: "info" | "warning" | "error";
  message: string;
  entity_id?: string;
  field?: string;
}

export interface TrainingKnowledgeGraphV1 {
  nodes: TrainingKnowledgeNodeV1[];
  edges: TrainingKnowledgeEdgeV1[];
  field_evidence: TrainingFieldEvidenceV1[];
  missing_logic: TrainingMissingLogicV1[];
}

export interface TrainingCanonicalSummaryV1 {
  text: string;
  source_entity_ids: string[];
}

export type LoraTaskTypeV1 =
  | "experiment_summary"
  | "entity_extraction"
  | "relation_extraction"
  | "reference_resolution"
  | "evidence_tracing"
  | "procedure_reasoning"
  | "yield_prediction"
  | "condition_recommendation"
  | "experiment_proposal"
  | "failure_analysis"
  | "experiment_comparison"
  | "consistency_check"
  | "qa_with_context";

export interface LoraTaskHintV1 {
  task_type: LoraTaskTypeV1;
  reason: string;
  source_entity_ids?: string[];
}

export interface TrainingLoraGenerationHintsV1 {
  recommended_tasks: LoraTaskHintV1[];
  blocked_tasks: LoraTaskHintV1[];
  split_hint: {
    document_id: string;
    date: string;
  };
}

export interface TrainingExperimentLogicV1 {
  primary_entities: TrainingPrimaryEntityV1[];
  outcomes: TrainingOutcomeLogicV1[];
  design_contexts: TrainingExperimentDesignContextV1[];
  outcome_quality: TrainingOutcomeQualityV1[];
  evidence_links: TrainingEvidenceLinkV1[];
  sample_lineage: TrainingEvidenceLinkV1[];
}

export interface ChemdTrainingUnderstandingV1 {
  schema_version: "chemd-training-understanding/v0.1";
  document: ExportedDocumentInfo & { summary?: string };
  canonical_summary?: TrainingCanonicalSummaryV1;
  entities: TrainingUnderstandingEntitiesV1;
  relations: ExportedRelationV1[];
  resolved_references: TrainingResolvedReferenceV1[];
  procedure_logic: {
    procedure_to_steps: TrainingProcedureLogicPairV1[];
    observation_to_events: TrainingObservationLogicPairV1[];
  };
  experiment_logic: TrainingExperimentLogicV1;
  knowledge_graph: TrainingKnowledgeGraphV1;
  lora_generation_hints: TrainingLoraGenerationHintsV1;
  quality: {
    usable_for_training: boolean;
    confidence_score: TrainingQualityV1["confidence_score"];
    warnings: string[];
    exclusion_reasons?: string[];
  };
}

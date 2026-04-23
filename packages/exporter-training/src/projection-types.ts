import type {
  CanonicalStepNode,
  ObservationEventNode
} from "@chemd/step-ontology";
import type { SourceSpan } from "@chemd/core";

import type {
  ExportedAnalysisV1,
  ExportedArtifactV1,
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
  | "field_source_spans"
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
export type TrainingArtifactV1 = Omit<ExportedArtifactV1, SourceMetadataKeys>;
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
  artifacts: TrainingArtifactV1[];
  narrative_blocks: TrainingNarrativeBlockV1[];
}

export interface TrainingResolvedReferenceV1 {
  raw: string;
  source_entity_id: string;
  source_entity_type: "markdown" | "reaction" | "result" | "analysis" | "sample" | "artifact";
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

export type TrainingReactionFamilyV1 =
  | "cross_coupling"
  | "oxidation"
  | "reduction"
  | "protection"
  | "deprotection"
  | "amidation"
  | "esterification"
  | "substitution"
  | "addition"
  | "elimination"
  | "unknown";

export type TrainingInferenceConfidenceV1 = "high" | "medium" | "low" | "unknown";

export interface TrainingReactionTaxonomyV1 {
  reaction_entity_id: string;
  reaction_family: TrainingReactionFamilyV1;
  transformation_tags: string[];
  confidence: TrainingInferenceConfidenceV1;
  evidence_entity_ids: string[];
  warnings: string[];
}

export interface TrainingOptimizationStepV1 {
  step_id: string;
  reaction_entity_id: string;
  linked_result_entity_id?: string;
  variant_role: TrainingExperimentDesignContextV1["variant_role"];
  changed_variables: TrainingExperimentVariableDeltaV1[];
  controlled_variables: string[];
  status_label?: TrainingOutcomeLogicV1["status_label"];
  yield_percent?: number | null;
  outcome_rank?: number;
  warnings: string[];
}

export interface TrainingOptimizationTrajectoryV1 {
  trajectory_id: string;
  series_id: string;
  baseline_reaction_entity_id?: string;
  best_reaction_entity_id?: string;
  best_yield_percent?: number | null;
  steps: TrainingOptimizationStepV1[];
  evidence_entity_ids: string[];
  warnings: string[];
}

export type TrainingFailureModeV1 =
  | "failed_status"
  | "low_yield"
  | "low_conversion"
  | "low_selectivity"
  | "low_purity"
  | "conflicting_result_values"
  | "analytical_uncertainty"
  | "missing_reaction_link";

export interface TrainingFailureSignalV1 {
  failure_id: string;
  result_entity_id: string;
  reaction_entity_id?: string;
  failure_modes: TrainingFailureModeV1[];
  evidence_entity_ids: string[];
  recommended_checks: string[];
  confidence: TrainingInferenceConfidenceV1;
  warnings: string[];
}

export type TrainingLogicSourceV1 = "explicit" | "derived" | "llm_suggested";
export type TrainingIntentKindV1 =
  | "synthesis"
  | "optimization"
  | "characterization"
  | "failure_diagnosis"
  | "baseline_observation";

export interface TrainingIntentHypothesisV1 {
  intent_id: string;
  intent_kind: TrainingIntentKindV1;
  objective: string;
  reaction_entity_id?: string;
  result_entity_id?: string;
  logic_source: TrainingLogicSourceV1;
  confidence: TrainingInferenceConfidenceV1;
  evidence_entity_ids: string[];
  supporting_factors: string[];
  review_required: boolean;
}

export interface TrainingVariableLogicV1 {
  variable_id: string;
  reaction_entity_id: string;
  field: string;
  variable_role: "changed" | "controlled";
  baseline_value?: string | number | boolean | null;
  candidate_value?: string | number | boolean | null;
  value?: string | number | boolean | null;
  logic_source: TrainingLogicSourceV1;
  confidence: TrainingInferenceConfidenceV1;
  evidence_entity_ids: string[];
  review_required: boolean;
}

export type TrainingCausalLinkTypeV1 =
  | "changed_variable_may_affect_outcome"
  | "controlled_variable_preserves_comparison"
  | "procedure_enables_reaction"
  | "evidence_supports_outcome_claim"
  | "failure_signal_triggers_review";

export interface TrainingCausalLinkV1 {
  causal_link_id: string;
  link_type: TrainingCausalLinkTypeV1;
  cause: string;
  effect: string;
  source_entity_ids: string[];
  target_entity_ids: string[];
  logic_source: TrainingLogicSourceV1;
  confidence: TrainingInferenceConfidenceV1;
  evidence_entity_ids: string[];
  review_required: boolean;
  warnings: string[];
}

export interface TrainingExpertRoutingV1 {
  route_id: string;
  reaction_entity_id: string;
  expert_labels: string[];
  routing_basis: string[];
  confidence: TrainingInferenceConfidenceV1;
  warnings: string[];
}

export interface TrainingEvidenceLinkV1 {
  evidence_entity_id: string;
  target_entity_id: string;
  relation_type: ExportedRelationV1["relation_type"];
  evidence_type: "analysis" | "sample" | "artifact";
}

export type TrainingKnowledgeNodeType =
  | "document"
  | "molecule"
  | "reaction"
  | "result"
  | "analysis"
  | "sample"
  | "artifact"
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
  source_span?: SourceSpan;
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
    | "artifact_without_target"
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
  | "record_to_chemd"
  | "chemd_repair"
  | "normalization_explanation"
  | "experiment_summary"
  | "entity_extraction"
  | "relation_extraction"
  | "reference_resolution"
  | "evidence_tracing"
  | "procedure_reasoning"
  | "observation_events"
  | "yield_prediction"
  | "condition_recommendation"
  | "experiment_proposal"
  | "failure_analysis"
  | "experiment_comparison"
  | "experiment_intent"
  | "reaction_classification"
  | "expert_routing"
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
  reaction_taxonomy: TrainingReactionTaxonomyV1[];
  expert_routing: TrainingExpertRoutingV1[];
  intent_hypotheses: TrainingIntentHypothesisV1[];
  variable_logic: TrainingVariableLogicV1[];
  causal_links: TrainingCausalLinkV1[];
  optimization_trajectories: TrainingOptimizationTrajectoryV1[];
  failure_signals: TrainingFailureSignalV1[];
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

export type ExperimentDecisionTaskTypeV1 =
  | "record_to_chemd"
  | "chemd_repair"
  | "normalization_explanation"
  | "procedure_reasoning"
  | "observation_events"
  | "evidence_tracing"
  | "qa_with_context"
  | "reaction_classification"
  | "expert_routing"
  | "yield_prediction"
  | "condition_recommendation"
  | "experiment_proposal"
  | "failure_analysis"
  | "experiment_comparison"
  | "experiment_intent";

export type TrainingTaskLeakageRiskV1 = "low" | "medium" | "high";

export interface TrainingTaskMessageV1 {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TrainingTaskExampleV1 {
  example_id: string;
  task_type: ExperimentDecisionTaskTypeV1;
  source_document_id: string;
  source_entity_ids: string[];
  split_hint: TrainingLoraGenerationHintsV1["split_hint"];
  messages: TrainingTaskMessageV1[];
  quality: {
    supervision: "derived_from_training_understanding";
    usable_for_sft: boolean;
    usable_for_eval: boolean;
    derived_label_confidence?: TrainingInferenceConfidenceV1;
    warnings: string[];
  };
  evaluation: {
    holdout_eligible: boolean;
    leakage_risk: TrainingTaskLeakageRiskV1;
    target_fields: string[];
  };
}

export interface ChemdTrainingTaskDatasetV1 {
  schema_version: "chemd-training-task-dataset/v0.1";
  document: ExportedDocumentInfo & { summary?: string };
  examples: TrainingTaskExampleV1[];
  quality: {
    example_count: number;
    task_types: ExperimentDecisionTaskTypeV1[];
    sft_eligible_count: number;
    eval_eligible_count: number;
    holdout_eligible_count: number;
    warnings: string[];
  };
}

export type TrainingAnnotationTargetTypeV1 =
  | "reaction_taxonomy"
  | "expert_routing"
  | "optimization_trajectory"
  | "failure_signal"
  | "intent_hypothesis"
  | "variable_logic"
  | "causal_link"
  | "task_example";

export interface TrainingAnnotationCorrectionV1 {
  correction_id: string;
  source_document_id: string;
  target_type: TrainingAnnotationTargetTypeV1;
  target_id: string;
  original_value?: unknown;
  corrected_value: unknown;
  reason?: string;
  corrected_by?: string;
  corrected_at?: string;
  supervision_after_correction: "human_verified" | "human_corrected" | "rejected" | "needs_review";
}

export interface ChemdTrainingAnnotationPatchV1 {
  schema_version: "chemd-training-annotation-patch/v0.1";
  document: ExportedDocumentInfo;
  corrections: TrainingAnnotationCorrectionV1[];
  quality: {
    correction_count: number;
    requires_regeneration: boolean;
  };
}

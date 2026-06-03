import type { NormalizedAnalysis, NormalizedTlcAnalysis, SourceSpan } from "@chemd/core";
import type { ChemdLnf } from "@chemd/lnf";
import type { CanonicalStepNode, ObservationEventNode } from "@chemd/step-ontology";

export interface ChemdTrainingExportV3 {
  schema_version: "chemd-training-export/v0.3";
  export_id: string;
  exported_at: string;
  generator: ExportGeneratorInfo;
  document: ExportedDocumentInfo;
  governance: DataGovernanceInfo;
  source_layer: ProgramSourceLayerV1;
  semantic_layer: ProgramSemanticLayerV1;
  learning_layer: ProgramLearningLayerV1;
  quality_layer: ProgramQualityLayerV1;
}

export type ChemdTrainingExportV2 = ChemdTrainingExportV3;

export interface DataGovernanceInfo {
  confidentiality?: "public" | "internal" | "restricted";
  license?: string;
  pii_status?: "none" | "redacted" | "present";
  review_status?: "machine_parsed" | "human_reviewed" | "expert_verified";
  allowed_uses?: Array<"rag" | "sft" | "eval" | "regression" | "audit">;
  sanitization_policy?: "default" | "strict" | "none";
  source?: "frontmatter" | "workspace_policy" | "export_override";
}

export interface ExportGeneratorInfo {
  system: "chemd";
  exporter_module: string;
  exporter_version: string;
  pipeline: string[];
}

export interface ExportedDocumentInfo {
  document_id: string;
  title: string;
  date: string;
  tags?: string[];
  primary_molecule_id?: string;
  primary_reaction_id?: string;
  primary_result_id?: string;
  primary_analysis_id?: string;
  primary_sample_id?: string;
  source_hash?: string;
  source_uri?: string;
  language?: string;
}

export interface ProgramSourceLayerV1 {
  raw_source?: string;
  resolved_source?: string;
  program: SourceProgramSnapshot;
  module: SourceModuleSnapshot;
  meta: SourceMetaSnapshot;
  declarations: SourceDeclarationSnapshot[];
  doc_comments: SourceDocCommentSnapshot[];
  diagnostics: ExportedDiagnostic[];
  audit_only_fields?: string[];
}

export interface SourceProgramSnapshot {
  schema_version: string;
  source_language: string;
  imports: Array<{
    module_name: string;
    from: string;
    alias?: string;
    docs: string[];
  }>;
  source_span?: SourceSpan;
}

export interface SourceModuleSnapshot {
  name: string;
  docs: string[];
  source_span?: SourceSpan;
}

export interface SourceMetaSnapshot {
  id: string;
  title: string;
  date: string;
  fields: Record<string, unknown>;
  primary?: Record<string, unknown>;
  docs: string[];
  source_span?: SourceSpan;
}

export interface SourceDeclarationSnapshot {
  declaration_index: number;
  declaration_kind: string;
  declaration_id: string;
  qualified_id?: string;
  docs: string[];
  raw_payload: Record<string, unknown>;
  source_span?: SourceSpan;
}

export interface SourceDocCommentSnapshot {
  doc_id: string;
  attachment_kind: "file" | "module" | "declaration" | "field" | "procedure_step" | "agent_statement";
  attached_to?: string;
  raw_markdown: string;
  export_policy: "render_rag" | "render_only" | "audit_only";
  source_span?: SourceSpan;
}

export interface ExportedDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  node_index?: number;
  node_id?: string;
  source_layer?: string;
  source_node_type?: string;
  source_node_id?: string;
  source_field?: string;
  source_span?: SourceSpan;
  facts?: Record<string, unknown>;
  position?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
}

export interface ProgramSemanticLayerV1 {
  molecules: ExportedMoleculeV1[];
  materials: ExportedMaterialV1[];
  batches: ExportedBatchV1[];
  reactions: ExportedReactionV1[];
  results: ExportedResultV1[];
  analyses: ExportedAnalysisV1[];
  samples: ExportedSampleV1[];
  artifacts: ExportedArtifactV1[];
  condition_screens: ExportedConditionScreenV1[];
  condition_variations: ExportedConditionVaryV1[];
  condition_variation_attempts: ExportedConditionVariationAttemptV1[];
  procedures: ExportedProcedureV1[];
  traces: ExportedTraceV1[];
  agent_runs: ExportedAgentRunV1[];
  documentation_blocks: ExportedDocumentationBlockV1[];
  links: ExportedRelationV1[];
  lnf?: ChemdLnf;
}

export type SemanticLayerV1 = ProgramSemanticLayerV1;

export interface ExportedEntityBase {
  entity_id: string;
  original_id?: string;
  node_index: number;
  source_node_type: string;
  source_block_type?: string;
  syntax_origin?: string;
  declared_kind?: string;
  is_primary?: boolean;
  provenance?: {
    from_template?: boolean;
    template_name?: string;
    expanded_from_use?: string;
  };
  field_source_spans?: Record<string, SourceSpan>;
}

export interface NumericWithUnit {
  raw: string;
  value?: number;
  min_value?: number;
  max_value?: number;
  uncertainty?: number;
  unit: string;
  original_unit?: string;
  comparator?: string;
  value_kind?: string;
  normalized_text?: string;
}

export interface NormalizedTokenValue {
  raw: string;
  normalized: string;
}

export interface NormalizedMultiTokenValue {
  raw: string;
  normalized: string[];
}

export interface ExportedMoleculeV1 extends ExportedEntityBase {
  source_node_type: "molecule";
  name?: string;
  role?: string;
  caption?: string;
  smiles?: string;
  cas?: string;
  inchi?: string;
  inchikey?: string;
  canonical_smiles?: string;
  formula?: string;
  mw?: string;
  amount_raw?: string;
  amount_value?: NumericWithUnit | null;
  equivalents_raw?: string;
  equivalents_value?: number | null;
  chemistry_feature_ref_ids?: string[];
  text_for_embedding?: string;
}

export interface ExportedMaterialV1 extends ExportedEntityBase {
  source_node_type: "material";
  molecule_ref_raw?: string;
  supplier?: string;
  lot?: string;
  purity_raw?: string;
  density?: string;
  storage?: string;
  notes?: string;
  purity_percent?: number | null;
  chemistry_feature_ref_ids?: string[];
  text_for_embedding?: string;
}

export interface ExportedBatchV1 extends ExportedEntityBase {
  source_node_type: "batch";
  source_ref_raw?: string;
  molecule_ref_raw?: string;
  state?: string;
  mass_raw?: string;
  purity_raw?: string;
  artifact_refs_raw?: string[];
  mass?: NumericWithUnit | null;
  purity_percent?: number | null;
  notes?: string;
  chemistry_feature_ref_ids?: string[];
  text_for_embedding?: string;
}

export interface ReactionParticipantV1 {
  role: "reactant" | "product";
  participant_id?: string;
  raw: string;
  reference_status: "resolved" | "unresolved" | "literal";
  target_kind?: string;
  target_entity_id?: string;
  target_original_id?: string;
  name?: string;
  smiles?: string;
  canonical_smiles?: string;
  amount?: NumericWithUnit | null;
  mass?: NumericWithUnit | null;
  volume?: NumericWithUnit | null;
  equivalents?: number | null;
  limiting?: boolean;
}

export interface NormalizedReactionConditionsV1 {
  solvent?: NormalizedTokenValue | null;
  catalyst?: NormalizedTokenValue | null;
  reagents?: NormalizedMultiTokenValue | null;
  atmosphere?: NormalizedTokenValue | null;
  temperature?: NumericWithUnit | null;
  time?: NumericWithUnit | null;
  pressure?: NumericWithUnit | null;
}

export interface NormalizedOutcomeHintsV1 {
  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
}

export interface ExportedReactionV1 extends ExportedEntityBase {
  source_node_type: "reaction";
  route_raw?: string;
  rxn_smiles?: string;
  prev_refs_raw?: string[];
  resolved_prev_refs_raw?: string[];
  next_refs_raw?: string[];
  name?: string;
  caption?: string;
  reactants: ReactionParticipantV1[];
  products: ReactionParticipantV1[];
  conditions_raw?: string[];
  reagents_raw?: string;
  catalyst_raw?: string;
  solvent_raw?: string;
  temperature_raw?: string;
  time_raw?: string;
  pressure_raw?: string;
  atmosphere_raw?: string;
  yield_raw?: string;
  conversion_raw?: string;
  selectivity_raw?: string;
  normalized_conditions: NormalizedReactionConditionsV1;
  normalized_outcome_hints: NormalizedOutcomeHintsV1;
  chemistry_feature_ref_ids?: string[];
  text_for_embedding?: string;
}

export interface ExportedResultV1 extends ExportedEntityBase {
  source_node_type: "result";
  ref_raw?: string;
  reaction_ref_raw?: string;
  product_ref_raw?: string;
  status_raw?: string;
  status_label?: "success" | "partial" | "failed" | "unknown";
  yield_raw?: string;
  conversion_raw?: string;
  selectivity_raw?: string;
  isolated_mass_raw?: string;
  product_state?: string;
  purity_raw?: string;
  notes?: string;
  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
  purity_percent?: number | null;
  isolated_mass?: NumericWithUnit | null;
  text_for_embedding?: string;
}

export interface ParsedMeasurementV1 {
  measurement_type: string;
  raw: string;
  value?: number | null;
  unit?: string | null;
  confidence?: number | null;
}

export interface ExportedAnalysisV1 extends ExportedEntityBase {
  source_node_type: "analysis";
  analysis_type?: string;
  ref_raw?: string;
  time_raw?: string;
  eluent_raw?: string;
  plate_raw?: string;
  visualization_raw?: string;
  result_raw?: string;
  instrument?: string;
  solvent?: string;
  frequency?: string;
  method?: string;
  data_raw?: string;
  notes?: string;
  artifact_refs_raw?: string[];
  normalized_analysis?: NormalizedAnalysis | null;
  normalized_tlc?: NormalizedTlcAnalysis | null;
  parsed_measurements?: ParsedMeasurementV1[];
  text_for_embedding?: string;
}

export interface ExportedSampleV1 extends ExportedEntityBase {
  source_node_type: "sample";
  name?: string;
  sample_code?: string;
  batch?: string;
  purity_raw?: string;
  supplier?: string;
  notes?: string;
  ref_raw?: string;
  derived_from_raw?: string;
  aliquot_of_raw?: string;
  batch_of_raw?: string;
  artifact_refs_raw?: string[];
  purity_percent?: number | null;
  chemistry_feature_ref_ids?: string[];
  text_for_embedding?: string;
}

export interface ExportedArtifactV1 extends ExportedEntityBase {
  source_node_type: "artifact";
  artifact_kind?: string;
  ref_raw?: string;
  path?: string;
  checksum?: string;
  instrument?: string;
  notes?: string;
  chemistry_feature_ref_ids?: string[];
  text_for_embedding?: string;
}

export interface ExportedConditionVariationDeltaV1 {
  field: string;
  raw: string;
  baseline_raw?: string;
  candidate_raw?: string;
}

export interface ExportedConditionVariationVariableV1 {
  field: string;
  raw: string;
  baseline_raw?: string;
}

export type ExportedConditionVariationAttemptModeV1 = "partial" | "override";

export interface ExportedConditionVariationAttemptV1 extends ExportedEntityBase {
  source_node_type: "condition_variation_attempt";
  parent_condition_variation_id: string;
  attempt_id: string;
  mode?: ExportedConditionVariationAttemptModeV1;
  reaction_ref_raw?: string;
  result_ref_raw?: string;
  factors?: Record<string, string>;
  outcomes?: Record<string, string>;
  condition: ExportedConditionVariationDeltaV1[];
  changes: ExportedConditionVariationDeltaV1[];
  note?: string;
  text_for_embedding?: string;
}

export interface ExportedConditionVaryV1 extends ExportedEntityBase {
  source_node_type: "condition_varies";
  reaction_ref_raw?: string;
  standard_ref_raw?: string;
  factors?: ExportedConditionVariationVariableV1[];
  outcomes?: ExportedConditionVariationVariableV1[];
  condition?: ExportedConditionVariationVariableV1[];
  vary_fields?: string[];
  changes: ExportedConditionVariationDeltaV1[];
  attempt_entity_ids?: string[];
  notes?: string;
  text_for_embedding?: string;
}

export interface ExportedReferenceTokenV1 {
  raw: string;
  kind: string;
  source: string;
  field?: string;
  resolution_status?: "resolved" | "unresolved";
  resolution_value?: unknown;
}

export interface ExportedInlineChemTokenV1 {
  raw: string;
  value: string;
}

export interface ExportedInlineCodeTokenV1 {
  raw: string;
  value: string;
}

export interface ExportedMarkdownLinkV1 {
  raw: string;
  label: string;
  href: string;
  safe: boolean;
}

export interface ExportedDocumentationBlockV1 {
  doc_id: string;
  attachment_kind: "file" | "module" | "declaration" | "field" | "procedure_step" | "agent_statement";
  attached_to?: string;
  raw_markdown: string;
  references: ExportedReferenceTokenV1[];
  text_for_embedding?: string;
  fact_status: "narrative_only";
}

export interface ExportedConditionScreenV1 extends ExportedEntityBase {
  source_node_type: "condition_screen";
  reaction_ref_raw?: string;
  standard_ref_raw?: string;
  factors?: string[];
  outcomes?: string[];
  notes?: string;
  text_for_embedding?: string;
}

export interface ExportedProcedureStepV1 {
  step_id: string;
  family: string;
  args: Record<string, unknown>;
  input_refs_raw?: string[];
  output_refs_raw?: string[];
  depends_on?: string[];
  evidence_refs_raw?: string[];
  confidence?: number;
}

export interface ExportedProcedureV1 extends ExportedEntityBase {
  source_node_type: "procedure";
  target_ref_raw?: string;
  evidence_refs_raw?: string[];
  steps: ExportedProcedureStepV1[];
  text_for_embedding?: string;
}

export interface ExportedTraceV1 extends ExportedEntityBase {
  source_node_type: "trace";
  target_ref_raw?: string;
  mode?: string;
  event_count?: number;
  text_for_embedding?: string;
}

export interface ExportedAgentRunV1 extends ExportedEntityBase {
  source_node_type: "agent_run";
  goal: string;
  status: string;
  target_files?: string[];
  evidence_refs_raw?: string[];
  tool_calls: Array<{ tool_call_id: string; name: string; status: string }>;
  patches: Array<{ patch_id: string; status: string; title?: string; edit_count: number }>;
  decisions: Array<{ decision_id: string; decision: string; patch_id?: string; rationale?: string }>;
  audit_timeline: Array<{
    event_id: string;
    event: string;
    at?: string;
    actor?: string;
    summary?: string;
    related_tool_call_id?: string;
    related_patch_id?: string;
    evidence_refs_raw?: string[];
  }>;
  text_for_embedding?: string;
}

export interface ExportedRelationV1 {
  relation_id: string;
  relation_type:
    | "document_primary"
    | "reaction_uses_molecule"
    | "reaction_uses_material"
    | "reaction_uses_batch"
    | "reaction_produces_molecule"
    | "reaction_produces_material"
    | "reaction_produces_batch"
    | "material_is_molecule"
    | "batch_derived_from_reaction"
    | "batch_related_to_result"
    | "batch_derived_from_sample"
    | "batch_derived_from_batch"
    | "batch_has_molecule"
    | "result_describes_reaction"
    | "analysis_targets_reaction"
    | "analysis_targets_sample"
    | "analysis_targets_result"
    | "sample_derived_from_reaction"
    | "sample_from_batch"
    | "sample_from_material"
    | "sample_related_to_molecule"
    | "sample_related_to_result"
    | "sample_derived_from_sample"
    | "sample_aliquot_of_sample"
    | "sample_batch_of_sample"
    | "sample_has_artifact"
    | "artifact_supports_reaction"
    | "artifact_supports_result"
    | "artifact_supports_analysis"
    | "artifact_supports_sample"
    | "reaction_depends_on_reaction"
    | "reaction_precedes_reaction"
    | "condition_variation_targets_reaction"
    | "condition_variation_compares_standard"
    | "condition_variation_has_attempt"
    | "condition_variation_attempt_targets_reaction"
    | "condition_variation_attempt_compares_standard"
    | "condition_variation_attempt_has_result"
    | "condition_screen_targets_reaction"
    | "condition_screen_compares_standard"
    | "analysis_targets_condition_screen"
    | "procedure_targets_reaction"
    | "trace_targets_declaration"
    | "agent_run_references_declaration"
    | "analysis_targets_condition_variation"
    | "analysis_targets_condition_variation_attempt"
    | "markdown_mentions_entity";
  from_entity_id: string;
  to_entity_id: string;
  role?: string;
  confidence?: number | null;
}

export interface RetrievalMetadataV1 {
  date: string;
  tags?: string[];
  molecule_ids?: string[];
  material_ids?: string[];
  batch_ids?: string[];
  reaction_ids?: string[];
  result_ids?: string[];
  analysis_ids?: string[];
  sample_ids?: string[];
  artifact_ids?: string[];
  condition_screen_ids?: string[];
  procedure_ids?: string[];
  trace_ids?: string[];
  agent_run_ids?: string[];
  analysis_types?: string[];
  status_label?: "success" | "partial" | "failed" | "unknown";
  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
  purity_percent?: number | null;
  solvent?: string | null;
  catalyst?: string | null;
  atmosphere?: string | null;
}

export interface RetrievalChunkV1 {
  chunk_id: string;
  experiment_id: string;
  chunk_type:
    | "documentation"
    | "reaction_summary"
    | "result_notes"
    | "analysis_notes"
    | "sample_notes"
    | "artifact_notes"
    | "condition_screen"
    | "procedure"
    | "agent_audit"
    | "runtime_trace"
    | "document_summary";
  chunk_kind: "semantic_fact" | "narrative_doc" | "agent_audit" | "runtime_trace";
  truth_source: "declaration" | "doc_comment" | "agent_run" | "trace";
  source_entity_ids: string[];
  text: string;
  raw_text?: string;
  metadata: RetrievalMetadataV1;
}

export interface SplitHintV1 {
  date: string;
  chronological_group?: string;
  project_id?: string;
}

export interface PredictionFeaturesV1 {
  categorical: Record<string, string | null>;
  numeric: Record<string, number | null>;
  text_refs: string[];
  entity_refs: string[];
  chemistry_feature_ref_ids?: string[];
}

export type PredictionTargetFieldV1 =
  | "status_class"
  | "yield_percent"
  | "conversion_percent"
  | "selectivity_percent"
  | "purity_percent";

export type PredictionTargetSourceV1 = "result" | "reaction_hint" | "missing";

export interface PredictionTargetsV1 {
  status_class?: "success" | "partial" | "failed" | "unknown";
  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
  purity_percent?: number | null;
  target_sources?: Partial<Record<PredictionTargetFieldV1, PredictionTargetSourceV1>>;
}

export interface PredictionUsabilityV1 {
  usable_for_classification: boolean;
  usable_for_yield_regression: boolean;
  usable_for_conversion_regression: boolean;
  usable_for_selectivity_regression: boolean;
  missing_required_fields: string[];
  warnings: string[];
}

export interface PredictionInstanceV1 {
  instance_id: string;
  experiment_id: string;
  task_scope: "reaction";
  reaction_entity_id: string;
  linked_result_entity_id?: string;
  linked_analysis_entity_ids?: string[];
  linked_sample_entity_ids?: string[];
  linked_molecule_entity_ids?: string[];
  split_hint: SplitHintV1;
  features: PredictionFeaturesV1;
  targets: PredictionTargetsV1;
  usability: PredictionUsabilityV1;
}

export interface ChemistryFeatureRefV1 {
  feature_ref_id: string;
  scope: "molecule" | "reaction";
  target_entity_id: string;
  feature_set:
    | "rdkit-morgan-2048-v1"
    | "rdkit-descriptors-v1"
    | "reaction-fingerprint-v1"
    | "custom-json-map-v1";
  encoding: "dense_f32" | "sparse_indices" | "json_map" | "external_uri";
  values?: number[];
  sparse_indices?: number[];
  json_map?: Record<string, number | string | boolean | null>;
  external_uri?: string;
}

export interface ProcedureToStepsPairV03 {
  pair_id: string;
  procedure_id?: string;
  source_type?: "explicit_steps" | "lowered_prose";
  source_text: string;
  steps: CanonicalStepNode[];
  low_confidence_step_count?: number;
  diagnostics: ExportedDiagnostic[];
}

export interface ObservationToEventsPairV03 {
  pair_id: string;
  observation_id?: string;
  ref_raw?: string;
  target_entity_id?: string;
  target_entity_type?: string;
  source_text: string;
  events: ObservationEventNode[];
  diagnostics: ExportedDiagnostic[];
}

export interface ProgramLearningLayerV1 {
  retrieval_chunks: RetrievalChunkV1[];
  prediction_instances: PredictionInstanceV1[];
  chemistry_feature_refs?: ChemistryFeatureRefV1[];
  procedure_to_steps?: ProcedureToStepsPairV03[];
  observation_to_events?: ObservationToEventsPairV03[];
}

export type LearningLayerV1 = ProgramLearningLayerV1;

export interface ParseQualityV1 {
  diagnostic_counts: {
    info: number;
    warning: number;
    error: number;
  };
  has_errors: boolean;
}

export interface NormalizationQualityV1 {
  normalized_fields: string[];
  failed_normalizations: Array<{
    field: string;
    raw_value: string;
    reason: string;
  }>;
}

export interface TrainingQualityV1 {
  rag_eligible: boolean;
  prediction_eligible: boolean;
  sft_eligible: boolean;
  eval_eligible: boolean;
  regression_eligible: boolean;
  review_required: boolean;
  confidence_score: number;
  review_reasons?: string[];
  exclusion_reasons?: string[];
}

export interface GovernanceQualityV1 {
  audit_only_fields: string[];
  blocking: boolean;
  diagnostics: ExportedDiagnostic[];
  sanitized_projection: boolean;
}

export interface ProgramQualityLayerV1 {
  governance_quality: GovernanceQualityV1;
  parse_quality: ParseQualityV1;
  normalization_quality: NormalizationQualityV1;
  training_quality: TrainingQualityV1;
}

export type QualityLayerV1 = ProgramQualityLayerV1;

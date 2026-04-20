import type { NormalizedTlcAnalysis } from "@chemd/core";
import type { ChemdLnf } from "@chemd/lnf";
import type { CanonicalStepNode, ObservationEventNode } from "@chemd/step-ontology";

export interface ChemdTrainingExportV2 {
  schema_version: "chemd-training-export/v0.2";
  export_id: string;
  exported_at: string;
  generator: ExportGeneratorInfo;
  document: ExportedDocumentInfo;
  source_layer: SourceLayerV1;
  semantic_layer: SemanticLayerV1;
  learning_layer: LearningLayerV1;
  quality_layer: QualityLayerV1;
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

export interface SourceLayerV1 {
  raw_source?: string;
  resolved_source?: string;
  raw_meta: Record<string, unknown>;
  raw_children: SourceNodeSnapshot[];
  diagnostics: ExportedDiagnostic[];
}

export interface SourceNodeSnapshot {
  node_index: number;
  node_type:
    | "markdown"
    | "molecule"
    | "reaction"
    | "result"
    | "analysis"
    | "procedure"
    | "observation"
    | "sample"
    | "col"
    | "template"
    | "use";
  original_id?: string;
  source_block_type?: string;
  syntax_origin?: string;
  declared_kind?: string;
  raw_payload: Record<string, unknown>;
}

export interface ExportedDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  node_index?: number;
  node_id?: string;
  position?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
}

export interface SemanticLayerV1 {
  molecules: ExportedMoleculeV1[];
  reactions: ExportedReactionV1[];
  results: ExportedResultV1[];
  analyses: ExportedAnalysisV1[];
  samples: ExportedSampleV1[];
  markdown_blocks: ExportedMarkdownBlockV1[];
  links: ExportedRelationV1[];
  lnf?: ChemdLnf;
}

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
}

export interface NumericWithUnit {
  raw: string;
  value: number;
  unit: string;
  original_unit?: string;
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
  canonical_smiles?: string;
  formula?: string;
  amount_raw?: string;
  amount_value?: NumericWithUnit | null;
  equivalents_raw?: string;
  equivalents_value?: number | null;
  text_for_embedding?: string;
}

export interface ReactionParticipantV1 {
  role: "reactant" | "product";
  raw: string;
  reference_status: "resolved" | "unresolved" | "literal";
  target_entity_id?: string;
  target_original_id?: string;
  name?: string;
  smiles?: string;
  canonical_smiles?: string;
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
  purity_percent?: number | null;
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

export interface ExportedMarkdownBlockV1 extends ExportedEntityBase {
  source_node_type: "markdown";
  raw_text: string;
  cleaned_text: string;
  references: ExportedReferenceTokenV1[];
  inline_chem: ExportedInlineChemTokenV1[];
  inline_code: ExportedInlineCodeTokenV1[];
  links: ExportedMarkdownLinkV1[];
  text_for_embedding?: string;
}

export interface ExportedRelationV1 {
  relation_id: string;
  relation_type:
    | "document_primary"
    | "reaction_uses_molecule"
    | "reaction_produces_molecule"
    | "result_describes_reaction"
    | "analysis_targets_reaction"
    | "analysis_targets_sample"
    | "analysis_targets_result"
    | "sample_derived_from_reaction"
    | "sample_related_to_molecule"
    | "sample_related_to_result"
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
  reaction_ids?: string[];
  result_ids?: string[];
  analysis_ids?: string[];
  sample_ids?: string[];
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
    | "markdown"
    | "reaction_summary"
    | "result_notes"
    | "analysis_notes"
    | "sample_notes"
    | "document_summary";
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
  source_text: string;
  events: ObservationEventNode[];
  diagnostics: ExportedDiagnostic[];
}

export interface LearningLayerV1 {
  retrieval_chunks: RetrievalChunkV1[];
  prediction_instances: PredictionInstanceV1[];
  chemistry_feature_refs?: ChemistryFeatureRefV1[];
  procedure_to_steps?: ProcedureToStepsPairV03[];
  observation_to_events?: ObservationToEventsPairV03[];
}

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
  confidence_score: number;
  exclusion_reasons?: string[];
}

export interface QualityLayerV1 {
  parse_quality: ParseQualityV1;
  normalization_quality: NormalizationQualityV1;
  training_quality: TrainingQualityV1;
}

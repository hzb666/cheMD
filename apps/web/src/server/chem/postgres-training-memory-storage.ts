import type {
  CorrectionPatternRecord,
  DatasetProjectionRecord,
  ExperimentPatternMemoryRecord,
  SemanticDiffRecord,
  TrainingExperienceEventRecord,
  TrainingMemoryRecords
} from "@chemd/storage-postgres";

import type { PostgresQueryClient } from "./postgres-storage";
import { deleteStaleTrainingMemoryRows } from "./postgres-training-memory-cleanup";

const jsonParam = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

const withTransaction = async <T>(
  client: PostgresQueryClient,
  operation: () => Promise<T>
): Promise<T> => {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const insertSemanticDiff = async (
  client: PostgresQueryClient,
  record: SemanticDiffRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_semantic_diffs (
      semantic_diff_id, before_revision_id, after_revision_id, diff, quality
    ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
    ON CONFLICT (semantic_diff_id) DO UPDATE SET
      before_revision_id = EXCLUDED.before_revision_id,
      after_revision_id = EXCLUDED.after_revision_id,
      diff = EXCLUDED.diff,
      quality = EXCLUDED.quality`,
    [
      record.semanticDiffId,
      record.beforeRevisionId,
      record.afterRevisionId,
      jsonParam(record.diff),
      jsonParam(record.quality)
    ]
  );
};

const insertTrainingEvent = async (
  client: PostgresQueryClient,
  record: TrainingExperienceEventRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_training_experience_events (
      event_id, semantic_diff_id, event_type, reaction_family,
      before_value, after_value, evidence, training_uses, quality
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb)
    ON CONFLICT (event_id) DO UPDATE SET
      semantic_diff_id = EXCLUDED.semantic_diff_id,
      event_type = EXCLUDED.event_type,
      reaction_family = EXCLUDED.reaction_family,
      before_value = EXCLUDED.before_value,
      after_value = EXCLUDED.after_value,
      evidence = EXCLUDED.evidence,
      training_uses = EXCLUDED.training_uses,
      quality = EXCLUDED.quality`,
    [
      record.eventId,
      record.semanticDiffId,
      record.eventType,
      record.reactionFamily,
      jsonParam(record.beforeValue),
      jsonParam(record.afterValue),
      jsonParam(record.evidence),
      record.trainingUses,
      jsonParam(record.quality)
    ]
  );
};

const insertCorrectionPattern = async (
  client: PostgresQueryClient,
  record: CorrectionPatternRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_correction_patterns (
      pattern_id, reaction_family, source_field, old_role, new_role,
      evidence_phrase_pattern, support_count, confidence, promoted_to_rule,
      training_uses, quality_tier
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (pattern_id) DO UPDATE SET
      reaction_family = EXCLUDED.reaction_family,
      source_field = EXCLUDED.source_field,
      old_role = EXCLUDED.old_role,
      new_role = EXCLUDED.new_role,
      evidence_phrase_pattern = EXCLUDED.evidence_phrase_pattern,
      support_count = EXCLUDED.support_count,
      confidence = EXCLUDED.confidence,
      training_uses = EXCLUDED.training_uses,
      quality_tier = EXCLUDED.quality_tier,
      updated_at = now()`,
    [
      record.patternId,
      record.reactionFamily,
      record.sourceField,
      record.oldRole,
      record.newRole,
      record.evidencePhrasePattern,
      record.supportCount,
      record.confidence,
      record.promotedToRule,
      record.trainingUses,
      record.qualityTier
    ]
  );
};

const insertExperimentPatternMemory = async (
  client: PostgresQueryClient,
  record: ExperimentPatternMemoryRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_experiment_pattern_memory (
      experiment_pattern_id, pattern_scope, reaction_family, mechanism_family,
      step_sequence_signature, canonical_roles, canonical_phase_roles,
      common_field_corrections, common_diagnostics, controlled_variables,
      high_value_variables, outcome_delta_patterns, failure_mode_patterns,
      evidence_event_ids, support_count, confidence, training_uses,
      promotion_targets, quality_tier
    ) VALUES (
      $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,
      $11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19
    )
    ON CONFLICT (experiment_pattern_id) DO UPDATE SET
      pattern_scope = EXCLUDED.pattern_scope,
      reaction_family = EXCLUDED.reaction_family,
      mechanism_family = EXCLUDED.mechanism_family,
      step_sequence_signature = EXCLUDED.step_sequence_signature,
      canonical_roles = EXCLUDED.canonical_roles,
      canonical_phase_roles = EXCLUDED.canonical_phase_roles,
      common_field_corrections = EXCLUDED.common_field_corrections,
      common_diagnostics = EXCLUDED.common_diagnostics,
      controlled_variables = EXCLUDED.controlled_variables,
      high_value_variables = EXCLUDED.high_value_variables,
      outcome_delta_patterns = EXCLUDED.outcome_delta_patterns,
      failure_mode_patterns = EXCLUDED.failure_mode_patterns,
      evidence_event_ids = EXCLUDED.evidence_event_ids,
      support_count = EXCLUDED.support_count,
      confidence = EXCLUDED.confidence,
      training_uses = EXCLUDED.training_uses,
      promotion_targets = EXCLUDED.promotion_targets,
      quality_tier = EXCLUDED.quality_tier,
      updated_at = now()`,
    [
      record.experimentPatternId,
      record.patternScope,
      record.reactionFamily,
      record.mechanismFamily,
      record.stepSequenceSignature,
      jsonParam(record.canonicalRoles),
      jsonParam(record.canonicalPhaseRoles),
      jsonParam(record.commonFieldCorrections),
      jsonParam(record.commonDiagnostics),
      jsonParam(record.controlledVariables),
      jsonParam(record.highValueVariables),
      jsonParam(record.outcomeDeltaPatterns),
      jsonParam(record.failureModePatterns),
      record.evidenceEventIds,
      record.supportCount,
      record.confidence,
      record.trainingUses,
      record.promotionTargets,
      record.qualityTier
    ]
  );
};

const insertDatasetProjection = async (
  client: PostgresQueryClient,
  record: DatasetProjectionRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_dataset_projections (
      dataset_projection_id, source_kind, source_ids, dataset_type,
      schema_version, payload, quality
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
    ON CONFLICT (dataset_projection_id) DO UPDATE SET
      source_kind = EXCLUDED.source_kind,
      source_ids = EXCLUDED.source_ids,
      dataset_type = EXCLUDED.dataset_type,
      schema_version = EXCLUDED.schema_version,
      payload = EXCLUDED.payload,
      quality = EXCLUDED.quality`,
    [
      record.datasetProjectionId,
      record.sourceKind,
      record.sourceIds,
      record.datasetType,
      record.schemaVersion,
      jsonParam(record.payload),
      jsonParam(record.quality)
    ]
  );
};

export const writeTrainingMemoryRecords = async (
  client: PostgresQueryClient,
  records: TrainingMemoryRecords
): Promise<void> => {
  await withTransaction(client, async () => {
    await deleteStaleTrainingMemoryRows(client, records);
    await insertSemanticDiff(client, records.semanticDiff);
    for (const event of records.trainingExperienceEvents) {
      await insertTrainingEvent(client, event);
    }
    for (const pattern of records.correctionPatterns) {
      await insertCorrectionPattern(client, pattern);
    }
    for (const memory of records.experimentPatternMemories) {
      await insertExperimentPatternMemory(client, memory);
    }
    for (const projection of records.datasetProjections) {
      await insertDatasetProjection(client, projection);
    }
  });
};

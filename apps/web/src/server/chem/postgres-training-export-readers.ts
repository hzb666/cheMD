import type { PostgresQueryClient } from "./postgres-storage";
import {
  DEFAULT_TRAINING_EXPORT_LIMIT,
  MAX_TRAINING_EXPORT_LIMIT,
  PostgresTrainingExportFilterError,
  type ExportPostgresTrainingInput,
  type PostgresCorrectionPatternExport,
  type PostgresExperimentPatternMemoryExport,
  type PostgresTrainingRevisionExport
} from "./postgres-training-export-model";
import {
  readFilter,
  readJsonRecord,
  readJsonRecordArray,
  readNumber,
  readOptionalNumber,
  readOptionalString,
  readRows,
  readStringArray,
  requireBoolean,
  requireDateString,
  requireString,
  requireTrainingExport
} from "./postgres-training-export-row-utils";

interface TrainingRevisionRow {
  revision_id: unknown;
  experiment_id: unknown;
  parent_revision_id: unknown;
  commit_sha: unknown;
  created_at: unknown;
  compile_run_id: unknown;
  compile_created_at: unknown;
  training_export: unknown;
}

interface CorrectionPatternRow {
  pattern_id: unknown;
  reaction_family: unknown;
  source_field: unknown;
  old_role: unknown;
  new_role: unknown;
  evidence_phrase_pattern: unknown;
  support_count: unknown;
  confidence: unknown;
  promoted_to_rule: unknown;
  training_uses: unknown;
  quality_tier: unknown;
  updated_at: unknown;
}

interface ExperimentPatternMemoryRow {
  experiment_pattern_id: unknown;
  pattern_scope: unknown;
  reaction_family: unknown;
  mechanism_family: unknown;
  step_sequence_signature: unknown;
  canonical_roles: unknown;
  canonical_phase_roles: unknown;
  common_field_corrections: unknown;
  common_diagnostics: unknown;
  controlled_variables: unknown;
  high_value_variables: unknown;
  outcome_delta_patterns: unknown;
  failure_mode_patterns: unknown;
  evidence_event_ids: unknown;
  support_count: unknown;
  confidence: unknown;
  training_uses: unknown;
  promotion_targets: unknown;
  quality_tier: unknown;
  updated_at: unknown;
}

export const normalizeTrainingExportLimit = (limit: number | undefined): number => {
  const resolvedLimit = limit ?? DEFAULT_TRAINING_EXPORT_LIMIT;
  if (
    !Number.isInteger(resolvedLimit) ||
    resolvedLimit <= 0 ||
    resolvedLimit > MAX_TRAINING_EXPORT_LIMIT
  ) {
    throw new PostgresTrainingExportFilterError(
      `limit must be a positive integer no greater than ${MAX_TRAINING_EXPORT_LIMIT}`
    );
  }
  return resolvedLimit;
};

export const readTrainingRevisions = async (
  client: PostgresQueryClient,
  input: ExportPostgresTrainingInput
): Promise<PostgresTrainingRevisionExport[]> => {
  const filter = readFilter(input);
  const result = await client.query(
    `WITH latest_revision_artifacts AS (
      SELECT DISTINCT ON (r.revision_id)
        r.revision_id,
        r.experiment_id,
        r.parent_revision_id,
        r.commit_sha,
        r.created_at,
        c.compile_run_id,
        c.created_at AS compile_created_at,
        a.training_export
      FROM chemd_experiment_revisions r
      JOIN chemd_compile_runs c ON c.revision_id = r.revision_id
      JOIN chemd_compile_artifacts a ON a.compile_run_id = c.compile_run_id
      WHERE ${filter.column} = $1
        AND c.status IN ('success', 'warning')
      ORDER BY r.revision_id, c.created_at DESC, c.compile_run_id DESC
    )
    SELECT *
    FROM latest_revision_artifacts
    ORDER BY created_at ASC, revision_id ASC
    LIMIT $2`,
    [filter.value, normalizeTrainingExportLimit(input.limit)]
  );
  return readRows<TrainingRevisionRow>(result).map(mapTrainingRevision);
};

const mapTrainingRevision = (row: TrainingRevisionRow): PostgresTrainingRevisionExport => {
  const revisionId = requireString(row.revision_id, "revision_id");
  return {
    revisionId,
    experimentId: requireString(row.experiment_id, "experiment_id"),
    parentRevisionId: readOptionalString(row.parent_revision_id),
    commitSha: readOptionalString(row.commit_sha),
    createdAt: requireDateString(row.created_at, "created_at"),
    compileRunId: requireString(row.compile_run_id, "compile_run_id"),
    compileCreatedAt: requireDateString(row.compile_created_at, "compile_created_at"),
    trainingExport: requireTrainingExport(revisionId, row.training_export)
  };
};

export const readCorrectionPatterns = async (
  client: PostgresQueryClient,
  revisionIds: string[]
): Promise<PostgresCorrectionPatternExport[]> => {
  if (revisionIds.length === 0) {
    return [];
  }
  const result = await client.query(
    `WITH selected_events AS (
      SELECT e.*
      FROM chemd_training_experience_events e
      JOIN chemd_semantic_diffs d ON d.semantic_diff_id = e.semantic_diff_id
      WHERE d.after_revision_id = ANY($1::text[])
    )
    SELECT DISTINCT p.*
    FROM chemd_correction_patterns p
    WHERE EXISTS (
      SELECT 1
      FROM selected_events e
      WHERE p.pattern_id = concat('correction::', e.event_id)
        OR (
          p.pattern_id LIKE 'correction::aggregate::%'
          AND e.event_type = 'condition_updated'
          AND e.after_value ? 'field'
          AND NULLIF(e.after_value->>'field', '') IS NOT NULL
          AND COALESCE(NULLIF(p.reaction_family, ''), 'unknown')
            = COALESCE(NULLIF(e.reaction_family, ''), 'unknown')
          AND NULLIF(p.source_field, '') = NULLIF(e.after_value->>'field', '')
          AND COALESCE(NULLIF(p.old_role, ''), 'missing')
            = COALESCE(NULLIF(e.before_value->>'value', ''), 'missing')
          AND COALESCE(NULLIF(p.new_role, ''), 'missing')
            = COALESCE(NULLIF(e.after_value->>'value', ''), 'missing')
        )
    )
    ORDER BY p.pattern_id`,
    [revisionIds]
  );
  return readRows<CorrectionPatternRow>(result).map(mapCorrectionPattern);
};

const mapCorrectionPattern = (
  row: CorrectionPatternRow
): PostgresCorrectionPatternExport => ({
  patternId: requireString(row.pattern_id, "pattern_id"),
  reactionFamily: readOptionalString(row.reaction_family),
  sourceField: readOptionalString(row.source_field),
  oldRole: readOptionalString(row.old_role),
  newRole: readOptionalString(row.new_role),
  evidencePhrasePattern: readOptionalString(row.evidence_phrase_pattern),
  supportCount: readNumber(row.support_count, "support_count"),
  confidence: readOptionalNumber(row.confidence, "confidence"),
  promotedToRule: requireBoolean(row.promoted_to_rule, "promoted_to_rule"),
  trainingUses: readStringArray(row.training_uses, "training_uses"),
  qualityTier: readOptionalString(row.quality_tier),
  updatedAt: requireDateString(row.updated_at, "updated_at")
});

export const readExperimentPatternMemories = async (
  client: PostgresQueryClient,
  revisionIds: string[]
): Promise<PostgresExperimentPatternMemoryExport[]> => {
  if (revisionIds.length === 0) {
    return [];
  }
  const result = await client.query(
    `SELECT m.*
    FROM chemd_experiment_pattern_memory m
    JOIN chemd_semantic_diffs d
      ON m.experiment_pattern_id = concat('experiment-pattern::', d.semantic_diff_id)
    WHERE d.after_revision_id = ANY($1::text[])
    ORDER BY m.experiment_pattern_id`,
    [revisionIds]
  );
  return readRows<ExperimentPatternMemoryRow>(result).map(mapExperimentPatternMemory);
};

const mapExperimentPatternMemory = (
  row: ExperimentPatternMemoryRow
): PostgresExperimentPatternMemoryExport => ({
  experimentPatternId: requireString(row.experiment_pattern_id, "experiment_pattern_id"),
  patternScope: requireString(row.pattern_scope, "pattern_scope"),
  reactionFamily: readOptionalString(row.reaction_family),
  mechanismFamily: readOptionalString(row.mechanism_family),
  stepSequenceSignature: readOptionalString(row.step_sequence_signature),
  canonicalRoles: readJsonRecord(row.canonical_roles, "canonical_roles"),
  canonicalPhaseRoles: readJsonRecord(row.canonical_phase_roles, "canonical_phase_roles"),
  commonFieldCorrections: readJsonRecordArray(row.common_field_corrections, "common_field_corrections"),
  commonDiagnostics: readJsonRecordArray(row.common_diagnostics, "common_diagnostics"),
  controlledVariables: readJsonRecordArray(row.controlled_variables, "controlled_variables"),
  highValueVariables: readJsonRecordArray(row.high_value_variables, "high_value_variables"),
  outcomeDeltaPatterns: readJsonRecordArray(row.outcome_delta_patterns, "outcome_delta_patterns"),
  failureModePatterns: readJsonRecordArray(row.failure_mode_patterns, "failure_mode_patterns"),
  evidenceEventIds: readStringArray(row.evidence_event_ids, "evidence_event_ids"),
  supportCount: readNumber(row.support_count, "support_count"),
  confidence: readOptionalNumber(row.confidence, "confidence"),
  trainingUses: readStringArray(row.training_uses, "training_uses"),
  promotionTargets: readStringArray(row.promotion_targets, "promotion_targets"),
  qualityTier: readOptionalString(row.quality_tier),
  updatedAt: requireDateString(row.updated_at, "updated_at")
});

import type { TrainingMemoryRecords } from "@chemd/storage-postgres";

import type { PostgresQueryClient } from "./postgres-storage";

const deleteStaleCorrectionPatterns = async (
  client: PostgresQueryClient,
  semanticDiffId: string,
  patternIds: string[]
): Promise<void> => {
  await client.query(
    `DELETE FROM chemd_correction_patterns p
    USING chemd_training_experience_events e
    WHERE e.semantic_diff_id = $1
      AND p.pattern_id = concat('correction::', e.event_id)
      AND NOT (p.pattern_id = ANY($2::text[]))`,
    [semanticDiffId, patternIds]
  );
};

const deleteStaleTrainingEvents = async (
  client: PostgresQueryClient,
  semanticDiffId: string,
  eventIds: string[]
): Promise<void> => {
  await client.query(
    `DELETE FROM chemd_training_experience_events
    WHERE semantic_diff_id = $1
      AND NOT (event_id = ANY($2::text[]))`,
    [semanticDiffId, eventIds]
  );
};

const deleteStalePatternMemories = async (
  client: PostgresQueryClient,
  semanticDiffId: string,
  memoryIds: string[]
): Promise<void> => {
  await client.query(
    `DELETE FROM chemd_experiment_pattern_memory
    WHERE experiment_pattern_id = concat('experiment-pattern::', $1)
      AND NOT (experiment_pattern_id = ANY($2::text[]))`,
    [semanticDiffId, memoryIds]
  );
};

const deleteStaleDatasetProjections = async (
  client: PostgresQueryClient,
  semanticDiffId: string,
  projectionIds: string[]
): Promise<void> => {
  await client.query(
    `DELETE FROM chemd_dataset_projections
    WHERE source_kind = 'training_memory_loop'
      AND $1 = ANY(source_ids)
      AND NOT (dataset_projection_id = ANY($2::text[]))`,
    [semanticDiffId, projectionIds]
  );
};

export const deleteStaleTrainingMemoryRows = async (
  client: PostgresQueryClient,
  records: TrainingMemoryRecords
): Promise<void> => {
  const semanticDiffId = records.semanticDiff.semanticDiffId;
  await deleteStaleCorrectionPatterns(
    client,
    semanticDiffId,
    records.correctionPatterns.map((pattern) => pattern.patternId)
  );
  await deleteStaleTrainingEvents(
    client,
    semanticDiffId,
    records.trainingExperienceEvents.map((event) => event.eventId)
  );
  await deleteStalePatternMemories(
    client,
    semanticDiffId,
    records.experimentPatternMemories.map((memory) => memory.experimentPatternId)
  );
  await deleteStaleDatasetProjections(
    client,
    semanticDiffId,
    records.datasetProjections.map((projection) => projection.datasetProjectionId)
  );
};

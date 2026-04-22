import {
  buildMemoryCorrectionPatterns,
  buildMemoryDatasetProjection,
  buildMemoryEvents,
  buildMemoryPattern,
  buildMemorySemanticDiff
} from "./memory-loop-records";
import { buildMemorySnapshotComparison } from "./memory-loop-snapshot";
import type {
  BuildTrainingMemoryRecordsInput
} from "./memory-loop-model";
import type { TrainingMemoryRecords } from "./types";

export type { BuildTrainingMemoryRecordsInput } from "./memory-loop-model";

export const buildTrainingMemoryRecords = (
  input: BuildTrainingMemoryRecordsInput
): TrainingMemoryRecords => {
  const comparison = buildMemorySnapshotComparison(input);
  const semanticDiff = buildMemorySemanticDiff(
    input,
    comparison.beforeSnapshot,
    comparison.afterSnapshot,
    comparison.changed,
    comparison.controlled
  );
  const events = buildMemoryEvents(
    semanticDiff,
    comparison.afterSnapshot.reactionFamily,
    comparison.changed
  );
  const patterns = buildMemoryCorrectionPatterns(events);
  const memory = buildMemoryPattern(
    semanticDiff,
    input.afterUnderstanding,
    comparison.afterSnapshot,
    events,
    patterns
  );
  const sourceIds = [semanticDiff.semanticDiffId, ...events.map((event) => event.eventId)];

  return {
    semanticDiff,
    trainingExperienceEvents: events,
    correctionPatterns: patterns,
    experimentPatternMemories: [memory],
    datasetProjections: [buildMemoryDatasetProjection(semanticDiff, input.afterUnderstanding, sourceIds)]
  };
};

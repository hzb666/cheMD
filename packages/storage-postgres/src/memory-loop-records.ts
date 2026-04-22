import {
  buildTrainingTaskDatasetFromUnderstanding,
  type ChemdTrainingUnderstandingV1,
  type TrainingFailureSignalV1,
  type TrainingReactionV1
} from "@chemd/exporter-training";

import {
  CONDITION_TRAINING_USES,
  INITIAL_TRAINING_USES,
  OUTCOME_TRAINING_USES,
  QUALITY_TRAINING_USES,
  createSemanticDiffId,
  isEmptyRecord,
  qualityTier,
  safeId,
  uniqueStrings,
  type BuildTrainingMemoryRecordsInput,
  type ReactionSnapshot,
  type VariableChange
} from "./memory-loop-model";
import {
  buildOutcomeDelta,
  buildQualityDelta
} from "./memory-loop-snapshot";
import type {
  CorrectionPatternRecord,
  DatasetProjectionRecord,
  ExperimentPatternMemoryRecord,
  JsonRecord,
  SemanticDiffRecord,
  TrainingExperienceEventRecord
} from "./types";

export const buildMemorySemanticDiff = (
  input: BuildTrainingMemoryRecordsInput,
  beforeSnapshot: ReactionSnapshot,
  afterSnapshot: ReactionSnapshot,
  changed: VariableChange[],
  controlled: string[]
): SemanticDiffRecord => {
  const outcomeDelta = buildOutcomeDelta(beforeSnapshot.outcome, afterSnapshot.outcome);
  const qualityDelta = buildQualityDelta(beforeSnapshot, afterSnapshot);
  const trainingUses = uniqueStrings([
    ...(changed.length > 0 ? CONDITION_TRAINING_USES : []),
    ...(!isEmptyRecord(outcomeDelta) ? OUTCOME_TRAINING_USES : []),
    ...(!isEmptyRecord(qualityDelta) ? QUALITY_TRAINING_USES : []),
    ...(!input.beforeUnderstanding ? INITIAL_TRAINING_USES : [])
  ]);

  return {
    semanticDiffId: createSemanticDiffId(input.beforeRevisionId, input.afterRevisionId),
    beforeRevisionId: input.beforeRevisionId,
    afterRevisionId: input.afterRevisionId,
    diff: {
      schema_version: "chemd-semantic-memory-diff/v0.1",
      diff_type: input.beforeUnderstanding ? "revision_pair" : "initial_revision",
      before_document_id: input.beforeUnderstanding?.document.document_id,
      after_document_id: input.afterUnderstanding.document.document_id,
      reaction_family: afterSnapshot.reactionFamily,
      entity_alignment: [{
        before_entity_id: beforeSnapshot.reaction?.entity_id,
        after_entity_id: afterSnapshot.reaction?.entity_id,
        original_id: afterSnapshot.reaction?.original_id,
        status: beforeSnapshot.reaction ? "same_entity_modified" : "entity_created"
      }],
      changed_variables: changed,
      controlled_variables: controlled,
      outcome_delta: outcomeDelta,
      quality_delta: qualityDelta,
      training_uses: trainingUses
    },
    quality: {
      confidence_score: afterSnapshot.confidenceScore,
      quality_tier: qualityTier(afterSnapshot.confidenceScore),
      has_before_revision: Boolean(input.beforeUnderstanding)
    }
  };
};

const createEvent = (
  eventId: string,
  eventType: string,
  semanticDiff: SemanticDiffRecord,
  reactionFamily: string,
  values: { beforeValue?: JsonRecord; afterValue?: JsonRecord; trainingUses: string[] }
): TrainingExperienceEventRecord => ({
  eventId,
  semanticDiffId: semanticDiff.semanticDiffId,
  eventType,
  reactionFamily,
  beforeValue: values.beforeValue,
  afterValue: values.afterValue,
  evidence: {
    semantic_diff_id: semanticDiff.semanticDiffId,
    before_revision_id: semanticDiff.beforeRevisionId,
    after_revision_id: semanticDiff.afterRevisionId
  },
  trainingUses: values.trainingUses,
  quality: {
    tier: semanticDiff.quality.quality_tier,
    supervision: "derived",
    human_verified: false
  }
});

export const buildMemoryEvents = (
  semanticDiff: SemanticDiffRecord,
  reactionFamily: string,
  changed: VariableChange[]
): TrainingExperienceEventRecord[] => {
  const outcomeDelta = semanticDiff.diff.outcome_delta as JsonRecord;
  const qualityDelta = semanticDiff.diff.quality_delta as JsonRecord;

  return [
    ...changed.map((change) => createEvent(
      `event::${semanticDiff.semanticDiffId}::condition::${safeId(change.field)}`,
      "condition_updated",
      semanticDiff,
      reactionFamily,
      {
        beforeValue: { field: change.field, value: change.before },
        afterValue: { field: change.field, value: change.after },
        trainingUses: CONDITION_TRAINING_USES
      }
    )),
    ...(!isEmptyRecord(outcomeDelta) ? [createEvent(
      `event::${semanticDiff.semanticDiffId}::outcome`,
      "result_updated",
      semanticDiff,
      reactionFamily,
      { beforeValue: {}, afterValue: outcomeDelta, trainingUses: OUTCOME_TRAINING_USES }
    )] : []),
    ...(!isEmptyRecord(qualityDelta) ? [createEvent(
      `event::${semanticDiff.semanticDiffId}::quality`,
      "quality_changed",
      semanticDiff,
      reactionFamily,
      { beforeValue: {}, afterValue: qualityDelta, trainingUses: QUALITY_TRAINING_USES }
    )] : [])
  ];
};

export const buildMemoryCorrectionPatterns = (
  events: TrainingExperienceEventRecord[]
): CorrectionPatternRecord[] =>
  events
    .filter((event) => event.eventType === "condition_updated")
    .map((event) => ({
      patternId: `correction::${event.eventId}`,
      reactionFamily: event.reactionFamily,
      sourceField: String(event.afterValue?.field ?? "condition"),
      oldRole: String(event.beforeValue?.value ?? "missing"),
      newRole: String(event.afterValue?.value ?? "missing"),
      evidencePhrasePattern: `${event.afterValue?.field}: ${event.beforeValue?.value} -> ${event.afterValue?.value}`,
      supportCount: 1,
      confidence: event.quality.tier === "gold" ? 0.9 : 0.7,
      promotedToRule: false,
      trainingUses: event.trainingUses,
      qualityTier: String(event.quality.tier ?? "bronze")
    }));

const buildCanonicalRoles = (reaction: TrainingReactionV1 | undefined): JsonRecord => {
  const roles: JsonRecord = {};
  reaction?.reactants.forEach((participant) => {
    roles[participant.target_original_id ?? participant.raw] = "reactant";
  });
  reaction?.products.forEach((participant) => {
    roles[participant.target_original_id ?? participant.raw] = "product";
  });
  return roles;
};

const buildStepSequenceSignature = (
  understanding: ChemdTrainingUnderstandingV1
): string | undefined => {
  const families = understanding.procedure_logic.procedure_to_steps.flatMap((pair) =>
    pair.steps.map((step) => step.family)
  );
  return families.length > 0 ? families.join(">") : undefined;
};

const buildFailurePatterns = (
  failures: TrainingFailureSignalV1[]
): JsonRecord[] =>
  failures.map((failure) => ({
    failure_id: failure.failure_id,
    failure_modes: failure.failure_modes,
    confidence: failure.confidence,
    warnings: failure.warnings
  }));

export const buildMemoryPattern = (
  semanticDiff: SemanticDiffRecord,
  afterUnderstanding: ChemdTrainingUnderstandingV1,
  afterSnapshot: ReactionSnapshot,
  events: TrainingExperienceEventRecord[],
  patterns: CorrectionPatternRecord[]
): ExperimentPatternMemoryRecord => ({
  experimentPatternId: `experiment-pattern::${semanticDiff.semanticDiffId}`,
  patternScope: "revision_pair",
  reactionFamily: afterSnapshot.reactionFamily,
  stepSequenceSignature: buildStepSequenceSignature(afterUnderstanding),
  canonicalRoles: buildCanonicalRoles(afterSnapshot.reaction),
  canonicalPhaseRoles: {},
  commonFieldCorrections: patterns.map((pattern) => ({
    source_field: pattern.sourceField,
    before: pattern.oldRole,
    after: pattern.newRole,
    support_count: pattern.supportCount
  })),
  commonDiagnostics: afterUnderstanding.knowledge_graph.missing_logic.map((item) => ({
    code: item.code,
    severity: item.severity,
    field: item.field
  })),
  controlledVariables: (semanticDiff.diff.controlled_variables as string[]).map((field) => ({ field })),
  highValueVariables: semanticDiff.diff.changed_variables as JsonRecord[],
  outcomeDeltaPatterns: isEmptyRecord(semanticDiff.diff.outcome_delta as JsonRecord)
    ? []
    : [semanticDiff.diff.outcome_delta as JsonRecord],
  failureModePatterns: buildFailurePatterns(afterUnderstanding.experiment_logic.failure_signals),
  evidenceEventIds: events.map((event) => event.eventId),
  supportCount: Math.max(events.length, 1),
  confidence: afterSnapshot.confidenceScore,
  trainingUses: uniqueStrings(events.flatMap((event) => event.trainingUses)),
  promotionTargets: ["training_dataset", "validator_rule"],
  qualityTier: String(semanticDiff.quality.quality_tier ?? "bronze")
});

export const buildMemoryDatasetProjection = (
  semanticDiff: SemanticDiffRecord,
  understanding: ChemdTrainingUnderstandingV1,
  sourceIds: string[]
): DatasetProjectionRecord => {
  const dataset = buildTrainingTaskDatasetFromUnderstanding(understanding);
  return {
    datasetProjectionId: `dataset::${semanticDiff.semanticDiffId}::training-task-dataset`,
    sourceKind: "training_memory_loop",
    sourceIds,
    datasetType: "training_task_dataset",
    schemaVersion: dataset.schema_version,
    payload: dataset,
    quality: {
      projection: "mvp",
      example_count: dataset.examples.length,
      semantic_diff_id: semanticDiff.semanticDiffId
    }
  };
};

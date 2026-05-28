import type {
  ChemdTrainingUnderstandingV1,
  TrainingOutcomeLogicV1,
  TrainingReactionV1
} from "@chemd/exporter-training";

import type { JsonRecord } from "./types";
import type {
  BuildTrainingMemoryRecordsInput,
  ComparableValue,
  ReactionSnapshot,
  VariableChange
} from "./memory-loop-model";

export interface MemorySnapshotComparison {
  beforeSnapshot: ReactionSnapshot;
  afterSnapshot: ReactionSnapshot;
  changed: VariableChange[];
  controlled: string[];
}

const stableValue = (value: unknown): string => JSON.stringify(value);

const readPrimaryReactionId = (
  understanding: ChemdTrainingUnderstandingV1
): string | undefined =>
  understanding.experiment_logic.primary_entities.find((entity) => entity.role === "reaction")?.entity_id;

const findPrimaryReaction = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingReactionV1 | undefined => {
  const primaryId = readPrimaryReactionId(understanding);
  return understanding.entities.reactions.find((reaction) => reaction.entity_id === primaryId)
    ?? understanding.entities.reactions[0];
};

const findAlignedReaction = (
  understanding: ChemdTrainingUnderstandingV1 | undefined,
  afterReaction: TrainingReactionV1 | undefined
): TrainingReactionV1 | undefined => {
  if (!understanding) {
    return undefined;
  }
  if (!afterReaction) {
    return findPrimaryReaction(understanding);
  }

  return understanding.entities.reactions.find((reaction) =>
    Boolean(afterReaction.original_id && reaction.original_id === afterReaction.original_id)
  ) ?? understanding.entities.reactions.find((reaction) => reaction.entity_id === afterReaction.entity_id)
    ?? findPrimaryReaction(understanding);
};

const findOutcome = (
  understanding: ChemdTrainingUnderstandingV1,
  reaction: TrainingReactionV1 | undefined
): TrainingOutcomeLogicV1 | undefined => {
  if (!reaction) {
    return understanding.experiment_logic.outcomes[0];
  }

  return understanding.experiment_logic.outcomes.find((outcome) =>
    outcome.reaction_entity_id === reaction.entity_id
  ) ?? (understanding.experiment_logic.outcomes.length === 1
    ? understanding.experiment_logic.outcomes[0]
    : undefined);
};

const findReactionFamily = (
  understanding: ChemdTrainingUnderstandingV1,
  reaction: TrainingReactionV1 | undefined
): string => {
  const taxonomy = understanding.experiment_logic.reaction_taxonomy.find((candidate) =>
    candidate.reaction_entity_id === reaction?.entity_id
  );
  return taxonomy?.reaction_family ?? "unknown";
};

const formatNumeric = (
  value: { value?: number; unit?: string } | null | undefined
): string | null =>
  typeof value?.value === "number" ? `${value.value}${value.unit ? ` ${value.unit}` : ""}` : null;

const participantList = (
  participants: TrainingReactionV1["reactants"]
): string | null => {
  const values = participants.map((participant) =>
    participant.target_original_id ?? participant.name ?? participant.raw
  );
  return values.length > 0 ? values.join(" + ") : null;
};

const readNormalizedValue = (
  value: { normalized?: string } | null | undefined
): string | null => value?.normalized ?? null;

const readConditionValue = (
  value: { normalized?: string } | null | undefined,
  raw: string | undefined
): string | null => readNormalizedValue(value) ?? raw ?? null;

const readNormalizedList = (
  value: { normalized?: string[] } | null | undefined
): string | null => value?.normalized ? value.normalized.join(", ") : null;

const emptyVariableMap = (): Record<string, ComparableValue> => ({
  reactants: null,
  products: null,
  solvent: null,
  catalyst: null,
  reagents: null,
  atmosphere: null,
  temperature: null,
  time: null,
  pressure: null
});

const buildVariableMap = (
  reaction: TrainingReactionV1 | undefined
): Record<string, ComparableValue> => {
  if (!reaction) {
    return emptyVariableMap();
  }

  return {
    reactants: participantList(reaction.reactants),
    products: participantList(reaction.products),
    solvent: readConditionValue(reaction.normalized_conditions.solvent, reaction.solvent_raw),
    catalyst: readConditionValue(reaction.normalized_conditions.catalyst, reaction.catalyst_raw),
    reagents: readNormalizedList(reaction.normalized_conditions.reagents),
    atmosphere: readNormalizedValue(reaction.normalized_conditions.atmosphere),
    temperature: formatNumeric(reaction.normalized_conditions.temperature),
    time: formatNumeric(reaction.normalized_conditions.time),
    pressure: formatNumeric(reaction.normalized_conditions.pressure)
  };
};

const buildSnapshot = (
  understanding: ChemdTrainingUnderstandingV1 | undefined,
  reaction: TrainingReactionV1 | undefined
): ReactionSnapshot => ({
  reaction,
  reactionFamily: understanding ? findReactionFamily(understanding, reaction) : "unknown",
  variables: buildVariableMap(reaction),
  outcome: understanding ? findOutcome(understanding, reaction) : undefined,
  confidenceScore: understanding?.quality.confidence_score ?? 0
});

const compareVariables = (
  beforeValues: Record<string, ComparableValue>,
  afterValues: Record<string, ComparableValue>
): { changed: VariableChange[]; controlled: string[] } => {
  const fields = new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)]);
  const changed: VariableChange[] = [];
  const controlled: string[] = [];

  for (const field of [...fields].sort()) {
    const before = beforeValues[field] ?? null;
    const after = afterValues[field] ?? null;
    if (stableValue(before) === stableValue(after)) {
      if (after !== null) {
        controlled.push(field);
      }
      continue;
    }
    changed.push({ field, before, after });
  }

  return { changed, controlled };
};

export const buildOutcomeDelta = (
  beforeOutcome: TrainingOutcomeLogicV1 | undefined,
  afterOutcome: TrainingOutcomeLogicV1 | undefined
): JsonRecord => {
  const fields = ["status_label", "yield_percent", "conversion_percent", "selectivity_percent", "purity_percent"];
  const delta: JsonRecord = {};

  for (const field of fields) {
    const before = beforeOutcome?.[field as keyof TrainingOutcomeLogicV1] ?? null;
    const after = afterOutcome?.[field as keyof TrainingOutcomeLogicV1] ?? null;
    if (stableValue(before) !== stableValue(after)) {
      delta[field] = {
        old: before,
        new: after,
        ...(typeof before === "number" && typeof after === "number" ? { delta: after - before } : {})
      };
    }
  }

  return delta;
};

export const buildQualityDelta = (
  beforeSnapshot: ReactionSnapshot,
  afterSnapshot: ReactionSnapshot
): JsonRecord =>
  beforeSnapshot.confidenceScore === afterSnapshot.confidenceScore
    ? {}
    : {
        confidence_score: {
          old: beforeSnapshot.confidenceScore,
          new: afterSnapshot.confidenceScore,
          delta: afterSnapshot.confidenceScore - beforeSnapshot.confidenceScore
        }
      };

export const buildMemorySnapshotComparison = (
  input: BuildTrainingMemoryRecordsInput
): MemorySnapshotComparison => {
  const afterReaction = findPrimaryReaction(input.afterUnderstanding);
  const beforeReaction = findAlignedReaction(input.beforeUnderstanding, afterReaction);
  const beforeSnapshot = buildSnapshot(input.beforeUnderstanding, beforeReaction);
  const afterSnapshot = buildSnapshot(input.afterUnderstanding, afterReaction);
  const variables = compareVariables(beforeSnapshot.variables, afterSnapshot.variables);

  return {
    beforeSnapshot,
    afterSnapshot,
    changed: variables.changed,
    controlled: variables.controlled
  };
};

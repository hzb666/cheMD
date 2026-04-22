import type {
  ChemdTrainingUnderstandingV1,
  TrainingOutcomeLogicV1,
  TrainingReactionV1
} from "@chemd/exporter-training";

export type ComparableValue = string | number | boolean | null;

export interface BuildTrainingMemoryRecordsInput {
  beforeRevisionId?: string;
  afterRevisionId: string;
  beforeUnderstanding?: ChemdTrainingUnderstandingV1;
  afterUnderstanding: ChemdTrainingUnderstandingV1;
}

export interface VariableChange {
  field: string;
  before: ComparableValue;
  after: ComparableValue;
}

export interface ReactionSnapshot {
  reaction?: TrainingReactionV1;
  reactionFamily: string;
  variables: Record<string, ComparableValue>;
  outcome?: TrainingOutcomeLogicV1;
  confidenceScore: number;
}

export const CONDITION_TRAINING_USES = [
  "experiment_comparison",
  "optimization_trajectory",
  "condition_recommendation"
];

export const OUTCOME_TRAINING_USES = [
  "yield_prediction",
  "experiment_comparison",
  "condition_recommendation"
];

export const QUALITY_TRAINING_USES = ["verifier_training", "consistency_check"];
export const INITIAL_TRAINING_USES = ["reaction_classification", "expert_routing", "qa_with_context"];

export const uniqueStrings = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean)));

export const safeId = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-|-$/g, "") || "value";

export const isEmptyRecord = (value: Record<string, unknown>): boolean =>
  Object.keys(value).length === 0;

export const qualityTier = (confidenceScore: number): string =>
  confidenceScore >= 0.9 ? "gold" : confidenceScore >= 0.7 ? "silver" : "bronze";

export const createSemanticDiffId = (
  beforeRevisionId: string | undefined,
  afterRevisionId: string
): string => `semantic-diff::${beforeRevisionId ?? "initial"}::${afterRevisionId}`;

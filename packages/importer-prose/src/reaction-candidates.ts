import type {
  MaterialMention,
  QuantityMention,
  ReactionCandidate,
  StepFrame
} from "./types";

export interface BuildReactionCandidatesInput {
  sourceText: string;
  materials: readonly MaterialMention[];
  quantities: readonly QuantityMention[];
  steps: readonly StepFrame[];
}

export const buildReactionCandidates = (
  _input: BuildReactionCandidatesInput
): readonly ReactionCandidate[] => {
  // Phase 1 contract placeholder: extraction is intentionally no-op until
  // conservative reaction aggregation is wired in a later phase.
  return [];
};

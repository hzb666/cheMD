import type {
  ImportDiagnostic,
  ReactionFactCandidate
} from "./types";

export const REACTION_RENDER_CONFIDENCE_THRESHOLD = 0.75;

export const createReactionLowConfidenceDiagnostics = (
  facts: readonly ReactionFactCandidate[]
): ImportDiagnostic[] =>
  facts
    .filter((fact) => fact.confidence < REACTION_RENDER_CONFIDENCE_THRESHOLD)
    .map((fact) => ({
      code: "W_IMPORT_REACTION_FACT_LOW_CONFIDENCE",
      severity: "warning" as const,
      message: "Reaction fact candidate is below the render confidence threshold.",
      span: fact.sourceSpan,
      facts: {
        raw: fact.raw,
        role: fact.role,
        confidence: fact.confidence
      }
    }));

export const createReactionWorkupDiagnostics = (
  facts: readonly ReactionFactCandidate[]
): ImportDiagnostic[] =>
  facts.map((fact) => ({
    code: "W_IMPORT_REACTION_WORKUP_EXCLUDED",
    severity: "warning" as const,
    message: "Workup material was kept out of reaction reagent and solvent fields.",
    span: fact.sourceSpan,
    facts: {
      raw: fact.raw,
      role: fact.role,
      confidence: fact.confidence
    }
  }));

export const splitRenderableReactionFacts = (
  facts: readonly ReactionFactCandidate[]
): { accepted: ReactionFactCandidate[]; rejected: ReactionFactCandidate[] } => ({
  accepted: facts.filter((fact) => fact.confidence >= REACTION_RENDER_CONFIDENCE_THRESHOLD),
  rejected: facts
    .filter((fact) => fact.confidence < REACTION_RENDER_CONFIDENCE_THRESHOLD)
    .map((fact) => ({
      ...fact,
      warnings: [
        ...fact.warnings,
        "Below reaction render confidence threshold."
      ]
    }))
});

export const reactionCandidateConfidence = (
  facts: readonly ReactionFactCandidate[]
): number =>
  facts.length === 0
    ? 0
    : Math.min(...facts.map((fact) => fact.confidence));

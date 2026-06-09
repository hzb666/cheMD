import type { Diagnostic } from "@chemd/core";

import {
  buildGovernanceDiagnostics,
  TRAINING_AUDIT_ONLY_FIELDS
} from "./governance";
import type { DataGovernanceInfo, LearningLayerV1, QualityLayerV1 } from "./types";

const getParseQuality = (diagnostics: Diagnostic[]): QualityLayerV1["parse_quality"] => {
  const counts = {
    info: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length,
    warning: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    error: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length
  };

  return {
    diagnostic_counts: counts,
    has_errors: counts.error > 0
  };
};

const getConfidenceScore = (warningCount: number, errorCount: number): number => {
  const score = 1 - warningCount * 0.02 - errorCount * 0.1;
  return Math.max(0, Number(score.toFixed(4)));
};

const countLowConfidenceLoweredSteps = (learningLayer: LearningLayerV1): number =>
  learningLayer.procedure_to_steps
    ?.flatMap((pair) => pair.steps)
    .filter((step) => step.source.sourceType === "lowered_step" && step.loweringConfidence < 0.85)
    .length ?? 0;

const hasAllowedUse = (governance: DataGovernanceInfo, use: "rag" | "sft" | "eval" | "regression"): boolean =>
  governance.allowed_uses?.includes(use) === true;

export const buildQualityLayer = (
  diagnostics: Diagnostic[],
  learningLayer: LearningLayerV1,
  governance: DataGovernanceInfo
): QualityLayerV1 => {
  const parseQuality = getParseQuality(diagnostics);
  const governanceDiagnostics = buildGovernanceDiagnostics(governance);
  const governanceBlocking = governanceDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  const ragEligible = learningLayer.retrieval_chunks.length > 0
    && hasAllowedUse(governance, "rag")
    && !governanceBlocking;
  const predictionEligible = learningLayer.prediction_instances.some(
    (instance) =>
      instance.usability.usable_for_classification ||
      instance.usability.usable_for_yield_regression ||
      instance.usability.usable_for_conversion_regression ||
      instance.usability.usable_for_selectivity_regression
  );

  const exclusionReasons: string[] = [];

  if (!ragEligible) {
    exclusionReasons.push("no_retrieval_chunks");
  }

  if (!hasAllowedUse(governance, "rag")) {
    exclusionReasons.push("allowed_uses_missing_rag");
  }

  if (governanceBlocking) {
    exclusionReasons.push("governance_blocking");
  }

  if (!predictionEligible) {
    exclusionReasons.push("no_usable_prediction_instance");
  }

  const lowConfidenceLoweredSteps = countLowConfidenceLoweredSteps(learningLayer);
  const reviewReasons: string[] = [];

  if (lowConfidenceLoweredSteps > 0) {
    exclusionReasons.push("low_confidence_lowered_steps");
    reviewReasons.push("low_confidence_lowered_steps");
  }

  if (parseQuality.has_errors) {
    reviewReasons.push("parse_errors");
  }

  if (parseQuality.diagnostic_counts.warning > 0) {
    reviewReasons.push("parse_warnings");
  }

  if (governanceDiagnostics.length > 0) {
    reviewReasons.push("governance_review");
  }

  return {
    governance_quality: {
      audit_only_fields: TRAINING_AUDIT_ONLY_FIELDS,
      blocking: governanceBlocking,
      diagnostics: governanceDiagnostics,
      sanitized_projection: governance.sanitization_policy !== "none"
    },
    parse_quality: parseQuality,
    normalization_quality: {
      normalized_fields: [],
      failed_normalizations: []
    },
    training_quality: {
      rag_eligible: ragEligible,
      prediction_eligible: predictionEligible,
      sft_eligible: hasAllowedUse(governance, "sft")
        && ragEligible
        && !parseQuality.has_errors
        && lowConfidenceLoweredSteps === 0,
      eval_eligible: hasAllowedUse(governance, "eval")
        && predictionEligible
        && !parseQuality.has_errors
        && lowConfidenceLoweredSteps === 0
        && !governanceBlocking,
      regression_eligible: hasAllowedUse(governance, "regression")
        && predictionEligible
        && parseQuality.diagnostic_counts.error === 0
        && !governanceBlocking,
      review_required: reviewReasons.length > 0,
      confidence_score: getConfidenceScore(
        parseQuality.diagnostic_counts.warning + lowConfidenceLoweredSteps,
        parseQuality.diagnostic_counts.error
      ),
      ...(reviewReasons.length > 0 ? { review_reasons: reviewReasons } : {}),
      ...(exclusionReasons.length > 0 ? { exclusion_reasons: exclusionReasons } : {})
    }
  };
};

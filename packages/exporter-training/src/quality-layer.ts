import type { Diagnostic } from "@chemd/core";

import type { LearningLayerV1, QualityLayerV1 } from "./types";

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

export const buildQualityLayer = (diagnostics: Diagnostic[], learningLayer: LearningLayerV1): QualityLayerV1 => {
  const parseQuality = getParseQuality(diagnostics);
  const ragEligible = learningLayer.retrieval_chunks.length > 0;
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

  if (!predictionEligible) {
    exclusionReasons.push("no_usable_prediction_instance");
  }

  return {
    parse_quality: parseQuality,
    normalization_quality: {
      normalized_fields: [],
      failed_normalizations: []
    },
    training_quality: {
      rag_eligible: ragEligible,
      prediction_eligible: predictionEligible,
      confidence_score: getConfidenceScore(parseQuality.diagnostic_counts.warning, parseQuality.diagnostic_counts.error),
      ...(exclusionReasons.length > 0 ? { exclusion_reasons: exclusionReasons } : {})
    }
  };
};

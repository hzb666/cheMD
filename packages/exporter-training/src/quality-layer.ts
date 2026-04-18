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

const countLowConfidenceLoweredSteps = (learningLayer: LearningLayerV1): number =>
  learningLayer.procedure_to_steps
    ?.flatMap((pair) => pair.steps)
    .filter((step) => step.source.sourceType === "lowered_step" && step.loweringConfidence < 0.85)
    .length ?? 0;

const countMigrationDiagnostics = (diagnostics: Diagnostic[]): number =>
  diagnostics.filter((diagnostic) =>
    ["W_LEGACY_BLOCK_KIND", "W_CHEMD_KIND_AMBIGUOUS", "E_CHEMD_KIND_CONFLICT"].includes(diagnostic.code)
    || (
      diagnostic.code === "W_UNKNOWN_BLOCK"
      && (
        diagnostic.sourceNodeType === "molecule"
        || diagnostic.sourceNodeType === "reaction"
        || typeof diagnostic.facts?.legacy_block_kind === "string"
      )
    )
  ).length;

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

  const lowConfidenceLoweredSteps = countLowConfidenceLoweredSteps(learningLayer);
  const migrationDiagnostics = countMigrationDiagnostics(diagnostics);

  if (lowConfidenceLoweredSteps > 0) {
    exclusionReasons.push("low_confidence_lowered_steps");
  }

  if (migrationDiagnostics > 0) {
    exclusionReasons.push("surface_migration_required");
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
      confidence_score: getConfidenceScore(
        parseQuality.diagnostic_counts.warning + lowConfidenceLoweredSteps,
        parseQuality.diagnostic_counts.error
      ),
      ...(exclusionReasons.length > 0 ? { exclusion_reasons: exclusionReasons } : {})
    }
  };
};

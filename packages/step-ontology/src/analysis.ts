import type { ProvenanceInfo } from "@chemd/core";

import type { AnalysisLoweringInput, AnalysisLoweringResult, CanonicalStepNode } from "./types";

const createAnalysisStepProvenance = (
  input: AnalysisLoweringInput,
  family: "sample" | "analyze"
): ProvenanceInfo => ({
  origin: "lowered",
  sourceNodeType: "analysis",
  sourceNodeId: input.analysisId,
  sourceField: "type",
  ruleId: `step_ontology.analysis.${family}`,
  confidence: 0.9
});

const createAnalysisStep = (
  input: AnalysisLoweringInput,
  family: "sample" | "analyze",
  index: number,
  params: Record<string, unknown>
): CanonicalStepNode => {
  const provenance = createAnalysisStepProvenance(input, family);

  return {
    stepId: `${input.analysisId ?? "analysis"}:s${index}`,
    family,
    params,
    source: {
      sourceNodeType: "analysis",
      sourceNodeId: input.analysisId,
      sourceType: "lowered_step",
      rawText: input.analysisType ?? "analysis",
      provenance
    },
    provenance,
    loweringConfidence: 0.9
  };
};

export const lowerAnalysisToSteps = (input: AnalysisLoweringInput): AnalysisLoweringResult => {
  const analysisType = input.analysisType?.toLowerCase() ?? "unknown";

  return {
    analysisId: input.analysisId,
    steps: [
      createAnalysisStep(input, "sample", 1, {}),
      createAnalysisStep(input, "analyze", 2, {
        type: analysisType,
        ...(input.result ? { result: input.result } : {})
      })
    ],
    diagnostics: []
  };
};

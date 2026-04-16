import type { AnalysisLoweringInput, AnalysisLoweringResult, CanonicalStepNode } from "./types";

const createAnalysisStep = (
  input: AnalysisLoweringInput,
  family: "sample" | "analyze",
  index: number,
  params: Record<string, unknown>
): CanonicalStepNode => ({
  stepId: `${input.analysisId ?? "analysis"}:s${index}`,
  family,
  params,
  source: {
    sourceNodeType: "analysis",
    sourceNodeId: input.analysisId,
    rawText: input.analysisType ?? "analysis"
  },
  loweringConfidence: 0.9
});

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

import type { CompileResult } from "@chemd/compiler";

import {
  buildSemanticDiff,
  type SemanticDiff,
  type SemanticDiffComparableObject
} from "./semantic-diff";

export const buildCompileSemanticDiff = (
  before: CompileResult,
  after: CompileResult
): SemanticDiff => buildSemanticDiff(before.program, after.program, {
  beforeObjects: collectCompileSemanticObjects(before),
  afterObjects: collectCompileSemanticObjects(after)
});

const collectCompileSemanticObjects = (result: CompileResult): SemanticDiffComparableObject[] => [
  ...collectTypedGraphObjects(result),
  ...collectRunPlanObjects(result)
];

const collectTypedGraphObjects = (result: CompileResult): SemanticDiffComparableObject[] => {
  const nodes = result.typedSemanticGraph?.nodes;
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes
    .filter((node) => isRecord(node) && typeof node.nodeId === "string" && typeof node.kind === "string")
    .map((node) => ({
      fields: comparableRecord(node as unknown as Record<string, unknown>, [
        "diagnostics",
        "kind",
        "nodeId",
        "sourceMetadata"
      ]),
      nodeId: node.nodeId,
      nodeType: `typed:${node.kind}`
    }));
};

const collectRunPlanObjects = (result: CompileResult): SemanticDiffComparableObject[] => {
  const steps = result.runPlan?.steps;
  const controls = result.runPlan?.controls;
  return [
    ...(Array.isArray(steps) ? steps.map((step) => ({
      fields: comparableRecord(step as unknown as Record<string, unknown>, ["source", "status", "stepId"]),
      nodeId: step.stepId,
      nodeType: "run_step"
    })) : []),
    ...(Array.isArray(controls) ? controls.map((control) => ({
      fields: comparableRecord(control as unknown as Record<string, unknown>, ["controlId", "source"]),
      nodeId: control.controlId,
      nodeType: "run_control"
    })) : [])
  ];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const comparableRecord = (
  value: Record<string, unknown>,
  excludedKeys: string[]
): Record<string, unknown> => Object.fromEntries(
  Object.entries(value).filter(([key, item]) =>
    !excludedKeys.includes(key) && item !== undefined
  )
);

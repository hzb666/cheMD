import {
  buildProcedureState,
  type CompileResult
} from "@chemd/compiler";

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
  ...collectStepGraphObjects(result),
  ...collectTypedGraphObjects(result),
  ...collectRunPlanObjects(result)
];

const collectStepGraphObjects = (result: CompileResult): SemanticDiffComparableObject[] =>
  readStepGraphProcedures(result).flatMap((procedure) => [
    ...(procedure.controls ?? []).map((control) => ({
      fields: comparableRecord({
        procedureId: procedure.procedureId,
        kind: control.kind,
        params: control.params,
        condition: control.condition,
        dynamic: control.dynamic,
        controlPath: control.controlPath
      }, []),
      nodeId: procedureNodeId(procedure.procedureId, control.controlId),
      nodeType: "control"
    })),
    ...collectProcedureStateObjects(procedure)
  ]);

const readStepGraphProcedures = (
  result: CompileResult
): CompileResult["stepGraph"]["procedures"] =>
  Array.isArray(result.stepGraph?.procedures) ? result.stepGraph.procedures : [];

const collectProcedureStateObjects = (
  procedure: CompileResult["stepGraph"]["procedures"][number]
): SemanticDiffComparableObject[] =>
  buildProcedureState(procedure.steps).snapshots.map((snapshot) => ({
    fields: comparableRecord({
      procedureId: procedure.procedureId,
      stepId: snapshot.sourceStepId,
      stepFamily: snapshot.sourceStepFamily,
      index: snapshot.index,
      conditions: snapshot.conditions,
      contents: snapshot.contents,
      phaseMarkers: snapshot.phaseMarkers,
      stateTags: snapshot.stateTags,
      violations: snapshot.violations,
      warnings: snapshot.warnings
    }, []),
    nodeId: procedureNodeId(procedure.procedureId, snapshot.sourceStepId),
    nodeType: "procedure_state_step"
  }));

const procedureNodeId = (procedureId: string | undefined, localId: string): string =>
  procedureId ? `${procedureId}.${localId}` : localId;

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

import type { CanonicalStepNode, StepFamily } from "./types";

export type ProcedureStateWarningCode =
  | "W_STATE_UNSUPPORTED_STEP"
  | "W_STATE_NO_STRUCTURAL_CHANGE";

export interface ProcedureStateMaterial {
  name: string;
  role: "material" | "solvent" | "quench_agent" | "wash_solvent" | "drying_agent";
  sourceStepId: string;
}

export interface ProcedureStateConditions {
  atmosphere?: string;
  duration?: string;
  temperature?: string;
}

export interface ProcedureStateWarning {
  code: ProcedureStateWarningCode;
  message: string;
  stepFamily: StepFamily;
  stepId: string;
}

export interface ProcedureStateSnapshot {
  conditions: ProcedureStateConditions;
  contents: ProcedureStateMaterial[];
  index: number;
  phaseMarkers: string[];
  sourceStepFamily: StepFamily;
  sourceStepId: string;
  warnings: ProcedureStateWarning[];
}

export interface ProcedureStateResult {
  finalState: ProcedureStateSnapshot;
  snapshots: ProcedureStateSnapshot[];
  warnings: ProcedureStateWarning[];
}

interface MutableProcedureState {
  conditions: ProcedureStateConditions;
  contents: ProcedureStateMaterial[];
  phaseMarkers: string[];
}

const readStringParam = (
  step: CanonicalStepNode,
  names: readonly string[]
): string | undefined => {
  for (const name of names) {
    const value = step.params[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const addMaterial = (
  state: MutableProcedureState,
  step: CanonicalStepNode,
  name: string | undefined,
  role: ProcedureStateMaterial["role"]
): void => {
  if (!name) return;
  state.contents.push({ name, role, sourceStepId: step.stepId });
};

const setCondition = (
  state: MutableProcedureState,
  key: keyof ProcedureStateConditions,
  value: string | undefined
): void => {
  if (!value) return;
  state.conditions = { ...state.conditions, [key]: value };
};

const addPhaseMarker = (state: MutableProcedureState, marker: string): void => {
  state.phaseMarkers = [...state.phaseMarkers, marker];
};

const createWarning = (
  step: CanonicalStepNode,
  code: ProcedureStateWarningCode,
  message: string
): ProcedureStateWarning => ({
  code,
  message,
  stepFamily: step.family,
  stepId: step.stepId
});

const applyMaterialStep = (
  state: MutableProcedureState,
  step: CanonicalStepNode
): void => {
  if (step.family === "charge") {
    addMaterial(state, step, readStringParam(step, ["materials"]), "material");
    addMaterial(state, step, readStringParam(step, ["solvent"]), "solvent");
  }
  if (step.family === "add") {
    addMaterial(state, step, readStringParam(step, ["materials", "agent"]), "material");
  }
  if (step.family === "quench") {
    addMaterial(state, step, readStringParam(step, ["agent", "materials"]), "quench_agent");
  }
  if (step.family === "wash") {
    addMaterial(state, step, readStringParam(step, ["solvent", "wash"]), "wash_solvent");
  }
  if (step.family === "dry") {
    addMaterial(state, step, readStringParam(step, ["agent", "materials"]), "drying_agent");
  }
};

const applyConditionStep = (
  state: MutableProcedureState,
  step: CanonicalStepNode
): void => {
  setCondition(state, "temperature", readStringParam(step, ["temperature", "target_temperature"]));
  setCondition(state, "atmosphere", readStringParam(step, ["atmosphere"]));
  setCondition(state, "duration", readStringParam(step, ["duration", "time"]));
};

const applyPhaseStep = (
  state: MutableProcedureState,
  step: CanonicalStepNode
): void => {
  if (step.family === "extract") addPhaseMarker(state, "extracted");
  if (step.family === "separate_layers") addPhaseMarker(state, "layers_separated");
  if (step.family === "filter") addPhaseMarker(state, "filtered");
  if (step.family === "concentrate") addPhaseMarker(state, "concentrated");
  if (step.family === "purify") addPhaseMarker(state, "purified");
  if (step.family === "sample") addPhaseMarker(state, "sampled");
  if (step.family === "analyze") addPhaseMarker(state, "analyzed");
};

const hasStateTransition = (step: CanonicalStepNode): boolean =>
  [
    "charge",
    "add",
    "cool",
    "heat",
    "hold",
    "purge",
    "quench",
    "extract",
    "wash",
    "separate_layers",
    "filter",
    "dry",
    "concentrate",
    "purify",
    "sample",
    "analyze"
  ].includes(step.family);

const createSnapshot = (
  state: MutableProcedureState,
  step: CanonicalStepNode,
  index: number,
  warnings: ProcedureStateWarning[]
): ProcedureStateSnapshot => ({
  conditions: { ...state.conditions },
  contents: [...state.contents],
  index,
  phaseMarkers: [...state.phaseMarkers],
  sourceStepFamily: step.family,
  sourceStepId: step.stepId,
  warnings
});

const createInitialSnapshot = (): ProcedureStateSnapshot => ({
  conditions: {},
  contents: [],
  index: 0,
  phaseMarkers: [],
  sourceStepFamily: "observe",
  sourceStepId: "initial",
  warnings: []
});

export const buildProcedureState = (
  steps: readonly CanonicalStepNode[]
): ProcedureStateResult => {
  const state: MutableProcedureState = { conditions: {}, contents: [], phaseMarkers: [] };
  const snapshots: ProcedureStateSnapshot[] = [];
  const warnings: ProcedureStateWarning[] = [];

  steps.forEach((step, index) => {
    const stepWarnings: ProcedureStateWarning[] = [];
    if (!hasStateTransition(step)) {
      stepWarnings.push(createWarning(
        step,
        "W_STATE_UNSUPPORTED_STEP",
        "Step family is not represented in the procedure state model."
      ));
    }

    applyMaterialStep(state, step);
    applyConditionStep(state, step);
    applyPhaseStep(state, step);

    warnings.push(...stepWarnings);
    snapshots.push(createSnapshot(state, step, index + 1, stepWarnings));
  });

  return {
    finalState: snapshots.at(-1) ?? createInitialSnapshot(),
    snapshots,
    warnings
  };
};

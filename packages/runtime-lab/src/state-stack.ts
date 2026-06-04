import type { LabState } from "./index";

export interface LabStateSnapshot {
  snapshotId: string;
  createdAt: string;
  reason?: string;
  state: LabState;
}

export interface LabStateStack {
  currentIndex: number;
  snapshots: LabStateSnapshot[];
}

export interface PushLabStateSnapshotOptions {
  now?: string;
  reason?: string;
  snapshotId?: string;
}

export const createLabStateStack = (
  state: LabState,
  options: PushLabStateSnapshotOptions = {}
): LabStateStack => ({
  currentIndex: 0,
  snapshots: [createSnapshot(state, options)]
});

export const pushLabStateSnapshot = (
  stack: LabStateStack,
  state: LabState,
  options: PushLabStateSnapshotOptions = {}
): LabStateStack => {
  const retained = stack.snapshots.slice(0, stack.currentIndex + 1);
  const snapshots = [...retained, createSnapshot(state, options)];
  return {
    currentIndex: snapshots.length - 1,
    snapshots
  };
};

export const restoreLabStateSnapshot = (
  stack: LabStateStack,
  snapshotId: string
): LabState | undefined => {
  const snapshot = stack.snapshots.find((item) => item.snapshotId === snapshotId);
  return snapshot ? cloneLabState(snapshot.state) : undefined;
};

export const restoreCurrentLabStateSnapshot = (
  stack: LabStateStack
): LabState | undefined => {
  const snapshot = stack.snapshots[stack.currentIndex];
  return snapshot ? cloneLabState(snapshot.state) : undefined;
};

const createSnapshot = (
  state: LabState,
  options: PushLabStateSnapshotOptions
): LabStateSnapshot => ({
  snapshotId: options.snapshotId ?? `snapshot-${state.runId}-${state.trace.length}`,
  createdAt: options.now ?? new Date().toISOString(),
  ...(options.reason ? { reason: options.reason } : {}),
  state: cloneLabState(state)
});

const cloneLabState = (state: LabState): LabState => ({
  ...state,
  stepStates: state.stepStates.map((step) => ({
    ...step,
    diagnostics: [...step.diagnostics]
  })),
  controlStates: state.controlStates.map((control) => ({ ...control })),
  resources: state.resources.map((resource) => ({ ...resource })),
  artifacts: state.artifacts.map((artifact) => ({ ...artifact })),
  observations: state.observations.map((observation) => ({ ...observation })),
  diagnostics: [...state.diagnostics],
  trace: state.trace.map((event) => ({ ...event }))
});

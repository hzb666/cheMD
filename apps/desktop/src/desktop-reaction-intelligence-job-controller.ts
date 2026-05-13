import type {
  ChemdReactionIntelligenceArtifactV1,
  ChemdReactionIntelligenceJobInputV1
} from "@chemd/reaction-map";

import type {
  DesktopCommandMap,
  LocalReactionIntelligenceArtifactInput,
  SaveLocalReactionIntelligenceArtifactResult
} from "./desktop-contracts";
import { buildLocalReactionIntelligenceArtifactInput, toSafeLocalDisplaySummary } from "./desktop-local-store";
import type { LocalReactionIntelligenceArtifactState } from "./desktop-reaction-intelligence-artifact-controller";

export type DesktopReactionIntelligenceJobStatus =
  | "idle"
  | "running"
  | "completed"
  | "skipped"
  | "failed"
  | "save_failed";

export interface DesktopReactionIntelligenceJobMetadata { workspaceId?: string | null; sourceHash?: string | null; graphIndexId?: string | null; }

export interface DesktopReactionIntelligenceJobRunInput extends DesktopReactionIntelligenceJobMetadata {
  job: ChemdReactionIntelligenceJobInputV1 | null | undefined;
}

export interface DesktopReactionIntelligenceWorkerRunInput extends DesktopReactionIntelligenceJobMetadata { job: ChemdReactionIntelligenceJobInputV1; }

export type DesktopReactionIntelligenceWorkerResult =
  | { status: "completed"; artifact: ChemdReactionIntelligenceArtifactV1 | null; message?: string; logTail?: readonly string[]; }
  | { status: "skipped"; artifact?: null; message?: string; reason?: string; logTail?: readonly string[]; }
  | { status: "failed"; artifact?: null; message?: string; error?: unknown; logTail?: readonly string[]; };

export interface DesktopReactionIntelligenceArtifactSummary {
  artifactId: string; jobId: string; graphIndexId: string; generatedAt: string;
  providerCount: number; reactionFeatureCount: number; similarityEdgeCount: number; warningCount: number;
}

export interface DesktopReactionIntelligenceJobState extends DesktopReactionIntelligenceJobMetadata {
  status: DesktopReactionIntelligenceJobStatus; message: string;
  startedAt: string | null; finishedAt: string | null;
  artifactSummary: DesktopReactionIntelligenceArtifactSummary | null;
  savedRecord: SaveLocalReactionIntelligenceArtifactResult | null;
  latestArtifact: LocalReactionIntelligenceArtifactState | null;
  error: string | null; logTail: string[];
}

export interface DesktopReactionIntelligenceJobControllerDeps {
  runWorker: (input: DesktopReactionIntelligenceWorkerRunInput) => Promise<DesktopReactionIntelligenceWorkerResult>;
  saveArtifact: (input: LocalReactionIntelligenceArtifactInput) => Promise<SaveLocalReactionIntelligenceArtifactResult>;
  readLatestArtifact: (input: DesktopReactionIntelligenceJobMetadata) => Promise<LocalReactionIntelligenceArtifactState>;
  now: () => string;
}

export interface DesktopReactionIntelligenceJobController {
  getState: () => DesktopReactionIntelligenceJobState;
  run: (input: DesktopReactionIntelligenceJobRunInput) => Promise<DesktopReactionIntelligenceJobState>;
  reset: () => DesktopReactionIntelligenceJobState;
}

const DEFAULT_ERROR_MESSAGE = "Reaction intelligence job failed.";
const MAX_LOG_TAIL = 20;

const buildInitialState = (): DesktopReactionIntelligenceJobState => ({
  status: "idle",
  message: "Reaction intelligence job is idle.",
  startedAt: null,
  finishedAt: null,
  artifactSummary: null,
  savedRecord: null,
  latestArtifact: null,
  error: null,
  logTail: []
});

const safeMessage = (value: unknown, fallback: string): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return toSafeLocalDisplaySummary(value instanceof Error ? value.message : String(value)) ?? fallback;
};

const logTail = (logs: readonly string[] | undefined): string[] =>
  (logs ?? []).slice(-MAX_LOG_TAIL).map((item) =>
    toSafeLocalDisplaySummary(item, 240) ?? ""
  ).filter((item) => item.length > 0);

export const toDesktopReactionIntelligenceWorkerResult = (
  result: DesktopCommandMap["run_reaction_intelligence_worker"]["output"]
): DesktopReactionIntelligenceWorkerResult => {
  const logs = [...result.stdoutTail, ...result.stderrTail];
  if (result.status === "completed") {
    return {
      status: "completed",
      artifact: result.artifactJson,
      message: result.message,
      logTail: logs
    };
  }
  if (result.status === "skipped") {
    return {
      status: "skipped",
      reason: result.reason ?? result.detail ?? undefined,
      message: result.message,
      logTail: logs
    };
  }
  return {
    status: "failed",
    error: result.detail ?? result.reason ?? result.message,
    message: result.message,
    logTail: logs
  };
};

const summarizeArtifact = (
  artifact: ChemdReactionIntelligenceArtifactV1
): DesktopReactionIntelligenceArtifactSummary => ({
  artifactId: artifact.artifact_id,
  jobId: artifact.job_id,
  graphIndexId: artifact.graph_index_id,
  generatedAt: artifact.generated_at,
  providerCount: artifact.providers.length,
  reactionFeatureCount: artifact.reaction_features.length,
  similarityEdgeCount: artifact.similarity_edges.length,
  warningCount: artifact.warnings.length
});

const contextFromInput = (
  input: DesktopReactionIntelligenceJobRunInput
): DesktopReactionIntelligenceJobMetadata => ({
  workspaceId: input.workspaceId ?? null,
  sourceHash: input.sourceHash ?? null,
  graphIndexId: input.graphIndexId ?? input.job?.graph_index_id ?? null
});

const isRunnableJob = (
  job: ChemdReactionIntelligenceJobInputV1 | null | undefined
): job is ChemdReactionIntelligenceJobInputV1 =>
  Boolean(job && job.reactions.length > 0 && job.requested_providers.length > 0);

const finishState = (
  state: Omit<DesktopReactionIntelligenceJobState, "finishedAt">,
  now: () => string
): DesktopReactionIntelligenceJobState => ({ ...state, finishedAt: now() });

const latestArtifactSummary = (
  latest: LocalReactionIntelligenceArtifactState,
  fallback: ChemdReactionIntelligenceArtifactV1
): DesktopReactionIntelligenceArtifactSummary =>
  summarizeArtifact(latest.state === "ready" ? latest.artifact : fallback);

const latestArtifactMessage = (latest: LocalReactionIntelligenceArtifactState): string => {
  if (latest.state === "ready") {
    return "Reaction intelligence artifact saved and refreshed from local store.";
  }
  if (latest.state === "failed") {
    return "Reaction intelligence artifact saved, but latest local refresh failed.";
  }
  return "Reaction intelligence artifact saved, but no latest local artifact was returned.";
};

const failedLatestArtifactState = (error: unknown): LocalReactionIntelligenceArtifactState => ({
  state: "failed",
  artifact: null,
  entry: null,
  error: safeMessage(error, "Latest reaction intelligence artifact refresh failed.")
});

const buildSkippedState = (
  context: DesktopReactionIntelligenceJobMetadata,
  message: string,
  now: () => string,
  logs: readonly string[] = []
): DesktopReactionIntelligenceJobState =>
  finishState({
    ...buildInitialState(),
    ...context,
    status: "skipped",
    message,
    startedAt: now(),
    logTail: logTail(logs)
  }, now);

const buildRunningState = (
  context: DesktopReactionIntelligenceJobMetadata,
  startedAt: string
): DesktopReactionIntelligenceJobState => ({
  ...buildInitialState(),
  ...context,
  status: "running",
  message: "Reaction intelligence worker is running.",
  startedAt
});

const buildWorkerFailedState = (
  state: DesktopReactionIntelligenceJobState,
  result: Extract<DesktopReactionIntelligenceWorkerResult, { status: "failed" }>,
  now: () => string
): DesktopReactionIntelligenceJobState =>
  finishState({
    ...state,
    status: "failed",
    message: result.message ?? DEFAULT_ERROR_MESSAGE,
    error: safeMessage(result.error ?? result.message, DEFAULT_ERROR_MESSAGE),
    logTail: logTail(result.logTail)
  }, now);

const buildWorkerSkippedState = (
  state: DesktopReactionIntelligenceJobState,
  result: DesktopReactionIntelligenceWorkerResult,
  now: () => string
): DesktopReactionIntelligenceJobState => {
  const skippedMessage = result.status === "skipped"
    ? result.message ?? result.reason
    : result.message;
  return finishState({
    ...state,
    status: "skipped",
    message: skippedMessage ?? "Reaction intelligence worker did not produce an artifact.",
    logTail: logTail(result.logTail)
  }, now);
};

const persistCompletedArtifact = async (
  deps: DesktopReactionIntelligenceJobControllerDeps,
  state: DesktopReactionIntelligenceJobState,
  context: DesktopReactionIntelligenceJobMetadata,
  artifact: ChemdReactionIntelligenceArtifactV1,
  logs: readonly string[] | undefined
): Promise<DesktopReactionIntelligenceJobState> => {
  try {
    const savedRecord = await deps.saveArtifact(buildLocalReactionIntelligenceArtifactInput(artifact));
    const latestArtifact = await deps.readLatestArtifact({ ...context, graphIndexId: artifact.graph_index_id })
      .catch(failedLatestArtifactState);
    return finishState({
      ...state,
      status: "completed",
      message: latestArtifactMessage(latestArtifact),
      artifactSummary: latestArtifactSummary(latestArtifact, artifact),
      savedRecord,
      latestArtifact,
      logTail: logTail(logs)
    }, deps.now);
  } catch (error: unknown) {
    return finishState({
      ...state,
      status: "save_failed",
      message: "Reaction intelligence artifact was produced, but local save failed.",
      artifactSummary: summarizeArtifact(artifact),
      error: safeMessage(error, "Local reaction intelligence artifact save failed."),
      logTail: logTail(logs)
    }, deps.now);
  }
};

export const createDesktopReactionIntelligenceJobController = (
  deps: DesktopReactionIntelligenceJobControllerDeps
): DesktopReactionIntelligenceJobController => {
  let state = buildInitialState();

  const reset = (): DesktopReactionIntelligenceJobState => {
    state = buildInitialState();
    return state;
  };

  const run = async (
    input: DesktopReactionIntelligenceJobRunInput
  ): Promise<DesktopReactionIntelligenceJobState> => {
    const context = contextFromInput(input);
    if (state.status === "running") {
      return buildSkippedState(context, "Reaction intelligence job is already running.", deps.now);
    }
    if (!isRunnableJob(input.job)) {
      state = buildSkippedState(
        context,
        "No runnable reaction intelligence job is available.",
        deps.now
      );
      return state;
    }

    const startedAt = deps.now();
    state = buildRunningState(context, startedAt);

    const result = await deps.runWorker({ ...context, job: input.job });
    if (result.status === "failed") {
      state = buildWorkerFailedState(state, result, deps.now);
      return state;
    }
    if (result.status === "skipped" || !result.artifact) {
      state = buildWorkerSkippedState(state, result, deps.now);
      return state;
    }

    state = await persistCompletedArtifact(deps, state, context, result.artifact, result.logTail);
    return state;
  };

  return {
    getState: () => state,
    reset,
    run
  };
};

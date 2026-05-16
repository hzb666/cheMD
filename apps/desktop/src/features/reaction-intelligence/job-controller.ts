import type {
  ChemdReactionIntelligenceArtifactV1,
  ChemdReactionIntelligenceJobInputV1
} from "@chemd/reaction-map";

import type {
  CommandMap,
  LocalReactionIntelligenceArtifactInput,
  SaveLocalReactionIntelligenceArtifactResult
} from "../../contracts";
import { buildLocalReactionIntelligenceArtifactInput, toSafeLocalDisplaySummary } from "../local-store/store";
import type { LocalReactionIntelligenceArtifactState } from "./artifact-controller";

export type ReactionIntelligenceJobStatus =
  | "idle"
  | "running"
  | "completed"
  | "skipped"
  | "failed"
  | "save_failed";

export interface ReactionIntelligenceJobMetadata { workspaceId?: string | null; sourceHash?: string | null; graphIndexId?: string | null; }

export interface ReactionIntelligenceJobRunInput extends ReactionIntelligenceJobMetadata {
  job: ChemdReactionIntelligenceJobInputV1 | null | undefined;
}

export interface ReactionIntelligenceWorkerRunInput extends ReactionIntelligenceJobMetadata { job: ChemdReactionIntelligenceJobInputV1; }

export type ReactionIntelligenceWorkerResult =
  | { status: "completed"; artifact: ChemdReactionIntelligenceArtifactV1 | null; message?: string; logTail?: readonly string[]; }
  | { status: "skipped"; artifact?: null; message?: string; reason?: string; logTail?: readonly string[]; }
  | { status: "failed"; artifact?: null; message?: string; error?: unknown; logTail?: readonly string[]; };

export interface ReactionIntelligenceArtifactSummary {
  artifactId: string; jobId: string; graphIndexId: string; generatedAt: string;
  providerCount: number; reactionFeatureCount: number; similarityEdgeCount: number; warningCount: number;
}

export interface ReactionIntelligenceJobState extends ReactionIntelligenceJobMetadata {
  status: ReactionIntelligenceJobStatus; message: string;
  startedAt: string | null; finishedAt: string | null;
  artifactSummary: ReactionIntelligenceArtifactSummary | null;
  savedRecord: SaveLocalReactionIntelligenceArtifactResult | null;
  latestArtifact: LocalReactionIntelligenceArtifactState | null;
  error: string | null; logTail: string[];
}

export interface ReactionIntelligenceJobControllerDeps {
  runWorker: (input: ReactionIntelligenceWorkerRunInput) => Promise<ReactionIntelligenceWorkerResult>;
  saveArtifact: (input: LocalReactionIntelligenceArtifactInput) => Promise<SaveLocalReactionIntelligenceArtifactResult>;
  readLatestArtifact: (input: ReactionIntelligenceJobMetadata) => Promise<LocalReactionIntelligenceArtifactState>;
  now: () => string;
}

export interface ReactionIntelligenceJobController {
  getState: () => ReactionIntelligenceJobState;
  run: (input: ReactionIntelligenceJobRunInput) => Promise<ReactionIntelligenceJobState>;
  reset: () => ReactionIntelligenceJobState;
}

const DEFAULT_ERROR_MESSAGE = "Reaction intelligence job failed.";
const MAX_LOG_TAIL = 20;

const buildInitialState = (): ReactionIntelligenceJobState => ({
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

export const toReactionIntelligenceWorkerResult = (
  result: CommandMap["run_reaction_intelligence_worker"]["output"]
): ReactionIntelligenceWorkerResult => {
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
): ReactionIntelligenceArtifactSummary => ({
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
  input: ReactionIntelligenceJobRunInput
): ReactionIntelligenceJobMetadata => ({
  workspaceId: input.workspaceId ?? null,
  sourceHash: input.sourceHash ?? null,
  graphIndexId: input.graphIndexId ?? input.job?.graph_index_id ?? null
});

const isRunnableJob = (
  job: ChemdReactionIntelligenceJobInputV1 | null | undefined
): job is ChemdReactionIntelligenceJobInputV1 =>
  Boolean(job && job.reactions.length > 0 && job.requested_providers.length > 0);

const finishState = (
  state: Omit<ReactionIntelligenceJobState, "finishedAt">,
  now: () => string
): ReactionIntelligenceJobState => ({ ...state, finishedAt: now() });

const latestArtifactSummary = (
  latest: LocalReactionIntelligenceArtifactState,
  fallback: ChemdReactionIntelligenceArtifactV1
): ReactionIntelligenceArtifactSummary =>
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
  context: ReactionIntelligenceJobMetadata,
  message: string,
  now: () => string,
  logs: readonly string[] = []
): ReactionIntelligenceJobState =>
  finishState({
    ...buildInitialState(),
    ...context,
    status: "skipped",
    message,
    startedAt: now(),
    logTail: logTail(logs)
  }, now);

const buildRunningState = (
  context: ReactionIntelligenceJobMetadata,
  startedAt: string
): ReactionIntelligenceJobState => ({
  ...buildInitialState(),
  ...context,
  status: "running",
  message: "Reaction intelligence worker is running.",
  startedAt
});

const buildWorkerFailedState = (
  state: ReactionIntelligenceJobState,
  result: Extract<ReactionIntelligenceWorkerResult, { status: "failed" }>,
  now: () => string
): ReactionIntelligenceJobState =>
  finishState({
    ...state,
    status: "failed",
    message: result.message ?? DEFAULT_ERROR_MESSAGE,
    error: safeMessage(result.error ?? result.message, DEFAULT_ERROR_MESSAGE),
    logTail: logTail(result.logTail)
  }, now);

const buildWorkerSkippedState = (
  state: ReactionIntelligenceJobState,
  result: ReactionIntelligenceWorkerResult,
  now: () => string
): ReactionIntelligenceJobState => {
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
  deps: ReactionIntelligenceJobControllerDeps,
  state: ReactionIntelligenceJobState,
  context: ReactionIntelligenceJobMetadata,
  artifact: ChemdReactionIntelligenceArtifactV1,
  logs: readonly string[] | undefined
): Promise<ReactionIntelligenceJobState> => {
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

export const createReactionIntelligenceJobController = (
  deps: ReactionIntelligenceJobControllerDeps
): ReactionIntelligenceJobController => {
  let state = buildInitialState();

  const reset = (): ReactionIntelligenceJobState => {
    state = buildInitialState();
    return state;
  };

  const run = async (
    input: ReactionIntelligenceJobRunInput
  ): Promise<ReactionIntelligenceJobState> => {
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

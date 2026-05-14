import { useEffect, useRef, useState } from "react";
import { compileChemdForEditor } from "@chemd/language-service";
import { toChemdDesktopModelUri } from "../MonacoChemdEditor";
import {
  type LocalStoreStatus,
} from "../desktop-contracts";
import { buildLocalRuntimeSnapshotInput } from "../desktop-local-store";
import { initialLocalReactionIntelligenceArtifactState, readLatestLocalReactionIntelligenceArtifact, type LocalReactionIntelligenceArtifactState } from "../desktop-reaction-intelligence-artifact-controller";
import {
  createDesktopReactionIntelligenceJobController,
  toDesktopReactionIntelligenceWorkerResult,
  type DesktopReactionIntelligenceJobController,
} from "../desktop-reaction-intelligence-job-controller";
import type {
  LocalSnapshotState,
  LocalStoreControllerInput,
  LocalStoreOperation,
  LocalSyncState,
  ReactionIntelligenceJobControllerInput,
  WorkspaceIngestControllerInput,
  WorkspaceIngestState,
  WorkspaceSymbolIndexControllerInput,
  WorkspaceSymbolIndexControllerState,
} from "../desktop-types";
import {
  buildPersistCommandInput,
  formatWorkspaceIngestCounts,
  getCommandErrorMessage,
  getLocalSnapshotDisabledReason,
  getLocalStoreErrorMessage,
  getLocalSyncDisabledReason,
  getWorkspaceIngestDisabledReason,
  initialLocalSnapshotState,
  initialLocalStoreStatus,
  initialLocalSyncState,
  initialWorkspaceIngestState,
  initialWorkspaceSymbolIndexState,
  invokeDesktop,
} from "../desktop-utils";
import { runWorkspaceIngestOutboxSave } from "../desktop-workspace-ingest-runner";
import {
  buildDesktopWorkspaceSymbolIndex,
  type DesktopWorkspaceSymbolIndexSummary,
} from "../desktop-workspace-symbol-index";


export const useLocalStoreController = ({
  mode,
  file,
  postgresStatus,
  source,
  workspace,
  compileOutput,
  agentRun
}: LocalStoreControllerInput) => {
  const [status, setStatus] = useState<LocalStoreStatus>(initialLocalStoreStatus);
  const [snapshotState, setSnapshotState] = useState<LocalSnapshotState>(initialLocalSnapshotState);
  const [syncState, setSyncState] = useState<LocalSyncState>(initialLocalSyncState);
  const [reactionIntelligenceArtifactState, setReactionIntelligenceArtifactState] =
    useState<LocalReactionIntelligenceArtifactState>(initialLocalReactionIntelligenceArtifactState);
  const [operation, setOperation] = useState<LocalStoreOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<LocalStoreOperation | null>(null);
  const disabledReason = getLocalSnapshotDisabledReason({
    mode,
    file,
    compileStatus: compileOutput.status
  });
  const syncDisabledReason = getLocalSyncDisabledReason({
    localStoreStatus: status,
    postgresStatus
  });

  const readStatus = async (): Promise<LocalStoreStatus | null> => {
    try {
      const nextStatus = await invokeDesktop("read_local_store_status", undefined);
      setStatus(nextStatus);
      setError(null);
      return nextStatus;
    } catch (nextError: unknown) {
      setStatus(initialLocalStoreStatus);
      setError(getLocalStoreErrorMessage(nextError));
      return null;
    }
  };

  const readReactionIntelligenceArtifact = async (): Promise<LocalReactionIntelligenceArtifactState> => {
    const nextState = await readLatestLocalReactionIntelligenceArtifact({
      listArtifacts: (input) => invokeDesktop("list_local_reaction_intelligence_artifacts", input)
    });
    setReactionIntelligenceArtifactState(nextState);
    return nextState;
  };

  const refresh = async () => {
    if (operationRef.current) return;
    operationRef.current = "refresh";
    setOperation("refresh");
    try {
      await Promise.all([readStatus(), readReactionIntelligenceArtifact()]);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  const saveSnapshot = async () => {
    if (operationRef.current) return;
    if (disabledReason !== null || compileOutput.status === "failed") {
      setSnapshotState({ state: "failure", message: disabledReason ?? "Compile failed.", summary: null });
      return;
    }
    operationRef.current = "save";
    setOperation("save");
    setSnapshotState({ state: "pending", message: "Saving Graph/RAG/Agent snapshot to the local JSON outbox.", summary: null });
    try {
      const persistInput = buildPersistCommandInput({ source, workspace, file, compileOutput, agentRun });
      const localInput = buildLocalRuntimeSnapshotInput(persistInput.payload);
      const result = await invokeDesktop("save_local_runtime_snapshot", localInput);
      setSnapshotState({
        state: "success",
        message: "Saved local snapshot. It is pending Postgres sync until a target reconnects.",
        summary: {
          localId: result.localId,
          idempotencyKey: result.idempotencyKey,
          pendingCount: result.outboxPendingCount
        }
      });
      await Promise.all([readStatus(), readReactionIntelligenceArtifact()]);
    } catch (nextError: unknown) {
      setSnapshotState({ state: "failure", message: getLocalStoreErrorMessage(nextError), summary: null });
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  const syncPending = async () => {
    if (operationRef.current) return;
    if (syncDisabledReason !== null) {
      setSyncState({ state: "failure", message: syncDisabledReason, summary: null });
      return;
    }
    operationRef.current = "sync";
    setOperation("sync");
    setSyncState({ state: "pending", message: "Syncing pending Local Store entries to Postgres.", summary: null });
    try {
      const result = await invokeDesktop("sync_local_outbox_to_postgres", undefined);
      const failedEntries = result.entries.filter((entry) => entry.syncStatus === "failed" || entry.error !== undefined);
      setSyncState({
        state: result.failedCount > 0 ? "failure" : "success",
        message: result.detail || (result.failedCount > 0
          ? "Sync finished with failed entries. Local failures remain visible in the outbox."
          : "Synced pending Local Store entries to Postgres."),
        summary: {
          syncedCount: result.syncedCount,
          failedCount: result.failedCount,
          skippedCount: result.skippedCount,
          target: result.target,
          entries: result.entries,
          failedEntries
        }
      });
      await Promise.all([readStatus(), readReactionIntelligenceArtifact()]);
    } catch (nextError: unknown) {
      setSyncState({ state: "failure", message: getLocalStoreErrorMessage(nextError), summary: null });
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  useEffect(() => {
    setSnapshotState(initialLocalSnapshotState);
    setSyncState(initialLocalSyncState);
  }, [mode, file.id]);

  useEffect(() => {
    void refresh();
  }, []);

  return {
    status,
    snapshotState,
    syncState,
    reactionIntelligenceArtifactState,
    operation,
    disabledReason,
    syncDisabledReason,
    error: error ?? reactionIntelligenceArtifactState.error,
    reset: () => {
      setSnapshotState(initialLocalSnapshotState);
      setSyncState(initialLocalSyncState);
    },
    refresh: () => void refresh(),
    saveSnapshot: () => void saveSnapshot(),
    syncPending: () => void syncPending()
  };
};


export const useReactionIntelligenceJobController = ({
  mode,
  file,
  jobBuild,
  onAfterRun
}: ReactionIntelligenceJobControllerInput) => {
  const controllerRef = useRef<DesktopReactionIntelligenceJobController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createDesktopReactionIntelligenceJobController({
      runWorker: async (input) => {
        const result = await invokeDesktop("run_reaction_intelligence_worker", {
          jobJson: input.job,
          providers: input.job.requested_providers,
          missingDependency: input.job.provider_policy.missing_dependency,
          pretty: false
        });
        return toDesktopReactionIntelligenceWorkerResult(result);
      },
      saveArtifact: (input) => invokeDesktop("save_local_reaction_intelligence_artifact", input),
      readLatestArtifact: (input) => readLatestLocalReactionIntelligenceArtifact({
        listArtifacts: (listInput) => invokeDesktop("list_local_reaction_intelligence_artifacts", listInput),
        graphIndexId: input.graphIndexId
      }),
      now: () => new Date().toISOString()
    });
  }

  const [state, setState] = useState(() => controllerRef.current!.getState());

  useEffect(() => {
    const nextState = controllerRef.current?.reset();
    if (nextState) setState(nextState);
  }, [mode, file.id]);

  const run = async () => {
    const nextState = await controllerRef.current?.run({
      job: jobBuild.job,
      workspaceId: file.id,
      sourceHash: jobBuild.job?.source_compile_run_ids[0] ?? null,
      graphIndexId: jobBuild.job?.graph_index_id ?? null
    });
    if (!nextState || !controllerRef.current) return;
    setState(controllerRef.current.getState());
    if (nextState.status === "completed") {
      onAfterRun();
    }
  };

  return {
    state,
    run: () => void run()
  };
};


export const useWorkspaceIngestController = ({
  mode,
  workspaceState,
  workspace,
  files,
  onAfterRun
}: WorkspaceIngestControllerInput) => {
  const [state, setState] = useState<WorkspaceIngestState>(initialWorkspaceIngestState);
  const runningRef = useRef(false);
  const disabledReason = getWorkspaceIngestDisabledReason({ mode, workspaceState, files });

  useEffect(() => {
    setState(initialWorkspaceIngestState);
  }, [mode, workspace.workspaceId]);

  const runIngest = async () => {
    if (runningRef.current) return;
    if (disabledReason !== null) {
      setState({ ...initialWorkspaceIngestState, state: "failure", message: disabledReason });
      return;
    }
    runningRef.current = true;
    setState((current) => ({
      ...current,
      state: "pending",
      message: "Scanning workspace files and saving eligible Chemd snapshots to the Local Store outbox."
    }));
    try {
      const result = await runWorkspaceIngestOutboxSave({
        workspaceId: workspace.workspaceId,
        files,
        existingItems: state.items,
        readFile: (file) => invokeDesktop("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path
        }),
        compile: (source, file) => {
          const output = compileChemdForEditor({
            source,
            documentUri: file.path,
            options: { strictChemdKind: true, procedureMode: "auto" }
          });
          if (output.status === "failed") throw output.error;
          return {
            compileOutput: output,
            runtimePayload: buildPersistCommandInput({
              source,
              workspace,
              file,
              compileOutput: output,
              agentRun: null
            }).payload
          };
        },
        saveSnapshot: (input) => {
          return invokeDesktop("save_local_runtime_snapshot", input);
        }
      });
      setState({
        state: "success",
        message: `Workspace ingest scan finished: ${formatWorkspaceIngestCounts(result.ingest.summary)}. ${result.message}`,
        items: result.ingest.items,
        summary: result.ingest.summary
      });
      onAfterRun?.();
    } catch (error: unknown) {
      setState((current) => ({
        ...current,
        state: "failure",
        message: getCommandErrorMessage(error, "Workspace ingest failed before queue summary was built.")
      }));
    } finally {
      runningRef.current = false;
    }
  };

  return {
    state,
    disabledReason,
    runIngest: () => void runIngest()
  };
};


export const formatWorkspaceSymbolIndexMessage = (
  summary: DesktopWorkspaceSymbolIndexSummary
): string =>
  `Workspace symbols indexed: ${summary.indexedFiles} ready, ${summary.failedFiles} failed, ${summary.skippedFiles} skipped.`;


export const useWorkspaceSymbolIndexController = ({
  mode,
  workspaceState,
  workspace,
  files,
  selectedFile,
  source
}: WorkspaceSymbolIndexControllerInput): WorkspaceSymbolIndexControllerState => {
  const [state, setState] = useState<WorkspaceSymbolIndexControllerState>(
    initialWorkspaceSymbolIndexState
  );

  useEffect(() => {
    if (mode !== "workspace" || workspaceState !== "open") {
      setState(initialWorkspaceSymbolIndexState);
      return;
    }

    let cancelled = false;
    setState((current) => ({
      ...current,
      state: "pending",
      message: "Building workspace symbol index from local Chemd documents."
    }));

    void buildDesktopWorkspaceSymbolIndex({
      workspace,
      files,
      createDocumentUri: (file) => toChemdDesktopModelUri(file.path),
      readFile: async (file) => {
        if (file.id === selectedFile.id || file.path === selectedFile.path) {
          return source;
        }

        const content = await invokeDesktop("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path
        });
        return content.content;
      }
    }).then((result) => {
      if (cancelled) return;
      setState({
        state: "success",
        message: formatWorkspaceSymbolIndexMessage(result.summary),
        index: result.index,
        summary: result.summary
      });
    }).catch((error: unknown) => {
      if (cancelled) return;
      setState({
        state: "failure",
        message: getCommandErrorMessage(
          error,
          "Workspace symbol index failed before cross-document suggestions were built."
        ),
        index: null,
        summary: null
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    files,
    mode,
    selectedFile.id,
    selectedFile.path,
    source,
    workspace,
    workspaceState
  ]);

  return state;
};

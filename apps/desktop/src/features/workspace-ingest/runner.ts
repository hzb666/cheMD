import type {
  LocalRuntimeSnapshotInput,
  PersistRuntimeGraphRagPayload,
  SaveLocalRuntimeSnapshotResult,
  WorkspaceFileContent,
  WorkspaceFileEntry,
  WorkspaceIngestQueueItem
} from "../../contracts";
import { toSafeLocalDisplaySummary } from "../local-store/store";
import {
  buildWorkspaceIngestOutboxInputs,
  buildWorkspaceIngestQueueItem,
  deriveWorkspaceIngestQueueSummary,
  runWorkspaceIngest
} from "./queue";
import type {
  BuildWorkspaceIngestOutboxInputsResult,
  RunWorkspaceIngestResult
} from "./queue";

const DEFAULT_MAX_RETRY_FAILURES = 3;

type MaybePromise<T> = T | Promise<T>;
type WorkspaceIngestFileContent = string | Pick<WorkspaceFileContent, "content" | "modifiedAtMs">;

export interface WorkspaceIngestRunnerCompileResult {
  compileOutput?: unknown;
  runtimePayload?: PersistRuntimeGraphRagPayload | null;
}

export interface RunWorkspaceIngestOutboxSaveInput {
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  readFile: (file: WorkspaceFileEntry) => MaybePromise<WorkspaceIngestFileContent>;
  compile: (
    source: string,
    file: WorkspaceFileEntry
  ) => MaybePromise<WorkspaceIngestRunnerCompileResult>;
  saveSnapshot: (
    input: LocalRuntimeSnapshotInput
  ) => MaybePromise<SaveLocalRuntimeSnapshotResult>;
  now?: () => string;
  existingItems?: readonly WorkspaceIngestQueueItem[];
  manifestRevisionKeys?: ReadonlyMap<string, string>;
  maxRetryFailures?: number;
}

export interface WorkspaceIngestOutboxSaveFailure {
  localId: string;
  idempotencyKey: string;
  graphSnapshotId: string;
  errorSummary: string;
}

export interface WorkspaceIngestOutboxSaveRunnerResult {
  ingest: RunWorkspaceIngestResult;
  outbox: BuildWorkspaceIngestOutboxInputsResult;
  saveResults: SaveLocalRuntimeSnapshotResult[];
  failedSaves: WorkspaceIngestOutboxSaveFailure[];
  message: string;
}

interface RecordedCompileResult {
  documentPath: string;
  graphSnapshotId: string;
  compileOutput: unknown;
  runtimePayload: PersistRuntimeGraphRagPayload;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getGraphSnapshotId = (payload: PersistRuntimeGraphRagPayload): string =>
  payload.graphSnapshot.graphSnapshotId;

const getCompileOutput = (result: WorkspaceIngestRunnerCompileResult): unknown =>
  result.compileOutput ?? result.runtimePayload ?? null;

const rebuildItemWithRuntimePayload = (
  item: WorkspaceIngestQueueItem,
  recorded: RecordedCompileResult
): WorkspaceIngestQueueItem =>
  buildWorkspaceIngestQueueItem({
    document: {
      workspaceId: item.workspaceId,
      documentId: item.documentId ?? undefined,
      documentPath: item.documentPath,
      documentHash: item.documentHash,
      revisionHash: item.revisionHash,
      modifiedAtMs: typeof item.metadata.modifiedAtMs === "number" ? item.metadata.modifiedAtMs : null
    },
    runtimePayload: recorded.runtimePayload,
    compileOutput: recorded.compileOutput,
    status: item.status,
    failureCount: item.failureCount,
    errorSummary: item.errorSummary,
    metadata: item.metadata,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });

const attachCompiledPayloads = (
  result: RunWorkspaceIngestResult,
  recordedResults: readonly RecordedCompileResult[],
  maxRetryFailures: number
): RunWorkspaceIngestResult => {
  const nextItems = result.items.map((item) => {
    if (item.runtimePayload || item.status !== "pending" || item.graphSnapshotId === null) {
      return item;
    }
    const recorded = recordedResults.find((entry) =>
      entry.documentPath === item.documentPath
      && entry.graphSnapshotId === item.graphSnapshotId
    );
    return recorded ? rebuildItemWithRuntimePayload(item, recorded) : item;
  });
  return {
    items: nextItems,
    summary: deriveWorkspaceIngestQueueSummary(nextItems, { maxRetryFailures })
  };
};

const buildSaveFailure = (
  input: LocalRuntimeSnapshotInput,
  error: unknown
): WorkspaceIngestOutboxSaveFailure => ({
  localId: input.localId,
  idempotencyKey: input.idempotencyKey,
  graphSnapshotId: input.payload.graphSnapshot.graphSnapshotId,
  errorSummary: toSafeLocalDisplaySummary(toErrorMessage(error)) ?? "Local snapshot save failed."
});

const buildMessage = (
  outboxCount: number,
  savedCount: number,
  failedCount: number
): string => {
  if (outboxCount === 0) {
    return "Workspace ingest finished with no outbox-ready local snapshot inputs.";
  }
  if (failedCount > 0) {
    return `Workspace ingest saved ${savedCount} of ${outboxCount} outbox-ready local snapshot(s); ${failedCount} save failure(s) need attention.`;
  }
  return `Workspace ingest saved ${savedCount} outbox-ready local snapshot(s).`;
};

export const runWorkspaceIngestOutboxSave = async (
  input: RunWorkspaceIngestOutboxSaveInput
): Promise<WorkspaceIngestOutboxSaveRunnerResult> => {
  const createdAt = input.now?.() ?? new Date().toISOString();
  const maxRetryFailures = input.maxRetryFailures ?? DEFAULT_MAX_RETRY_FAILURES;
  const recordedResults: RecordedCompileResult[] = [];
  const ingestResult = await runWorkspaceIngest({
    workspaceId: input.workspaceId,
    files: input.files,
    readFile: input.readFile,
    existingItems: input.existingItems,
    manifestRevisionKeys: input.manifestRevisionKeys,
    maxRetryFailures,
    createdAt,
    compile: async (source, file) => {
      const compileResult = await input.compile(source, file);
      if (compileResult.runtimePayload) {
        recordedResults.push({
          documentPath: file.path,
          graphSnapshotId: getGraphSnapshotId(compileResult.runtimePayload),
          compileOutput: getCompileOutput(compileResult),
          runtimePayload: compileResult.runtimePayload
        });
      }
      return getCompileOutput(compileResult);
    }
  });
  const ingest = attachCompiledPayloads(ingestResult, recordedResults, maxRetryFailures);
  const outbox = buildWorkspaceIngestOutboxInputs(ingest.items, { maxRetryFailures });
  const saveResults: SaveLocalRuntimeSnapshotResult[] = [];
  const failedSaves: WorkspaceIngestOutboxSaveFailure[] = [];
  for (const outboxInput of outbox.inputs) {
    try {
      saveResults.push(await input.saveSnapshot(outboxInput));
    } catch (error) {
      failedSaves.push(buildSaveFailure(outboxInput, error));
    }
  }
  return {
    ingest,
    outbox,
    saveResults,
    failedSaves,
    message: buildMessage(outbox.inputs.length, saveResults.length, failedSaves.length)
  };
};

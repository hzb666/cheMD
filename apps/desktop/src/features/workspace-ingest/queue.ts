import type {
  PersistRuntimeGraphRagPayload,
  LocalRuntimeSnapshotInput,
  RuntimeJsonObject,
  RuntimeJsonValue,
  WorkspaceFileContent,
  WorkspaceFileEntry,
  WorkspaceIngestDocumentMetadata,
  WorkspaceIngestQueueItem,
  WorkspaceIngestQueueStatus,
  WorkspaceIngestQueueSummary
} from "../../contracts";
import {
  buildLocalRuntimeSnapshotInput,
  toSafeLocalDisplaySummary
} from "../local-store/store";

const HASH_PREFIX = "fnv1a";
const DEFAULT_MAX_ERROR_LENGTH = 160,
  DEFAULT_MAX_ERRORS = 5,
  DEFAULT_MAX_RETRY_FAILURES = 3;

export interface BuildWorkspaceIngestQueueItemInput {
  document: WorkspaceIngestDocumentMetadata;
  runtimePayload?: PersistRuntimeGraphRagPayload | null;
  compileOutput?: unknown;
  status?: WorkspaceIngestQueueStatus;
  failureCount?: number;
  errorSummary?: string | null;
  metadata?: RuntimeJsonObject;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeriveWorkspaceIngestQueueSummaryOptions {
  maxErrors?: number;
  maxErrorLength?: number;
  maxRetryFailures?: number;
}

export type WorkspaceIngestOutboxDisposition = "eligible" | "retryable" | "skipped" | "blocked";

export type WorkspaceIngestOutboxReason =
  | "pending_runtime_payload"
  | "failed_retryable_runtime_payload"
  | "status_skipped"
  | "already_synced"
  | "currently_running"
  | "missing_runtime_payload"
  | "retry_limit_reached";

export interface BuildWorkspaceIngestOutboxInputsOptions {
  maxRetryFailures?: number;
  maxErrorLength?: number;
}

export interface WorkspaceIngestOutboxItemSummary {
  queueId: string;
  documentPath: string;
  status: WorkspaceIngestQueueStatus;
  disposition: WorkspaceIngestOutboxDisposition;
  reason: WorkspaceIngestOutboxReason;
  failureCount: number;
  retryable: boolean;
  localId: string | null;
  idempotencyKey: string | null;
  graphSnapshotId: string | null;
  errorSummary: string | null;
}

export interface WorkspaceIngestOutboxSummary {
  eligibleCount: number;
  retryableCount: number;
  skippedCount: number;
  blockedCount: number;
  outboxCount: number;
  totalCount: number;
  items: WorkspaceIngestOutboxItemSummary[];
}

export interface BuildWorkspaceIngestOutboxInputsResult {
  inputs: LocalRuntimeSnapshotInput[];
  summary: WorkspaceIngestOutboxSummary;
}

type MaybePromise<T> = T | Promise<T>;
type WorkspaceIngestFileContent = string | Pick<WorkspaceFileContent, "content" | "modifiedAtMs">;

export interface RunWorkspaceIngestInput {
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  readFile: (file: WorkspaceFileEntry) => MaybePromise<WorkspaceIngestFileContent>;
  compile: (source: string, file: WorkspaceFileEntry) => MaybePromise<unknown>;
  existingItems?: readonly WorkspaceIngestQueueItem[];
  maxRetryFailures?: number;
  createdAt?: string;
}

export interface RunWorkspaceIngestResult {
  items: WorkspaceIngestQueueItem[];
  summary: WorkspaceIngestQueueSummary;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requireText = (value: string | undefined, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required workspace ingest field: ${field}`);
  }
  return value.trim();
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const stableStringify = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value !== "object") return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) =>
    `${JSON.stringify(key)}:${stableStringify(entryValue)}`
  ).join(",")}}`;
};

const stableHash = (value: unknown): string =>
  `${HASH_PREFIX}:${hashString(stableStringify(value))}`;

const isChemdDocument = (file: WorkspaceFileEntry): boolean => {
  const path = file.path.toLowerCase();
  return file.kind === "file"
    && (
      path.endsWith(".chemd")
      || path.endsWith(".chemd.md")
      || file.chemdKind === "document"
    );
};
const isPlainMarkdown = (file: WorkspaceFileEntry): boolean =>
  file.kind === "file" && file.path.toLowerCase().endsWith(".md");
const toSourceText = (content: WorkspaceIngestFileContent): string =>
  typeof content === "string" ? content : content.content;
const toModifiedAtMs = (content: WorkspaceIngestFileContent): number | null | undefined =>
  typeof content === "string" ? undefined : content.modifiedAtMs;

const getMetadataString = (metadata: RuntimeJsonObject | undefined, key: string): string | undefined => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const readObjectString = (value: unknown, key: string): string | undefined => {
  const field = isRecord(value) ? value[key] : undefined;
  return typeof field === "string" && field.trim().length > 0 ? field : undefined;
};

const getGraphSnapshotId = (
  payload: PersistRuntimeGraphRagPayload | null | undefined,
  compileOutput: unknown
): string | null =>
  payload?.graphSnapshot.graphSnapshotId
  || readObjectString(isRecord(compileOutput) ? compileOutput.graphSnapshot : undefined, "graphSnapshotId")
  || null;

const getRevisionHash = (input: BuildWorkspaceIngestQueueItemInput): string =>
  input.document.revisionHash
  ?? getMetadataString(input.runtimePayload?.metadata, "revisionHash")
  ?? getMetadataString(input.runtimePayload?.metadata, "sourceHash")
  ?? stableHash({
    documentHash: input.document.documentHash,
    revisionId: input.document.revisionId ?? getMetadataString(input.runtimePayload?.metadata, "revisionId") ?? null,
    sourceRevisionIds: input.runtimePayload?.graphSnapshot.sourceRevisionIds ?? null,
    compileOutput: input.compileOutput ?? null
  });

const toRuntimeJson = (value: string | number | null | undefined): RuntimeJsonValue =>
  value === undefined ? null : value;

const buildMetadata = (
  input: BuildWorkspaceIngestQueueItemInput,
  revisionHash: string,
  snapshotHash: string,
  graphSnapshotId: string | null
): RuntimeJsonObject => ({
  ...(input.runtimePayload?.metadata ?? {}),
  ...(input.metadata ?? {}),
  workspaceIngestKind: "workspace_ingest_queue_item",
  idempotencyHashAlgorithm: HASH_PREFIX,
  workspaceId: input.document.workspaceId,
  documentId: input.document.documentId ?? null,
  documentPath: input.document.documentPath,
  documentHash: input.document.documentHash,
  sourceHash: input.document.documentHash,
  revisionId: input.document.revisionId ?? getMetadataString(input.runtimePayload?.metadata, "revisionId") ?? null,
  revisionHash,
  snapshotHash,
  graphSnapshotId,
  compileOutputHash: input.compileOutput === undefined ? null : stableHash(input.compileOutput),
  modifiedAtMs: toRuntimeJson(input.document.modifiedAtMs)
});

const canRetry = (
  item: Pick<WorkspaceIngestQueueItem, "status" | "failureCount">,
  maxFailures: number
): boolean =>
  item.status === "pending" || (item.status === "failed" && item.failureCount < maxFailures);

export const buildWorkspaceIngestQueueItem = (
  input: BuildWorkspaceIngestQueueItemInput
): WorkspaceIngestQueueItem => {
  const workspaceId = requireText(input.document.workspaceId, "document.workspaceId");
  const documentPath = requireText(input.document.documentPath, "document.documentPath");
  const documentHash = requireText(input.document.documentHash, "document.documentHash");
  const revisionHash = getRevisionHash(input);
  const graphSnapshotId = getGraphSnapshotId(input.runtimePayload, input.compileOutput);
  const snapshotHash = stableHash({
    graphSnapshotId,
    runtimePayload: input.runtimePayload ?? null,
    compileOutput: input.compileOutput ?? null
  });
  const identity = { workspaceId, documentPath, documentHash, revisionHash, snapshotHash };
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    queueId: `workspace-ingest:${hashString(workspaceId)}:${hashString(documentPath)}:${hashString(revisionHash)}`,
    idempotencyKey: `workspace-ingest:${stableHash(identity)}`,
    workspaceId,
    documentId: input.document.documentId ?? null,
    documentPath,
    documentHash,
    revisionHash,
    snapshotHash,
    graphSnapshotId,
    status: input.status ?? (input.errorSummary ? "failed" : "pending"),
    failureCount: input.failureCount ?? (input.errorSummary ? 1 : 0),
    errorSummary: toSafeLocalDisplaySummary(input.errorSummary),
    runtimePayload: input.runtimePayload ?? undefined,
    metadata: buildMetadata(input, revisionHash, snapshotHash, graphSnapshotId),
    createdAt,
    updatedAt: input.updatedAt ?? createdAt
  };
};

const countByStatus = (
  items: readonly WorkspaceIngestQueueItem[],
  status: WorkspaceIngestQueueStatus
): number => items.filter((item) => item.status === status).length;

const getSkippedOutboxReason = (
  status: Exclude<WorkspaceIngestQueueStatus, "pending" | "failed">
): WorkspaceIngestOutboxReason => {
  if (status === "synced") return "already_synced";
  if (status === "running") return "currently_running";
  return "status_skipped";
};

interface BuildOutboxSummaryItemInput {
  item: WorkspaceIngestQueueItem;
  input: LocalRuntimeSnapshotInput | null;
  state: Pick<WorkspaceIngestOutboxItemSummary, "disposition" | "reason" | "retryable">;
  maxErrorLength: number;
}

const buildOutboxSummaryItem = ({
  item,
  input,
  state,
  maxErrorLength
}: BuildOutboxSummaryItemInput): WorkspaceIngestOutboxItemSummary => ({
  queueId: item.queueId,
  documentPath: item.documentPath,
  status: item.status,
  disposition: state.disposition,
  reason: state.reason,
  failureCount: item.failureCount,
  retryable: state.retryable,
  localId: input?.localId ?? null,
  idempotencyKey: input?.idempotencyKey ?? null,
  graphSnapshotId: input?.payload.graphSnapshot.graphSnapshotId ?? item.graphSnapshotId,
  errorSummary: toSafeLocalDisplaySummary(item.errorSummary, maxErrorLength)
});

const deriveOutboxDisposition = (
  item: WorkspaceIngestQueueItem,
  maxRetryFailures: number
): Pick<WorkspaceIngestOutboxItemSummary, "disposition" | "reason" | "retryable"> => {
  const retryable = canRetry(item, maxRetryFailures);
  if (item.status !== "pending" && item.status !== "failed") {
    return {
      disposition: "skipped",
      reason: getSkippedOutboxReason(item.status),
      retryable
    };
  }
  if (!item.runtimePayload) {
    return { disposition: "blocked", reason: "missing_runtime_payload", retryable };
  }
  if (item.status === "failed" && !retryable) {
    return { disposition: "blocked", reason: "retry_limit_reached", retryable };
  }
  if (item.status === "failed") {
    return { disposition: "retryable", reason: "failed_retryable_runtime_payload", retryable };
  }
  return { disposition: "eligible", reason: "pending_runtime_payload", retryable };
};

const countByDisposition = (
  items: readonly WorkspaceIngestOutboxItemSummary[],
  disposition: WorkspaceIngestOutboxDisposition
): number => items.filter((item) => item.disposition === disposition).length;

export const buildWorkspaceIngestOutboxInputs = (
  items: readonly WorkspaceIngestQueueItem[],
  options: BuildWorkspaceIngestOutboxInputsOptions = {}
): BuildWorkspaceIngestOutboxInputsResult => {
  const maxRetryFailures = options.maxRetryFailures ?? DEFAULT_MAX_RETRY_FAILURES;
  const maxErrorLength = options.maxErrorLength ?? DEFAULT_MAX_ERROR_LENGTH;
  const inputs: LocalRuntimeSnapshotInput[] = [];
  const summaries = items.map((item) => {
    const state = deriveOutboxDisposition(item, maxRetryFailures);
    const input = item.runtimePayload
      && (state.disposition === "eligible" || state.disposition === "retryable")
      ? buildLocalRuntimeSnapshotInput(item.runtimePayload)
      : null;
    if (input) inputs.push(input);
    return buildOutboxSummaryItem({
      item,
      input,
      state,
      maxErrorLength
    });
  });

  return {
    inputs,
    summary: {
      eligibleCount: countByDisposition(summaries, "eligible"),
      retryableCount: countByDisposition(summaries, "retryable"),
      skippedCount: countByDisposition(summaries, "skipped"),
      blockedCount: countByDisposition(summaries, "blocked"),
      outboxCount: inputs.length,
      totalCount: items.length,
      items: summaries
    }
  };
};

export const deriveWorkspaceIngestQueueSummary = (
  items: readonly WorkspaceIngestQueueItem[],
  options: DeriveWorkspaceIngestQueueSummaryOptions = {}
): WorkspaceIngestQueueSummary => {
  const maxErrors = options.maxErrors ?? DEFAULT_MAX_ERRORS;
  const maxErrorLength = options.maxErrorLength ?? DEFAULT_MAX_ERROR_LENGTH;
  const maxRetryFailures = options.maxRetryFailures ?? DEFAULT_MAX_RETRY_FAILURES;
  const errors = items
    .filter((item) => item.status === "failed" && item.errorSummary)
    .slice(0, maxErrors)
    .map((item) => ({
      queueId: item.queueId,
      documentPath: item.documentPath,
      status: item.status,
      failureCount: item.failureCount,
      retryable: canRetry(item, maxRetryFailures),
      errorSummary: toSafeLocalDisplaySummary(item.errorSummary, maxErrorLength) ?? "Workspace ingest failed."
    }));
  return {
    pendingCount: countByStatus(items, "pending"),
    runningCount: countByStatus(items, "running"),
    syncedCount: countByStatus(items, "synced"),
    failedCount: countByStatus(items, "failed"),
    skippedCount: countByStatus(items, "skipped"),
    retryableCount: items.filter((item) => canRetry(item, maxRetryFailures)).length,
    totalCount: items.length,
    errors
  };
};

const buildDocumentMetadata = (
  workspaceId: string,
  file: WorkspaceFileEntry,
  source: string,
  modifiedAtMs?: number | null
): WorkspaceIngestDocumentMetadata => {
  const documentHash = stableHash({ kind: "workspace-source", source });
  const revisionHash = stableHash({ workspaceId, documentPath: file.path, documentHash });
  return {
    workspaceId,
    documentId: file.id,
    documentPath: file.path,
    documentHash,
    revisionHash,
    modifiedAtMs
  };
};

const findExistingItem = (
  input: RunWorkspaceIngestInput, document: WorkspaceIngestDocumentMetadata
): WorkspaceIngestQueueItem | undefined =>
  input.existingItems?.find((item) =>
    item.workspaceId === input.workspaceId
    && item.documentPath === document.documentPath
    && item.documentHash === document.documentHash
    && item.revisionHash === document.revisionHash
  );

const canReuseExistingItem = (item: WorkspaceIngestQueueItem): boolean =>
  item.status === "pending" || item.status === "running" || item.status === "synced";

const reachedRetryLimit = (input: RunWorkspaceIngestInput, item: WorkspaceIngestQueueItem): boolean =>
  item.status === "failed"
  && item.failureCount >= (input.maxRetryFailures ?? DEFAULT_MAX_RETRY_FAILURES);

const buildSkippedMarkdownItem = (
  input: RunWorkspaceIngestInput,
  file: WorkspaceFileEntry
): WorkspaceIngestQueueItem => {
  const documentHash = stableHash({ kind: "non-chemd-markdown", path: file.path });
  const revisionHash = stableHash({ workspaceId: input.workspaceId, documentPath: file.path, documentHash });
  return buildWorkspaceIngestQueueItem({
    document: {
      workspaceId: input.workspaceId,
      documentId: file.id,
      documentPath: file.path,
      documentHash,
      revisionHash
    },
    status: "skipped",
    metadata: { skipReason: "non_chemd_markdown" },
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const buildFailedItem = (
  input: RunWorkspaceIngestInput,
  file: WorkspaceFileEntry,
  source: string,
  error: unknown,
  modifiedAtMs?: number | null
): WorkspaceIngestQueueItem => {
  const document = buildDocumentMetadata(input.workspaceId, file, source, modifiedAtMs);
  const previous = findExistingItem(input, document);
  return buildWorkspaceIngestQueueItem({
    document,
    status: "failed",
    failureCount: (previous?.failureCount ?? 0) + 1,
    errorSummary: getErrorMessage(error),
    createdAt: previous?.createdAt ?? input.createdAt,
    updatedAt: input.createdAt
  });
};

const appendExistingQueueItems = (
  target: WorkspaceIngestQueueItem[],
  existingItems: readonly WorkspaceIngestQueueItem[] | undefined
): void => {
  if (!existingItems) return;
  const queueIds = new Set(target.map((item) => item.queueId));
  existingItems.forEach((item) => {
    if (!queueIds.has(item.queueId)) {
      target.push(item);
      queueIds.add(item.queueId);
    }
  });
};

const processChemdFile = async (
  input: RunWorkspaceIngestInput,
  file: WorkspaceFileEntry
): Promise<WorkspaceIngestQueueItem> => {
  let content: WorkspaceIngestFileContent = "";
  try {
    content = await input.readFile(file);
    const source = toSourceText(content);
    const document = buildDocumentMetadata(input.workspaceId, file, source, toModifiedAtMs(content));
    const existing = findExistingItem(input, document);
    if (existing && (canReuseExistingItem(existing) || reachedRetryLimit(input, existing))) {
      return existing;
    }
    return buildWorkspaceIngestQueueItem({
      document,
      compileOutput: await input.compile(source, file),
      status: "pending",
      createdAt: existing?.createdAt ?? input.createdAt,
      updatedAt: input.createdAt
    });
  } catch (error) {
    return buildFailedItem(input, file, toSourceText(content), error, toModifiedAtMs(content));
  }
};

export const runWorkspaceIngest = async (
  input: RunWorkspaceIngestInput
): Promise<RunWorkspaceIngestResult> => {
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  const normalizedInput = { ...input, workspaceId };
  const items: WorkspaceIngestQueueItem[] = [];
  for (const file of normalizedInput.files) {
    if (isChemdDocument(file)) {
      items.push(await processChemdFile(normalizedInput, file));
    } else if (isPlainMarkdown(file)) {
      items.push(buildSkippedMarkdownItem(normalizedInput, file));
    }
  }
  appendExistingQueueItems(items, normalizedInput.existingItems);
  return {
    items,
    summary: deriveWorkspaceIngestQueueSummary(items, {
      maxRetryFailures: normalizedInput.maxRetryFailures
    })
  };
};

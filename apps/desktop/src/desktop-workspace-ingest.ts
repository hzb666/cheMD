import type {
  PersistRuntimeGraphRagPayload,
  RuntimeJsonObject,
  RuntimeJsonValue,
  WorkspaceFileContent,
  WorkspaceFileEntry,
  WorkspaceIngestDocumentMetadata,
  WorkspaceIngestQueueItem,
  WorkspaceIngestQueueStatus,
  WorkspaceIngestQueueSummary
} from "./desktop-contracts";
import { toSafeLocalDisplaySummary } from "./desktop-local-store";

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

type MaybePromise<T> = T | Promise<T>;
type WorkspaceIngestFileContent = string | Pick<WorkspaceFileContent, "content" | "modifiedAtMs">;

export interface RunWorkspaceIngestInput {
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  readFile: (file: WorkspaceFileEntry) => MaybePromise<WorkspaceIngestFileContent>;
  compile: (source: string, file: WorkspaceFileEntry) => MaybePromise<unknown>;
  existingItems?: readonly WorkspaceIngestQueueItem[];
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

const isChemdMarkdown = (file: WorkspaceFileEntry): boolean =>
  file.kind === "file" && file.path.toLowerCase().endsWith(".chemd.md");
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
  );

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
    if (existing?.status === "synced") return existing;
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
    if (isChemdMarkdown(file)) {
      items.push(await processChemdFile(normalizedInput, file));
    } else if (isPlainMarkdown(file)) {
      items.push(buildSkippedMarkdownItem(normalizedInput, file));
    }
  }
  return { items, summary: deriveWorkspaceIngestQueueSummary(items) };
};

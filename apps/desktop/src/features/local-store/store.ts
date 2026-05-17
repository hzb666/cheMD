import type {
  LocalReactionIntelligenceArtifactInput,
  LocalAuthoringCompileState,
  LocalAuthoringStatus,
  LocalAuthoringStepSummary,
  LocalOutboxDisplayEntry,
  LocalOutboxDisplaySummary,
  LocalOutboxEntry,
  LocalOutboxSyncSummary,
  LocalRuntimeSnapshotInput,
  LocalStoreStatus,
  PersistRuntimeGraphRagPayload,
  RuntimeJsonObject,
  SaveLocalRuntimeSnapshotResult
} from "../../contracts";
import type { ChemdReactionIntelligenceArtifactV1 } from "@chemd/reaction-map";

export const localStoreCommandNames = {
  readStatus: "read_local_store_status",
  saveSnapshot: "save_local_runtime_snapshot",
  saveReactionIntelligenceArtifact: "save_local_reaction_intelligence_artifact",
  listReactionIntelligenceArtifacts: "list_local_reaction_intelligence_artifacts",
  listOutbox: "list_local_outbox",
  markSynced: "mark_local_outbox_synced",
  clearFailures: "clear_local_outbox_failures",
  syncOutbox: "sync_local_outbox_to_postgres"
} as const;

const HASH_PREFIX = "fnv1a";
const DEFAULT_MAX_DISPLAY_ENTRIES = 5,
  DEFAULT_MAX_ERROR_LENGTH = 160,
  DEFAULT_MAX_RETRY_FAILURES = 3;

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

const getMetadataString = (metadata: RuntimeJsonObject | undefined, key: string): string | undefined => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const buildSnapshotIdentity = (payload: PersistRuntimeGraphRagPayload): RuntimeJsonObject => {
  const metadata = payload.metadata;
  const revisionId = getMetadataString(metadata, "revisionId")
    ?? payload.graphSnapshot.sourceRevisionIds[0];
  return {
    workspaceId: getMetadataString(metadata, "workspaceId") ?? "unknown-workspace",
    documentId: getMetadataString(metadata, "documentId") ?? null,
    documentPath: getMetadataString(metadata, "documentPath") ?? null,
    experimentId: payload.graphSnapshot.experimentId,
    revisionId,
    graphSnapshotId: payload.graphSnapshot.graphSnapshotId
  };
};

const buildLocalId = (identity: RuntimeJsonObject): string =>
  [
    "local-runtime-snapshot",
    hashString(String(identity.workspaceId)),
    hashString(String(identity.revisionId ?? "unknown-revision")),
    hashString(String(identity.graphSnapshotId))
  ].join(":");

const buildIdempotencyKey = (identity: RuntimeJsonObject, payload: PersistRuntimeGraphRagPayload): string =>
  [
    "local-runtime-snapshot",
    stableHash({
      identity,
      payload
    })
  ].join(":");

export const buildLocalRuntimeSnapshotInput = (
  payload: PersistRuntimeGraphRagPayload
): LocalRuntimeSnapshotInput => {
  const identity = buildSnapshotIdentity(payload);
  return {
    localId: buildLocalId(identity),
    idempotencyKey: buildIdempotencyKey(identity, payload),
    payload,
    metadata: {
      ...(payload.metadata ?? {}),
      localStoreKind: "runtime_graph_rag_snapshot",
      idempotencyHashAlgorithm: HASH_PREFIX,
      ...identity
    },
    createdAt: payload.createdAt ?? payload.graphSnapshot.createdAt
  };
};

const buildReactionIntelligenceArtifactIdentity = (
  artifact: ChemdReactionIntelligenceArtifactV1
): RuntimeJsonObject => ({
  graphIndexId: artifact.graph_index_id,
  artifactId: artifact.artifact_id,
  jobId: artifact.job_id
});

export const buildLocalReactionIntelligenceArtifactInput = (
  artifact: ChemdReactionIntelligenceArtifactV1
): LocalReactionIntelligenceArtifactInput => {
  const identity = buildReactionIntelligenceArtifactIdentity(artifact);
  return {
    localId: [
      "local-reaction-intelligence-artifact",
      hashString(String(identity.graphIndexId)),
      hashString(String(identity.artifactId))
    ].join(":"),
    idempotencyKey: [
      "local-reaction-intelligence-artifact",
      stableHash({
        identity,
        artifact
      })
    ].join(":"),
    artifact,
    metadata: {
      localStoreKind: "reaction_intelligence_artifact",
      idempotencyHashAlgorithm: HASH_PREFIX,
      ...identity
    },
    createdAt: artifact.generated_at
  };
};

export interface DeriveLocalAuthoringStatusInput {
  documentSaved?: boolean; documentSavedAt?: string | null;
  compileState?: LocalAuthoringCompileState; compiledAt?: string | null; compileError?: string | null;
  snapshotResult?: SaveLocalRuntimeSnapshotResult | null; snapshotError?: string | null;
  localStoreStatus?: LocalStoreStatus | null;
  outboxEntries?: readonly LocalOutboxEntry[];
  syncResult?: LocalOutboxSyncSummary | null;
  databaseAvailable?: boolean; syncUnavailableReason?: string | null;
}

export interface DeriveLocalAuthoringStatusOptions { maxEntries?: number; maxErrorLength?: number; maxRetryFailures?: number; }

const truncateSummary = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;

export const toSafeLocalDisplaySummary = (
  value: string | null | undefined,
  maxLength = DEFAULT_MAX_ERROR_LENGTH
): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  const redacted = normalized
    .replace(/\b(DATABASE_URL|CHEMD_POSTGRES_DATABASE_URL)=\S+/gi, "$1=[redacted]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database url]")
    .replace(/\b(password|passwd|pwd|token|api[_-]?key|secret)=\S+/gi, "$1=[redacted]");
  return truncateSummary(redacted, maxLength);
};

const buildSavedStep = (input: DeriveLocalAuthoringStatusInput): LocalAuthoringStepSummary => {
  if (input.documentSaved === true || input.documentSavedAt) {
    return {
      state: "saved",
      label: "Saved",
      detail: "Local .chemd document is saved.",
      at: input.documentSavedAt ?? null,
      error: null
    };
  }
  if (input.documentSaved === false) {
    return {
      state: "pending",
      label: "Unsaved changes",
      detail: "Local document changes have not been saved yet.",
      at: null,
      error: null
    };
  }
  return {
    state: "skipped",
    label: "Save status unknown",
    detail: "Document save status has not been reported.",
    at: null,
    error: null
  };
};

const buildCompileStep = (input: DeriveLocalAuthoringStatusInput): LocalAuthoringStepSummary => {
  const error = toSafeLocalDisplaySummary(input.compileError);
  if (input.compileState === "compiled") {
    return { state: "compiled", label: "Compiled", detail: "Local compile output is available.", at: input.compiledAt ?? null, error: null };
  }
  if (input.compileState === "failed") {
    return { state: "failed", label: "Compile failed", detail: error ?? "Local compile failed.", at: input.compiledAt ?? null, error };
  }
  if (input.compileState === "pending") {
    return { state: "pending", label: "Compile pending", detail: "Waiting for local compile output.", at: null, error: null };
  }
  return { state: "skipped", label: "Compile not run", detail: "No local compile output has been reported.", at: null, error: null };
};

const buildSnapshotStep = (input: DeriveLocalAuthoringStatusInput): LocalAuthoringStepSummary => {
  const error = toSafeLocalDisplaySummary(input.snapshotError);
  if (error) return { state: "failed", label: "Snapshot failed", detail: error, at: null, error };
  if (input.snapshotResult) {
    return { state: "saved", label: "Snapshot saved", detail: "Runtime snapshot is saved to the local outbox.", at: input.snapshotResult.createdAt, error: null };
  }
  if (input.localStoreStatus?.lastSavedAt) {
    return { state: "saved", label: "Snapshot saved", detail: "Last local runtime snapshot is available.", at: input.localStoreStatus.lastSavedAt, error: null };
  }
  if (input.localStoreStatus && !input.localStoreStatus.available) {
    return { state: "failed", label: "Local Store unavailable", detail: input.localStoreStatus.detail, at: null, error: input.localStoreStatus.detail };
  }
  return { state: "skipped", label: "Snapshot not saved", detail: "No local runtime snapshot has been saved yet.", at: null, error: null };
};

const getGraphSnapshotId = (entry: LocalOutboxEntry): string | null => entry.payload.graphSnapshot.graphSnapshotId || null;

const canRetryEntry = (entry: Pick<LocalOutboxDisplayEntry, "syncStatus" | "failureCount">, maxFailures: number): boolean =>
  entry.syncStatus === "pending" || (entry.syncStatus === "failed" && entry.failureCount < maxFailures);

const buildOutboxEntries = (
  input: DeriveLocalAuthoringStatusInput,
  options: Required<DeriveLocalAuthoringStatusOptions>
): LocalOutboxDisplayEntry[] => {
  const entries = new Map<string, LocalOutboxDisplayEntry>();
  for (const entry of input.outboxEntries ?? []) {
    const displayEntry = {
      localId: entry.localId,
      idempotencyKey: entry.idempotencyKey,
      syncStatus: entry.syncStatus,
      graphSnapshotId: getGraphSnapshotId(entry),
      failureCount: entry.failureCount,
      canRetry: false,
      error: toSafeLocalDisplaySummary(entry.lastError, options.maxErrorLength)
    };
    entries.set(entry.localId, { ...displayEntry, canRetry: canRetryEntry(displayEntry, options.maxRetryFailures) });
  }
  for (const entry of input.syncResult?.entries ?? []) {
    if (entries.has(entry.localId)) continue;
    const failureCount = entry.syncStatus === "failed" ? 1 : 0;
    const displayEntry = {
      localId: entry.localId,
      idempotencyKey: entry.idempotencyKey,
      syncStatus: entry.syncStatus,
      graphSnapshotId: entry.graphSnapshotId ?? null,
      failureCount,
      canRetry: false,
      error: toSafeLocalDisplaySummary(entry.error, options.maxErrorLength)
    };
    entries.set(entry.localId, { ...displayEntry, canRetry: canRetryEntry(displayEntry, options.maxRetryFailures) });
  }
  return [...entries.values()];
};

const countByStatus = (entries: readonly LocalOutboxDisplayEntry[], status: LocalOutboxEntry["syncStatus"]): number =>
  entries.filter((entry) => entry.syncStatus === status).length;

const getSyncMessage = (summary: Omit<LocalOutboxDisplaySummary, "message">, reason: string | null | undefined): string => {
  if (summary.failedCount > 0) return `${summary.failedCount} local snapshot sync failure(s) need attention.`;
  if (summary.pendingCount > 0 && !summary.databaseAvailable) {
    const unavailableReason = reason ? `: ${reason}` : ".";
    return `${summary.pendingCount} local snapshot(s) queued locally; shared sync is unavailable${unavailableReason}`;
  }
  if (summary.pendingCount > 0) return `${summary.pendingCount} local snapshot(s) queued for shared sync.`;
  if (summary.syncedCount > 0 && summary.skippedCount === 0) return "Local outbox entries are synced.";
  return reason ?? "No local outbox entries need shared sync.";
};

const deriveSyncState = (summary: Pick<LocalOutboxDisplaySummary, "pendingCount" | "syncedCount" | "failedCount" | "skippedCount">): LocalOutboxDisplaySummary["state"] => {
  if (summary.failedCount > 0) return "failed";
  if (summary.pendingCount > 0) return "pending";
  if (summary.syncedCount > 0 && summary.skippedCount === 0) return "synced";
  return "skipped";
};

const buildSyncSummary = (
  input: DeriveLocalAuthoringStatusInput,
  options: Required<DeriveLocalAuthoringStatusOptions>
): LocalOutboxDisplaySummary => {
  const allEntries = buildOutboxEntries(input, options);
  const pendingCount = Math.max(countByStatus(allEntries, "pending"), input.localStoreStatus?.outboxPendingCount ?? 0);
  const failedCount = Math.max(countByStatus(allEntries, "failed"), input.localStoreStatus?.outboxFailedCount ?? 0);
  const syncedCount = Math.max(countByStatus(allEntries, "synced"), input.syncResult?.syncedCount ?? 0);
  const skippedCount = input.syncResult?.skippedCount ?? 0;
  const retryableCount = allEntries.filter((entry) => entry.canRetry).length;
  const lastError = allEntries.find((entry) => entry.error)?.error ?? null;
  const partial = {
    state: deriveSyncState({ pendingCount, syncedCount, failedCount, skippedCount }),
    pendingCount,
    syncedCount,
    failedCount,
    skippedCount,
    retryableCount,
    totalCount: pendingCount + syncedCount + failedCount + skippedCount,
    databaseAvailable: input.databaseAvailable ?? true,
    lastError,
    entries: allEntries.slice(0, options.maxEntries)
  };
  return { ...partial, message: getSyncMessage(partial, input.syncUnavailableReason) };
};

export const deriveLocalAuthoringStatus = (
  input: DeriveLocalAuthoringStatusInput,
  options: DeriveLocalAuthoringStatusOptions = {}
): LocalAuthoringStatus => {
  const resolvedOptions = {
    maxEntries: options.maxEntries ?? DEFAULT_MAX_DISPLAY_ENTRIES,
    maxErrorLength: options.maxErrorLength ?? DEFAULT_MAX_ERROR_LENGTH,
    maxRetryFailures: options.maxRetryFailures ?? DEFAULT_MAX_RETRY_FAILURES
  };
  return {
    saved: buildSavedStep(input),
    compiled: buildCompileStep(input),
    snapshot: buildSnapshotStep(input),
    sync: buildSyncSummary(input, resolvedOptions)
  };
};

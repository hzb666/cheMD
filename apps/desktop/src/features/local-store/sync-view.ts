import type {
  LocalSyncEntryResult,
  LocalSyncResultRow,
  LocalSyncResultRowCategory,
  LocalSyncResultRowStatus,
  LocalSyncState
} from "../../types";

const DEFAULT_MAX_SYNC_MESSAGE_LENGTH = 120;
const CONFLICT_TEXT_PATTERN = /\b(conflict|base\s+revision|stale\s+revision)\b/iu;

export interface LocalSyncResultRowsOptions {
  maxMessageLength?: number;
}

const truncateSyncMessage = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;

export const sanitizeLocalSyncMessage = (
  value: string | null | undefined,
  maxLength = DEFAULT_MAX_SYNC_MESSAGE_LENGTH
): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  const redacted = normalized
    .replace(/\b(DATABASE_URL|CHEMD_POSTGRES_DATABASE_URL)=\S+/giu, "$1=[redacted]")
    .replace(/postgres(?:ql)?:\/\/\S+/giu, "[redacted database url]")
    .replace(
      /\b(password|passwd|pwd|token|api[_-]?key|secret|access[_-]?key)=\S+/giu,
      "$1=[redacted]"
    )
    .replace(
      /(\b(?:password|passwd|pwd|token|api[_-]?key|secret|access[_-]?key)\s*[:=]\s*)["']?[^"',;\s}]+["']?/giu,
      "$1[redacted]"
    )
    .replace(/\b(Bearer\s+)[a-z0-9._~+/=-]+/giu, "$1[redacted]");
  return truncateSyncMessage(redacted, maxLength);
};

export const isLocalSyncConflictMessage = (message: string | null | undefined): boolean =>
  message !== null
  && message !== undefined
  && CONFLICT_TEXT_PATTERN.test(message);

const getEntryStatus = (
  entry: LocalSyncEntryResult,
  hasError: boolean
): LocalSyncResultRowStatus => {
  if (entry.syncStatus === "synced" && !hasError) return "synced";
  if (entry.syncStatus === "failed" || hasError) return "failed";
  return "skipped";
};

const getEntryCategory = (
  status: LocalSyncResultRowStatus,
  conflict: boolean
): LocalSyncResultRowCategory => {
  if (status === "synced") return "synced";
  if (status === "skipped") return "skipped";
  return conflict ? "failed" : "retryable";
};

const getDefaultRowMessage = (status: LocalSyncResultRowStatus): string => {
  if (status === "synced") return "Synced to Postgres.";
  if (status === "skipped") return "Skipped by the sync command.";
  return "Sync failed.";
};

const toLocalSyncResultRow = (
  entry: LocalSyncEntryResult,
  stateMessage: string,
  options: Required<LocalSyncResultRowsOptions>
): LocalSyncResultRow => {
  const rawMessage = entry.error ?? stateMessage;
  const error = sanitizeLocalSyncMessage(entry.error, options.maxMessageLength);
  const conflict = isLocalSyncConflictMessage(rawMessage);
  const status = getEntryStatus(entry, error !== null);
  const category = getEntryCategory(status, conflict);
  const retryable = category === "retryable";

  return {
    rowId: entry.localId,
    status,
    category,
    localId: entry.localId,
    graphSnapshotId: entry.graphSnapshotId ?? null,
    idempotencyKey: entry.idempotencyKey,
    message: error ?? getDefaultRowMessage(status),
    error,
    conflict,
    retryable,
    failed: status === "failed",
    synced: status === "synced",
    skipped: status === "skipped"
  };
};

export const buildLocalSyncResultRows = (
  state: LocalSyncState,
  options: LocalSyncResultRowsOptions = {}
): LocalSyncResultRow[] => {
  const resolvedOptions = {
    maxMessageLength: options.maxMessageLength ?? DEFAULT_MAX_SYNC_MESSAGE_LENGTH
  };
  return state.summary?.entries.map((entry) =>
    toLocalSyncResultRow(entry, state.message, resolvedOptions)
  ) ?? [];
};

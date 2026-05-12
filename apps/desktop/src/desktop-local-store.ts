import type {
  LocalRuntimeSnapshotInput,
  PersistRuntimeGraphRagPayload,
  RuntimeJsonObject
} from "./desktop-contracts";

export const localStoreCommandNames = {
  readStatus: "read_local_store_status",
  saveSnapshot: "save_local_runtime_snapshot",
  listOutbox: "list_local_outbox",
  markSynced: "mark_local_outbox_synced",
  clearFailures: "clear_local_outbox_failures"
} as const;

const HASH_PREFIX = "fnv1a";

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

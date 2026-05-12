import { describe, expect, it } from "vitest";

import type {
  DesktopCommandMap,
  LocalOutboxEntry,
  LocalOutboxSyncEntryResult,
  LocalOutboxSyncResult,
  LocalOutboxSyncStatus,
  PersistRuntimeGraphRagPayload
} from "./desktop-contracts";
import {
  buildLocalRuntimeSnapshotInput,
  localStoreCommandNames
} from "./desktop-local-store";

const createdAt = "2026-05-12T09:00:00.000Z";

const buildPayload = (
  revisionId = "rev-local-1",
  graphSnapshotId = "snapshot-local-1"
): PersistRuntimeGraphRagPayload => ({
  graphSnapshot: {
    graphSnapshotId,
    experimentId: "exp-local-store",
    sourceRevisionIds: [revisionId],
    graphKind: "reaction",
    nodeCount: 1,
    edgeCount: 0,
    createdAt
  },
  nodes: [{
    nodeId: "node-local-1",
    graphSnapshotId,
    experimentId: "exp-local-store",
    revisionId,
    entityId: "mol-a",
    sourceRange: { startLine: 1, endLine: 3 },
    payload: { kind: "molecule", smiles: "CCO" },
    createdAt
  }],
  edges: [],
  citationCandidates: [],
  agentRuns: [],
  agentToolCalls: [],
  patchProposals: [],
  metadata: {
    workspaceId: "workspace-local",
    documentId: "doc-local",
    documentPath: "experiments/local.chemd.md",
    revisionId,
    graphSnapshotId
  },
  createdAt
});

describe("desktop local store contract builder", () => {
  it("keeps command names aligned with the desktop runtime contract", () => {
    expect(localStoreCommandNames).toEqual({
      readStatus: "read_local_store_status",
      saveSnapshot: "save_local_runtime_snapshot",
      listOutbox: "list_local_outbox",
      markSynced: "mark_local_outbox_synced",
      clearFailures: "clear_local_outbox_failures",
      syncOutbox: "sync_local_outbox_to_postgres"
    });
  });

  it("generates deterministic local IDs and idempotency keys", () => {
    const first = buildLocalRuntimeSnapshotInput(buildPayload());
    const second = buildLocalRuntimeSnapshotInput(buildPayload());

    expect(second.localId).toBe(first.localId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(first.localId).toMatch(/^local-runtime-snapshot:/);
    expect(first.idempotencyKey).toMatch(/^local-runtime-snapshot:fnv1a:/);
  });

  it("uses the same idempotency key for the same payload regardless of object key order", () => {
    const payload = buildPayload();
    const reorderedPayload: PersistRuntimeGraphRagPayload = {
      ...payload,
      metadata: {
        graphSnapshotId: "snapshot-local-1",
        revisionId: "rev-local-1",
        documentPath: "experiments/local.chemd.md",
        documentId: "doc-local",
        workspaceId: "workspace-local"
      }
    };

    expect(buildLocalRuntimeSnapshotInput(reorderedPayload).idempotencyKey)
      .toBe(buildLocalRuntimeSnapshotInput(payload).idempotencyKey);
  });

  it("changes idempotency keys when revision or snapshot identity changes", () => {
    const current = buildLocalRuntimeSnapshotInput(buildPayload());
    const nextRevision = buildLocalRuntimeSnapshotInput(buildPayload("rev-local-2", "snapshot-local-1"));
    const nextSnapshot = buildLocalRuntimeSnapshotInput(buildPayload("rev-local-1", "snapshot-local-2"));

    expect(nextRevision.idempotencyKey).not.toBe(current.idempotencyKey);
    expect(nextSnapshot.idempotencyKey).not.toBe(current.idempotencyKey);
  });

  it("builds the save local runtime snapshot command input shape", () => {
    const payload = buildPayload();
    const input: DesktopCommandMap["save_local_runtime_snapshot"]["input"] =
      buildLocalRuntimeSnapshotInput(payload);

    expect(input).toMatchObject({
      localId: expect.stringContaining("local-runtime-snapshot:"),
      idempotencyKey: expect.stringContaining("local-runtime-snapshot:fnv1a:"),
      payload,
      createdAt,
      metadata: {
        localStoreKind: "runtime_graph_rag_snapshot",
        workspaceId: "workspace-local",
        documentId: "doc-local",
        documentPath: "experiments/local.chemd.md",
        revisionId: "rev-local-1",
        graphSnapshotId: "snapshot-local-1"
      }
    });
  });

  it("locks outbox sync status and entry types", () => {
    const syncStatus: LocalOutboxSyncStatus = "synced";
    const entry: LocalOutboxEntry = {
      ...buildLocalRuntimeSnapshotInput(buildPayload()),
      syncStatus,
      failureCount: 0,
      lastError: null,
      updatedAt: createdAt,
      syncedAt: createdAt
    };

    expect(entry.syncStatus).toBe("synced");
    expect(entry.syncedAt).toBe(createdAt);
  });

  it("locks the sync local outbox command output shape", () => {
    const entry: LocalOutboxSyncEntryResult = {
      localId: "local-runtime-snapshot:workspace:revision:snapshot",
      idempotencyKey: "local-runtime-snapshot:fnv1a:12345678",
      syncStatus: "synced",
      graphSnapshotId: "snapshot-local-1"
    };
    const result: DesktopCommandMap["sync_local_outbox_to_postgres"]["output"] = {
      state: "ready",
      label: "Local outbox synced",
      detail: "Synced 1 pending local runtime snapshot to PostgreSQL",
      target: {
        kind: "external",
        source: "CHEMD_POSTGRES_DATABASE_URL",
        host: "127.0.0.1",
        database: "chemd",
        user: "chemd",
        ssl: "disable",
        timeoutMs: 5000,
        pool: "external"
      },
      syncedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      entries: [entry]
    };
    const typedResult: LocalOutboxSyncResult = result;

    expect(typedResult.entries[0]).toMatchObject({
      localId: entry.localId,
      idempotencyKey: entry.idempotencyKey,
      syncStatus: "synced",
      graphSnapshotId: "snapshot-local-1"
    });
    expect(typedResult.target.kind).toBe("external");
    expect(typedResult.syncedCount).toBe(1);
  });
});

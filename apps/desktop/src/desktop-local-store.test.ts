import { describe, expect, it } from "vitest";

import type { ChemdReactionIntelligenceArtifactV1 } from "@chemd/reaction-map";

import type {
  DesktopCommandMap,
  LocalOutboxEntry,
  LocalOutboxSyncEntryResult,
  LocalOutboxSyncResult,
  LocalOutboxSyncStatus,
  PersistRuntimeGraphRagPayload
} from "./desktop-contracts";
import {
  buildLocalReactionIntelligenceArtifactInput,
  buildLocalRuntimeSnapshotInput,
  deriveLocalAuthoringStatus,
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

const buildReactionIntelligenceArtifact = (
  artifactId = "artifact-local-1",
  edgeScore = 0.92
): ChemdReactionIntelligenceArtifactV1 => ({
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: artifactId,
  job_id: "job-local-1",
  graph_index_id: "graph-index-local-1",
  generated_at: createdAt,
  providers: [{
    provider_id: "rdkit-local",
    kind: "rdkit_fingerprint",
    status: "PASS",
    warnings: []
  }],
  reaction_features: [],
  similarity_edges: [{
    edge_id: "edge-local-1",
    from_reaction_entity_id: "rxn-a",
    to_reaction_entity_id: "rxn-b",
    score: edgeScore,
    confidence: "high",
    basis: ["rdkit_fingerprint_tanimoto"],
    provider_ids: ["rdkit-local"],
    source_hashes: ["hash-a", "hash-b"],
    warnings: []
  }],
  warnings: []
});

const buildOutboxEntry = (
  syncStatus: LocalOutboxSyncStatus,
  overrides: Partial<LocalOutboxEntry> = {}
): LocalOutboxEntry => ({
  ...buildLocalRuntimeSnapshotInput(buildPayload(
    `rev-${syncStatus}`,
    `snapshot-${syncStatus}`
  )),
  syncStatus,
  failureCount: syncStatus === "failed" ? 1 : 0,
  lastError: null,
  updatedAt: createdAt,
  syncedAt: syncStatus === "synced" ? createdAt : null,
  ...overrides
});

describe("desktop local store contract builder", () => {
  it("keeps command names aligned with the desktop runtime contract", () => {
    expect(localStoreCommandNames).toEqual({
      readStatus: "read_local_store_status",
      saveSnapshot: "save_local_runtime_snapshot",
      saveReactionIntelligenceArtifact: "save_local_reaction_intelligence_artifact",
      listReactionIntelligenceArtifacts: "list_local_reaction_intelligence_artifacts",
      listOutbox: "list_local_outbox",
      markSynced: "mark_local_outbox_synced",
      clearFailures: "clear_local_outbox_failures",
      syncOutbox: "sync_local_outbox_to_postgres"
    });
  });

  it("builds deterministic reaction intelligence artifact store inputs", () => {
    const artifact = buildReactionIntelligenceArtifact();
    const first = buildLocalReactionIntelligenceArtifactInput(artifact);
    const second = buildLocalReactionIntelligenceArtifactInput(artifact);
    const changed = buildLocalReactionIntelligenceArtifactInput(
      buildReactionIntelligenceArtifact("artifact-local-1", 0.85)
    );

    expect(second.localId).toBe(first.localId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(changed.localId).toBe(first.localId);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(first).toMatchObject({
      localId: expect.stringContaining("local-reaction-intelligence-artifact:"),
      idempotencyKey: expect.stringContaining("local-reaction-intelligence-artifact:fnv1a:"),
      artifact,
      createdAt,
      metadata: {
        localStoreKind: "reaction_intelligence_artifact",
        graphIndexId: "graph-index-local-1",
        artifactId: "artifact-local-1",
        jobId: "job-local-1"
      }
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

  it("derives authoring status with pending, synced, failed, and skipped sync counts", () => {
    const status = deriveLocalAuthoringStatus({
      documentSaved: true,
      documentSavedAt: createdAt,
      compileState: "compiled",
      compiledAt: createdAt,
      snapshotResult: {
        localId: "local-runtime-snapshot:workspace:revision:snapshot",
        idempotencyKey: "local-runtime-snapshot:fnv1a:12345678",
        syncStatus: "pending",
        createdAt,
        outboxPendingCount: 1
      },
      outboxEntries: [
        buildOutboxEntry("pending"),
        buildOutboxEntry("synced"),
        buildOutboxEntry("failed")
      ],
      syncResult: {
        syncedCount: 1,
        failedCount: 1,
        skippedCount: 2,
        entries: []
      }
    });

    expect(status.saved.state).toBe("saved");
    expect(status.compiled.state).toBe("compiled");
    expect(status.snapshot.state).toBe("saved");
    expect(status.sync).toMatchObject({
      state: "failed",
      pendingCount: 1,
      syncedCount: 1,
      failedCount: 1,
      skippedCount: 2,
      retryableCount: 2,
      totalCount: 5
    });
  });

  it("redacts and bounds local display error summaries", () => {
    const status = deriveLocalAuthoringStatus({
      compileState: "failed",
      compileError: "DATABASE_URL=postgres://user:secret@localhost:5432/chemd token=abc123 failed with a very long message",
      snapshotError: "password=hunter2 snapshot failed",
      outboxEntries: [
        buildOutboxEntry("failed", {
          lastError: "postgresql://chemd:secret@127.0.0.1:5432/chemd api_key=sk-test failed because the target is down"
        })
      ]
    }, { maxErrorLength: 80 });

    expect(status.compiled.error).toContain("DATABASE_URL=[redacted]");
    expect(status.compiled.error).toContain("token=[redacted]");
    expect(status.compiled.error).not.toContain("secret@localhost");
    expect(status.snapshot.error).toBe("password=[redacted] snapshot failed");
    expect(status.sync.lastError).toContain("[redacted database url]");
    expect(status.sync.lastError).toContain("api_key=[redacted]");
    expect(status.sync.lastError?.length).toBeLessThanOrEqual(80);
  });

  it("treats unavailable database sync as queued or skipped local state, not failure", () => {
    const pendingStatus = deriveLocalAuthoringStatus({
      localStoreStatus: {
        state: "offline",
        label: "Offline local store",
        detail: "Postgres is unavailable; local queue remains durable.",
        available: true,
        storagePath: "C:/tmp/chemd-local-store",
        outboxPendingCount: 1,
        outboxFailedCount: 0,
        lastSavedAt: createdAt,
        lastSyncedAt: null
      },
      databaseAvailable: false,
      syncUnavailableReason: "Postgres is not configured"
    });

    expect(pendingStatus.sync.state).toBe("pending");
    expect(pendingStatus.sync.failedCount).toBe(0);
    expect(pendingStatus.sync.message).toContain("queued locally");

    const skippedStatus = deriveLocalAuthoringStatus({
      databaseAvailable: false,
      syncUnavailableReason: "Postgres is not configured"
    });

    expect(skippedStatus.sync.state).toBe("skipped");
    expect(skippedStatus.sync.failedCount).toBe(0);
  });
});

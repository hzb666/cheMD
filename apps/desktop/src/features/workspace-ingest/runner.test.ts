import { describe, expect, it, vi } from "vitest";

import type {
  LocalRuntimeSnapshotInput,
  PersistRuntimeGraphRagPayload,
  SaveLocalRuntimeSnapshotResult,
  WorkspaceFileEntry
} from "../../contracts";
import { buildLocalRuntimeSnapshotInput } from "../local-store/store";
import { buildWorkspaceIngestQueueItem } from "./queue";
import { runWorkspaceIngestOutboxSave } from "./runner";

const createdAt = "2026-05-13T09:30:00.000Z";

const fileEntry = (path: string): WorkspaceFileEntry => ({
  id: path,
  name: path.split("/").pop() ?? path,
  path,
  kind: "file"
});

const buildPayload = (
  documentPath = "experiments/alpha.chemd.md",
  revisionId = "rev-alpha-1",
  graphSnapshotId = "snapshot-alpha-1"
): PersistRuntimeGraphRagPayload => ({
  graphSnapshot: {
    graphSnapshotId,
    experimentId: `exp-${revisionId}`,
    sourceRevisionIds: [revisionId],
    graphKind: "reaction",
    nodeCount: 1,
    edgeCount: 0,
    createdAt
  },
  nodes: [{
    nodeId: `node-${revisionId}`,
    graphSnapshotId,
    experimentId: `exp-${revisionId}`,
    revisionId,
    entityId: `mol-${revisionId}`,
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
    workspaceId: "workspace-alpha",
    documentId: documentPath,
    documentPath,
    revisionId,
    revisionHash: `fnv1a:${revisionId}`,
    sourceHash: `fnv1a:${revisionId}`,
    graphSnapshotId
  },
  createdAt
});

const buildSaveResult = (
  input: LocalRuntimeSnapshotInput,
  outboxPendingCount = 1
): SaveLocalRuntimeSnapshotResult => ({
  localId: input.localId,
  idempotencyKey: input.idempotencyKey,
  syncStatus: "pending",
  createdAt: input.createdAt,
  outboxPendingCount
});

describe("desktop workspace ingest outbox save runner", () => {
  it("scans workspace files, builds outbox inputs, and saves every eligible snapshot", async () => {
    const files = [
      fileEntry("experiments/alpha.chemd.md"),
      fileEntry("experiments/beta.chemd.md")
    ];
    const saveSnapshot = vi.fn((input: LocalRuntimeSnapshotInput) => buildSaveResult(input, 2));

    const result = await runWorkspaceIngestOutboxSave({
      workspaceId: "workspace-alpha",
      files,
      readFile: (file) => `source:${file.path}`,
      compile: (_source, file) => {
        const payload = buildPayload(file.path, `rev-${file.id}`, `snapshot-${file.id}`);
        return {
          compileOutput: { status: "ok", graphSnapshot: payload.graphSnapshot },
          runtimePayload: payload
        };
      },
      saveSnapshot,
      now: () => createdAt
    });

    expect(result.ingest.summary).toMatchObject({ pendingCount: 2, totalCount: 2 });
    expect(result.outbox.summary).toMatchObject({ eligibleCount: 2, outboxCount: 2 });
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    expect(result.saveResults).toHaveLength(2);
    expect(result.failedSaves).toEqual([]);
    expect(result.message).toBe("Workspace ingest saved 2 outbox-ready local snapshot(s).");
  });

  it("continues saving after a failed save and redacts the failure summary", async () => {
    const files = [
      fileEntry("experiments/alpha.chemd.md"),
      fileEntry("experiments/beta.chemd.md")
    ];
    const saveSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error(
        "DATABASE_URL=postgres://user:secret@localhost:5432/chemd token=abc failed"
      ))
      .mockImplementationOnce((input: LocalRuntimeSnapshotInput) => buildSaveResult(input, 2));

    const result = await runWorkspaceIngestOutboxSave({
      workspaceId: "workspace-alpha",
      files,
      readFile: (file) => `source:${file.path}`,
      compile: (_source, file) => {
        const payload = buildPayload(file.path, `rev-${file.id}`, `snapshot-${file.id}`);
        return {
          compileOutput: { status: "ok", graphSnapshot: payload.graphSnapshot },
          runtimePayload: payload
        };
      },
      saveSnapshot,
      now: () => createdAt
    });

    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    expect(result.saveResults).toHaveLength(1);
    expect(result.failedSaves).toHaveLength(1);
    expect(result.failedSaves[0].errorSummary).toContain("DATABASE_URL=[redacted]");
    expect(result.failedSaves[0].errorSummary).toContain("token=[redacted]");
    expect(result.failedSaves[0].errorSummary).not.toContain("secret@localhost");
    expect(result.message).toBe(
      "Workspace ingest saved 1 of 2 outbox-ready local snapshot(s); 1 save failure(s) need attention."
    );
  });

  it("does not call save when no workspace item is eligible for outbox", async () => {
    const saveSnapshot = vi.fn((input: LocalRuntimeSnapshotInput) => buildSaveResult(input));

    const result = await runWorkspaceIngestOutboxSave({
      workspaceId: "workspace-alpha",
      files: [fileEntry("notes/readme.md")],
      readFile: () => "plain markdown",
      compile: () => {
        throw new Error("plain markdown should not compile");
      },
      saveSnapshot,
      now: () => createdAt
    });

    expect(result.ingest.summary).toMatchObject({ skippedCount: 1, totalCount: 1 });
    expect(result.outbox.inputs).toEqual([]);
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(result.message).toBe(
      "Workspace ingest finished with no outbox-ready local snapshot inputs."
    );
  });

  it("does not save failed items that have reached the retry threshold", async () => {
    const payload = buildPayload();
    const failedItem = buildWorkspaceIngestQueueItem({
      document: {
        workspaceId: "workspace-alpha",
        documentId: "doc-alpha",
        documentPath: "experiments/alpha.chemd.md",
        documentHash: "fnv1a:doc-alpha",
        revisionHash: "fnv1a:rev-alpha"
      },
      runtimePayload: payload,
      status: "failed",
      failureCount: 3,
      errorSummary: "compile failed",
      createdAt
    });
    const saveSnapshot = vi.fn((input: LocalRuntimeSnapshotInput) => buildSaveResult(input));

    const result = await runWorkspaceIngestOutboxSave({
      workspaceId: "workspace-alpha",
      files: [],
      readFile: () => "unused",
      compile: () => ({ runtimePayload: payload }),
      saveSnapshot,
      existingItems: [failedItem],
      maxRetryFailures: 3,
      now: () => createdAt
    });

    expect(result.ingest.summary).toMatchObject({ failedCount: 1, retryableCount: 0 });
    expect(result.outbox.summary).toMatchObject({ blockedCount: 1, outboxCount: 0 });
    expect(result.outbox.summary.items[0].reason).toBe("retry_limit_reached");
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("uses the existing local runtime snapshot builder for idempotent save input", async () => {
    const payload = buildPayload();
    const saveSnapshot = vi.fn((input: LocalRuntimeSnapshotInput) => buildSaveResult(input));

    await runWorkspaceIngestOutboxSave({
      workspaceId: "workspace-alpha",
      files: [fileEntry("experiments/alpha.chemd.md")],
      readFile: () => "source:alpha",
      compile: () => ({
        compileOutput: { status: "ok", graphSnapshot: payload.graphSnapshot },
        runtimePayload: payload
      }),
      saveSnapshot,
      now: () => createdAt
    });

    expect(saveSnapshot).toHaveBeenCalledWith(buildLocalRuntimeSnapshotInput(payload));
  });
});

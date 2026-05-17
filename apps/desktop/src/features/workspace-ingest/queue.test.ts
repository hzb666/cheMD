import { describe, expect, it, vi } from "vitest";

import type {
  PersistRuntimeGraphRagPayload,
  WorkspaceFileEntry,
  WorkspaceIngestQueueItem
} from "../../contracts";
import {
  buildWorkspaceIngestOutboxInputs,
  buildWorkspaceIngestKnownRevisions,
  buildWorkspaceIngestQueueItem,
  deriveWorkspaceIngestQueueSummary,
  runWorkspaceIngest,
  selectRunnableWorkspaceIngestPlanItems,
  workspaceIngestManifestRevisionMapFromPlan,
  workspaceIngestPlanItemsToFiles
} from "./queue";
import { buildLocalRuntimeSnapshotInput } from "../local-store/store";

const createdAt = "2026-05-13T09:00:00.000Z";

const document = {
  workspaceId: "workspace-alpha",
  documentId: "doc-alpha",
  documentPath: "experiments/alpha.chemd",
  documentHash: "fnv1a:doc-alpha-v1",
  revisionId: "rev-alpha-1",
  revisionHash: "fnv1a:revision-alpha-v1",
  modifiedAtMs: 1778653200000
};

const buildPayload = (
  revisionId = "rev-alpha-1",
  graphSnapshotId = "snapshot-alpha-1"
): PersistRuntimeGraphRagPayload => ({
  graphSnapshot: {
    graphSnapshotId,
    experimentId: "exp-alpha",
    sourceRevisionIds: [revisionId],
    graphKind: "reaction",
    nodeCount: 1,
    edgeCount: 0,
    createdAt
  },
  nodes: [{
    nodeId: "node-alpha-1",
    graphSnapshotId,
    experimentId: "exp-alpha",
    revisionId,
    entityId: "mol-alpha",
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
    workspaceId: document.workspaceId,
    documentId: document.documentId,
    documentPath: document.documentPath,
    revisionId,
    revisionHash: document.revisionHash,
    sourceHash: document.documentHash,
    graphSnapshotId
  },
  createdAt
});

const buildItem = (
  status: WorkspaceIngestQueueItem["status"],
  overrides: Partial<WorkspaceIngestQueueItem> = {}
): WorkspaceIngestQueueItem => ({
  ...buildWorkspaceIngestQueueItem({
    document,
    runtimePayload: buildPayload(`rev-${status}`, `snapshot-${status}`),
    status,
    createdAt,
    updatedAt: createdAt
  }),
  ...overrides
});

describe("desktop workspace ingest queue builder", () => {
  it("keeps idempotency keys stable for the same document revision and snapshot", () => {
    const first = buildWorkspaceIngestQueueItem({ document, runtimePayload: buildPayload(), createdAt });
    const second = buildWorkspaceIngestQueueItem({ document, runtimePayload: buildPayload(), createdAt });

    expect(second.queueId).toBe(first.queueId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toMatch(/^workspace-ingest:fnv1a:/);
    expect(first).toMatchObject({
      workspaceId: document.workspaceId,
      documentPath: document.documentPath,
      documentHash: document.documentHash,
      revisionHash: document.revisionHash,
      graphSnapshotId: "snapshot-alpha-1",
      status: "pending"
    });
  });

  it("changes idempotency keys when the local file hash changes", () => {
    const current = buildWorkspaceIngestQueueItem({ document, runtimePayload: buildPayload(), createdAt });
    const changed = buildWorkspaceIngestQueueItem({
      document: {
        ...document,
        documentHash: "fnv1a:doc-alpha-v2",
        revisionHash: "fnv1a:revision-alpha-v2"
      },
      runtimePayload: buildPayload("rev-alpha-2", "snapshot-alpha-2"),
      createdAt
    });

    expect(changed.idempotencyKey).not.toBe(current.idempotencyKey);
    expect(changed.queueId).not.toBe(current.queueId);
  });

  it("derives a queue item from compile output without runtime payload IO", () => {
    const item = buildWorkspaceIngestQueueItem({
      document: { ...document, revisionHash: undefined },
      compileOutput: {
        status: "ok",
        graphSnapshot: { graphSnapshotId: "compile-snapshot-1" },
        diagnostics: []
      },
      createdAt
    });

    expect(item.runtimePayload).toBeUndefined();
    expect(item.graphSnapshotId).toBe("compile-snapshot-1");
    expect(item.metadata.compileOutputHash).toMatch(/^fnv1a:/);
    expect(item.revisionHash).toMatch(/^fnv1a:/);
  });

  it("stores backend manifest revision keys for later unchanged planning", async () => {
    const [item] = (await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [{ id: "alpha", name: "alpha.chemd", path: "experiments/alpha.chemd", kind: "file" }],
      manifestRevisionKeys: new Map([["experiments/alpha.chemd", "meta:12:99"]]),
      readFile: () => ({ content: "source:alpha", modifiedAtMs: 99 }),
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "snapshot-alpha" } }),
      createdAt
    })).items;

    expect(item.metadata.workspaceManifestRevisionKey).toBe("meta:12:99");
    expect(buildWorkspaceIngestKnownRevisions([item])).toEqual([{
      documentPath: "experiments/alpha.chemd",
      revisionKey: "meta:12:99"
    }]);
  });

  it("maps backend ingest plan items to frontend files and revision cache", () => {
    const planItems = [{
      id: "workspace:alpha",
      name: "alpha.chemd",
      path: "experiments/alpha.chemd",
      chemdKind: "document" as const,
      bytes: 12,
      modifiedAtMs: 99,
      revisionKey: "meta:12:99",
      disposition: "pending" as const,
      reason: "revision_changed" as const
    }];

    expect(workspaceIngestPlanItemsToFiles(planItems)).toEqual([{
      id: "workspace:alpha",
      name: "alpha.chemd",
      path: "experiments/alpha.chemd",
      kind: "file",
      chemdKind: "document"
    }]);
    expect(workspaceIngestManifestRevisionMapFromPlan(planItems).get("experiments/alpha.chemd"))
      .toBe("meta:12:99");
  });

  it("keeps pending documents and skipped markdown runnable while excluding unchanged documents", () => {
    const pending = {
      id: "workspace:alpha",
      name: "alpha.chemd",
      path: "alpha.chemd",
      chemdKind: "document" as const,
      bytes: 12,
      modifiedAtMs: 99,
      revisionKey: "meta:12:99",
      disposition: "pending" as const,
      reason: "revision_changed" as const
    };
    const skipped = {
      ...pending,
      id: "workspace:notes",
      name: "notes.md",
      path: "notes.md",
      chemdKind: "unknown" as const,
      disposition: "skipped" as const,
      reason: "non_chemd_markdown" as const
    };
    const unchanged = {
      ...pending,
      id: "workspace:unchanged",
      name: "unchanged.chemd",
      path: "unchanged.chemd",
      disposition: "unchanged" as const,
      reason: "revision_match" as const
    };

    expect(selectRunnableWorkspaceIngestPlanItems([pending, skipped, unchanged]))
      .toEqual([pending, skipped]);
  });

  it("counts failed, skipped, running, pending, synced, and retryable items", () => {
    const summary = deriveWorkspaceIngestQueueSummary([
      buildItem("pending"),
      buildItem("running"),
      buildItem("synced"),
      buildItem("skipped"),
      buildItem("failed", { failureCount: 1, errorSummary: "temporary compile failure" }),
      buildItem("failed", { failureCount: 4, errorSummary: "permanent compile failure" })
    ], { maxRetryFailures: 3 });

    expect(summary).toMatchObject({
      pendingCount: 1,
      runningCount: 1,
      syncedCount: 1,
      skippedCount: 1,
      failedCount: 2,
      retryableCount: 2,
      totalCount: 6
    });
    expect(summary.errors.map((error) => error.retryable)).toEqual([true, false]);
  });

  it("redacts and bounds failed workspace ingest error summaries", () => {
    const failed = buildWorkspaceIngestQueueItem({
      document,
      runtimePayload: buildPayload(),
      status: "failed",
      failureCount: 1,
      errorSummary: "DATABASE_URL=postgres://user:secret@localhost:5432/chemd token=abc failed with a very long workspace ingest message",
      createdAt
    });
    const summary = deriveWorkspaceIngestQueueSummary([failed], { maxErrorLength: 80 });

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].errorSummary).toContain("DATABASE_URL=[redacted]");
    expect(summary.errors[0].errorSummary).toContain("token=[redacted]");
    expect(summary.errors[0].errorSummary).not.toContain("secret@localhost");
    expect(summary.errors[0].errorSummary.length).toBeLessThanOrEqual(80);
  });
});

describe("desktop workspace ingest outbox bridge", () => {
  it("builds idempotent local runtime snapshot inputs from pending payload items", () => {
    const item = buildItem("pending");
    const first = buildWorkspaceIngestOutboxInputs([item]);
    const second = buildWorkspaceIngestOutboxInputs([item]);
    const expected = buildLocalRuntimeSnapshotInput(item.runtimePayload!);

    expect(second.inputs).toEqual(first.inputs);
    expect(first.inputs).toEqual([expected]);
    expect(first.summary).toMatchObject({
      eligibleCount: 1,
      retryableCount: 0,
      skippedCount: 0,
      blockedCount: 0,
      outboxCount: 1,
      totalCount: 1
    });
    expect(first.summary.items[0]).toMatchObject({
      disposition: "eligible",
      reason: "pending_runtime_payload",
      localId: expected.localId,
      idempotencyKey: expected.idempotencyKey
    });
  });

  it("filters non-sync-ready statuses, missing payloads, and exhausted failures", () => {
    const pending = buildItem("pending");
    const retryable = buildItem("failed", {
      failureCount: 2,
      errorSummary: "temporary failure"
    });
    const skipped = buildItem("skipped");
    const synced = buildItem("synced");
    const running = buildItem("running");
    const missingPayload = buildItem("pending", { runtimePayload: undefined });
    const exhausted = buildItem("failed", {
      failureCount: 3,
      errorSummary: "permanent failure"
    });
    const result = buildWorkspaceIngestOutboxInputs([
      pending,
      retryable,
      skipped,
      synced,
      running,
      missingPayload,
      exhausted
    ], { maxRetryFailures: 3 });

    expect(result.inputs.map((input) => input.payload.graphSnapshot.graphSnapshotId)).toEqual([
      pending.runtimePayload?.graphSnapshot.graphSnapshotId,
      retryable.runtimePayload?.graphSnapshot.graphSnapshotId
    ]);
    expect(result.summary).toMatchObject({
      eligibleCount: 1,
      retryableCount: 1,
      skippedCount: 3,
      blockedCount: 2,
      outboxCount: 2,
      totalCount: 7
    });
    expect(result.summary.items.map((item) => item.reason)).toEqual([
      "pending_runtime_payload",
      "failed_retryable_runtime_payload",
      "status_skipped",
      "already_synced",
      "currently_running",
      "missing_runtime_payload",
      "retry_limit_reached"
    ]);
  });

  it("honors the failed retry threshold before generating outbox inputs", () => {
    const retryable = buildItem("failed", { failureCount: 2 });
    const exhausted = buildItem("failed", { failureCount: 3 });

    expect(buildWorkspaceIngestOutboxInputs([retryable], { maxRetryFailures: 3 }))
      .toMatchObject({
        inputs: [expect.any(Object)],
        summary: { retryableCount: 1, blockedCount: 0 }
      });
    expect(buildWorkspaceIngestOutboxInputs([exhausted], { maxRetryFailures: 3 }))
      .toMatchObject({
        inputs: [],
        summary: { retryableCount: 0, blockedCount: 1 }
      });
  });

  it("does not generate outbox input when a queue item has no runtime payload", () => {
    const pendingWithoutPayload = buildItem("pending", { runtimePayload: undefined });
    const result = buildWorkspaceIngestOutboxInputs([pendingWithoutPayload]);

    expect(result.inputs).toEqual([]);
    expect(result.summary.items[0]).toMatchObject({
      disposition: "blocked",
      reason: "missing_runtime_payload",
      localId: null,
      idempotencyKey: null
    });
  });

  it("redacts sensitive failed item summaries in outbox bridge reports", () => {
    const failed = buildItem("failed", {
      failureCount: 3,
      errorSummary: "DATABASE_URL=postgres://user:secret@localhost:5432/chemd token=abc failed"
    });
    const result = buildWorkspaceIngestOutboxInputs([failed], {
      maxRetryFailures: 3,
      maxErrorLength: 100
    });

    expect(result.inputs).toEqual([]);
    expect(result.summary.items[0].errorSummary).toContain("DATABASE_URL=[redacted]");
    expect(result.summary.items[0].errorSummary).toContain("token=[redacted]");
    expect(result.summary.items[0].errorSummary).not.toContain("secret@localhost");
  });
});

const fileEntry = (path: string, kind: WorkspaceFileEntry["kind"] = "file"): WorkspaceFileEntry => ({
  id: path,
  name: path.split("/").pop() ?? path,
  path,
  kind
});

describe("desktop workspace ingest runner", () => {
  it("processes .chemd files, skips plain markdown, and excludes other entries", async () => {
    const readPaths: string[] = [];
    const compileSources: string[] = [];
    const result = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [
        fileEntry("experiments/a.chemd"),
        fileEntry("notes/readme.md"),
        fileEntry("assets/table.csv"),
        fileEntry("experiments", "directory")
      ],
      readFile: (file) => {
        readPaths.push(file.path);
        return { content: `source:${file.path}`, modifiedAtMs: 1778653200000 };
      },
      compile: (source) => {
        compileSources.push(source);
        return { status: "ok", source };
      },
      createdAt
    });

    expect(readPaths).toEqual(["experiments/a.chemd"]);
    expect(compileSources).toEqual(["source:experiments/a.chemd"]);
    expect(result.items.map((item) => [item.documentPath, item.status])).toEqual([
      ["experiments/a.chemd", "pending"],
      ["notes/readme.md", "skipped"]
    ]);
    expect(result.items[1].metadata.skipReason).toBe("non_chemd_markdown");
    expect(result.summary).toMatchObject({ pendingCount: 1, skippedCount: 1, totalCount: 2 });
  });

  it("keeps legacy .chemd.md files eligible for ingest", async () => {
    const result = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [fileEntry("experiments/legacy.chemd.md")],
      readFile: (file) => `source:${file.path}`,
      compile: (source) => ({ status: "ok", source }),
      createdAt
    });

    expect(result.items.map((item) => item.documentPath)).toEqual([
      "experiments/legacy.chemd.md"
    ]);
    expect(result.summary).toMatchObject({ pendingCount: 1, totalCount: 1 });
  });

  it("keeps ingest running when one file fails and redacts bounded failure summaries", async () => {
    const files = [fileEntry("experiments/fail.chemd"), fileEntry("experiments/pass.chemd")];
    const firstRun = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files,
      readFile: (file) => `source:${file.path}`,
      compile: (source) => {
        if (source.includes("fail")) {
          throw new Error(
            "DATABASE_URL=postgres://user:secret@localhost:5432/chemd token=abc failed with a very long workspace ingest compile message"
          );
        }
        return { status: "ok", source };
      },
      createdAt
    });
    const secondRun = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [files[0]],
      readFile: (file) => `source:${file.path}`,
      compile: () => {
        throw new Error("token=retry failed");
      },
      existingItems: firstRun.items,
      createdAt
    });
    const failed = firstRun.items.find((item) => item.status === "failed");

    expect(firstRun.summary).toMatchObject({ pendingCount: 1, failedCount: 1, totalCount: 2 });
    expect(failed?.errorSummary).toContain("DATABASE_URL=[redacted]");
    expect(failed?.errorSummary).toContain("token=[redacted]");
    expect(failed?.errorSummary).not.toContain("secret@localhost");
    expect(failed?.errorSummary?.length).toBeLessThanOrEqual(160);
    expect(secondRun.items[0].failureCount).toBe(2);
  });

  it("keeps source hashes and idempotency keys stable until file content changes", async () => {
    const file = fileEntry("experiments/stable.chemd");
    const runWithSource = (source: string) => runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => source,
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "stable-snapshot" } }),
      createdAt
    });

    const [first] = (await runWithSource("same source")).items;
    const [second] = (await runWithSource("same source")).items;
    const [changed] = (await runWithSource("changed source")).items;

    expect(second.documentHash).toBe(first.documentHash);
    expect(second.metadata.sourceHash).toBe(first.documentHash);
    expect(second.revisionHash).toBe(first.revisionHash);
    expect(second.queueId).toBe(first.queueId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(changed.documentHash).not.toBe(first.documentHash);
    expect(changed.revisionHash).not.toBe(first.revisionHash);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("reuses an unchanged pending item without creating another pending revision", async () => {
    const file = fileEntry("experiments/pending.chemd");
    const initial = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "pending source",
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "pending-snapshot" } }),
      createdAt
    });
    const pending = initial.items[0];
    const compile = vi.fn(() => ({ status: "ok" }));
    const resumed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "pending source",
      compile,
      existingItems: [pending],
      createdAt
    });

    expect(compile).not.toHaveBeenCalled();
    expect(resumed.items).toEqual([pending]);
    expect(resumed.summary).toMatchObject({ pendingCount: 1, totalCount: 1 });
  });

  it("reuses an unchanged synced item without compiling it again", async () => {
    const file = fileEntry("experiments/synced.chemd");
    const initial = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "synced source",
      compile: () => ({ status: "ok" }),
      createdAt
    });
    const synced: WorkspaceIngestQueueItem = { ...initial.items[0], status: "synced" };
    const compile = vi.fn(() => ({ status: "ok" }));
    const resumed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "synced source",
      compile,
      existingItems: [synced],
      createdAt
    });

    expect(compile).not.toHaveBeenCalled();
    expect(resumed.items[0]).toEqual(synced);
    expect(resumed.summary).toMatchObject({ syncedCount: 1, pendingCount: 0 });
  });

  it("creates a new revision for changed content without overwriting existing items", async () => {
    const file = fileEntry("experiments/changed.chemd");
    const initial = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "old source",
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "old-snapshot" } }),
      createdAt
    });
    const oldPending = initial.items[0];
    const changed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "new source",
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "new-snapshot" } }),
      existingItems: [oldPending],
      createdAt
    });
    const newPending = changed.items[0];

    expect(changed.items).toHaveLength(2);
    expect(newPending.status).toBe("pending");
    expect(newPending.documentHash).not.toBe(oldPending.documentHash);
    expect(newPending.revisionHash).not.toBe(oldPending.revisionHash);
    expect(newPending.queueId).not.toBe(oldPending.queueId);
    expect(changed.items[1]).toEqual(oldPending);
    expect(changed.summary).toMatchObject({ pendingCount: 2, totalCount: 2 });
  });

  it("keeps failed items over the retry limit failed instead of making them pending", async () => {
    const file = fileEntry("experiments/exhausted.chemd");
    const failedRun = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "exhausted source",
      compile: () => {
        throw new Error("compile failed");
      },
      createdAt
    });
    const exhausted: WorkspaceIngestQueueItem = {
      ...failedRun.items[0],
      failureCount: 3,
      errorSummary: "compile failed three times"
    };
    const compile = vi.fn(() => ({ status: "ok" }));
    const resumed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "exhausted source",
      compile,
      existingItems: [exhausted],
      maxRetryFailures: 3,
      createdAt
    });

    expect(compile).not.toHaveBeenCalled();
    expect(resumed.items).toEqual([exhausted]);
    expect(resumed.summary).toMatchObject({ failedCount: 1, retryableCount: 0 });
    expect(resumed.summary.errors[0]).toMatchObject({ failureCount: 3, retryable: false });
  });
});

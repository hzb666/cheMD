import { describe, expect, it } from "vitest";

import type { LocalSyncEntryResult, LocalSyncState } from "./desktop-types";
import {
  buildLocalSyncResultRows,
  sanitizeLocalSyncMessage
} from "./desktop-local-sync-view";

const syncTarget = {
  kind: "external" as const,
  source: "CHEMD_POSTGRES_DATABASE_URL",
  host: "127.0.0.1",
  database: "chemd",
  user: "chemd",
  ssl: "disable",
  timeoutMs: 5000,
  pool: "external"
};

const syncEntry = (
  overrides: Partial<LocalSyncEntryResult> = {}
): LocalSyncEntryResult => ({
  localId: "local-runtime-snapshot:workspace:revision:snapshot",
  idempotencyKey: "local-runtime-snapshot:fnv1a:12345678",
  syncStatus: "synced",
  graphSnapshotId: "graph-snapshot-1",
  ...overrides
});

const syncState = (
  entries: LocalSyncEntryResult[],
  overrides: Partial<LocalSyncState> = {}
): LocalSyncState => ({
  state: "success",
  message: "Synced pending Local Store entries to Postgres.",
  summary: {
    syncedCount: entries.filter((entry) => entry.syncStatus === "synced" && !entry.error).length,
    failedCount: entries.filter((entry) => entry.syncStatus === "failed" || entry.error).length,
    skippedCount: entries.filter((entry) => entry.syncStatus === "pending" && !entry.error).length,
    target: syncTarget,
    entries,
    failedEntries: entries.filter((entry) => entry.syncStatus === "failed" || entry.error)
  },
  ...overrides
});

describe("desktop local sync result view model", () => {
  it("preserves all sync entries while keeping failed entries compatible", () => {
    const entries = [
      syncEntry({ localId: "local-synced", syncStatus: "synced" }),
      syncEntry({ localId: "local-failed", syncStatus: "failed", error: "target is down" }),
      syncEntry({ localId: "local-skipped", syncStatus: "pending", graphSnapshotId: undefined })
    ];
    const state = syncState(entries);

    expect(state.summary?.entries).toHaveLength(3);
    expect(state.summary?.failedEntries).toEqual([entries[1]]);
    expect(buildLocalSyncResultRows(state).map((row) => row.localId)).toEqual([
      "local-synced",
      "local-failed",
      "local-skipped"
    ]);
  });

  it("maps a synced entry into a synced display row", () => {
    const [row] = buildLocalSyncResultRows(syncState([
      syncEntry({
        localId: "local-synced",
        idempotencyKey: "idem-synced",
        syncStatus: "synced",
        graphSnapshotId: "graph-synced"
      })
    ]));

    expect(row).toMatchObject({
      status: "synced",
      category: "synced",
      localId: "local-synced",
      graphSnapshotId: "graph-synced",
      idempotencyKey: "idem-synced",
      message: "Synced to Postgres.",
      error: null,
      conflict: false,
      retryable: false,
      failed: false,
      synced: true,
      skipped: false
    });
  });

  it("redacts and truncates failed row errors", () => {
    const [row] = buildLocalSyncResultRows(syncState([
      syncEntry({
        syncStatus: "failed",
        error: "postgresql://chemd:secret@127.0.0.1:5432/chemd password=hunter2 api_key=sk-test token=abc failed with a very long detail"
      })
    ]), { maxMessageLength: 90 });

    expect(row.status).toBe("failed");
    expect(row.category).toBe("retryable");
    expect(row.retryable).toBe(true);
    expect(row.error).toContain("[redacted database url]");
    expect(row.error).toContain("password=[redacted]");
    expect(row.error).not.toContain("secret@127.0.0.1");
    expect(row.error).not.toContain("hunter2");
    expect(row.error).not.toContain("sk-test");
    expect(row.error?.length).toBeLessThanOrEqual(90);
  });

  it("classifies conservative conflict messages without a backend status", () => {
    const [row] = buildLocalSyncResultRows(syncState([
      syncEntry({
        syncStatus: "failed",
        error: "Base revision conflict: stale revision rev-old cannot overwrite rev-new"
      })
    ]));

    expect(row).toMatchObject({
      status: "failed",
      category: "failed",
      conflict: true,
      retryable: false,
      failed: true
    });
  });

  it("handles empty summary safely", () => {
    expect(buildLocalSyncResultRows({
      state: "idle",
      message: "Sync Pending shares only pending outbox entries after Postgres readiness checks pass.",
      summary: null
    })).toEqual([]);
    expect(sanitizeLocalSyncMessage("  \n  ")).toBeNull();
  });
});

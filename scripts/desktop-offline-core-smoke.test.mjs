import assert from "node:assert/strict";
import test from "node:test";

import { runDesktopOfflineCoreSmoke } from "./desktop-runtime-smoke.mjs";
import { runDesktopOfflineCoreSmokeCli } from "./desktop-offline-core-smoke.mjs";

const createLogger = () => {
  const lines = [];
  return {
    lines,
    log(message) {
      lines.push(String(message));
    },
    error(message) {
      lines.push(String(message));
    }
  };
};

const writeOfflineFiles = ({ files, snapshotPath, outboxPath }) => {
  files.set(snapshotPath, JSON.stringify({ localId: "local:offline-core" }));
  files.set(outboxPath, JSON.stringify({ entries: [{ syncStatus: "pending" }] }));
};

test("runDesktopOfflineCoreSmoke passes without database or managed runtime env", async () => {
  const files = new Map();
  const logger = createLogger();
  let smokeEnv;

  const result = await runDesktopOfflineCoreSmoke({
    rootDir: "D:\\repo",
    envLoader: () => ({
      loadedFiles: [".env.local"],
      env: {
        CHEMD_POSTGRES_DATABASE_URL: "postgres://chemd:super-secret@localhost:15432/chemd",
        DATABASE_URL: "postgres://fallback:other-secret@localhost:15432/chemd",
        CHEMD_MANAGED_POSTGRES_BIN_DIR: "D:\\pg\\bin",
        CHEMD_MANAGED_POSTGRES_HOME: "D:\\managed",
        CHEMD_DESKTOP_OFFLINE_SMOKE_DIR: "offline-core"
      }
    }),
    desktopCheck: () => ({
      ok: true,
      checks: [{ name: "desktop scripts", status: "pass", detail: "ok" }]
    }),
    offlineLocalStoreSmoke: async ({ env }) => {
      smokeEnv = env;
      const snapshotPath = "D:\\repo\\offline-core\\runtime-snapshot.json";
      const outboxPath = "D:\\repo\\offline-core\\outbox.json";
      writeOfflineFiles({ files, snapshotPath, outboxPath });
      return {
        status: "offline-local-passed",
        storeRoot: "D:\\repo\\offline-core",
        snapshotPath,
        outboxPath,
        localId: "local:offline-core",
        idempotencyKey: "idem:offline-core",
        graphSnapshotId: "rev-offline-core::graph",
        experimentId: "exp-offline-core",
        outboxPendingCount: 1,
        outboxFailedCount: 0
      };
    },
    fileExists: (filePath) => files.has(filePath),
    logger
  });

  assert.equal(result.status, "offline-core-passed");
  assert.equal(result.database.status, "skipped");
  assert.equal(result.database.reason, "offline-core-no-postgres-runtime");
  assert.equal(result.offline.outboxPendingCount, 1);
  assert.equal(smokeEnv.CHEMD_POSTGRES_DATABASE_URL, undefined);
  assert.equal(smokeEnv.DATABASE_URL, undefined);
  assert.equal(smokeEnv.CHEMD_MANAGED_POSTGRES_BIN_DIR, undefined);
  assert.equal(smokeEnv.CHEMD_MANAGED_POSTGRES_HOME, undefined);
  assert.equal(smokeEnv.CHEMD_DESKTOP_OFFLINE_SMOKE_DIR, "offline-core");

  const output = logger.lines.join("\n");
  assert.match(output, /SKIP database persistence/u);
  assert.match(output, /Chemd desktop offline core smoke passed/u);
  assert.doesNotMatch(output, /super-secret/u);
  assert.doesNotMatch(output, /other-secret/u);
  assert.doesNotMatch(output, /postgres:\/\/chemd/u);
});

test("runDesktopOfflineCoreSmoke fails when local outbox has no pending entry", async () => {
  const files = new Map();

  await assert.rejects(
    () =>
      runDesktopOfflineCoreSmoke({
        rootDir: "D:\\repo",
        envLoader: () => ({ loadedFiles: [], env: {} }),
        desktopCheck: () => ({
          ok: true,
          checks: [{ name: "desktop scripts", status: "pass", detail: "ok" }]
        }),
        offlineLocalStoreSmoke: async () => {
          const snapshotPath = "D:\\repo\\offline-core\\runtime-snapshot.json";
          const outboxPath = "D:\\repo\\offline-core\\outbox.json";
          writeOfflineFiles({ files, snapshotPath, outboxPath });
          return {
            status: "offline-local-passed",
            storeRoot: "D:\\repo\\offline-core",
            snapshotPath,
            outboxPath,
            graphSnapshotId: "rev-offline-core::graph",
            outboxPendingCount: 0
          };
        },
        fileExists: (filePath) => files.has(filePath),
        logger: createLogger()
      }),
    /expected pending outbox entries/u
  );
});

test("runDesktopOfflineCoreSmokeCli maps failures to exit code 1", async () => {
  const logger = createLogger();
  const exitCode = await runDesktopOfflineCoreSmokeCli({
    runner: async () => {
      throw new Error("offline core failed");
    },
    logger
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.lines, ["offline core failed"]);
});

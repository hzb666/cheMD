import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMinimalDesktopRuntimePersistencePayload,
  checkDesktopRuntimePreconditions,
  discoverManagedPostgresBinaries,
  getPostgresDatabaseUrl,
  runDesktopOfflineLocalStoreSmoke,
  runDesktopReconnectOutboxSyncSmoke,
  runDesktopRuntimePersistenceSmoke,
  runDesktopRuntimeSmoke,
  runDesktopRuntimeSmokeCli,
  runDesktopTauriCommandSmoke,
  startManagedPostgresSmokeRuntime,
  summarizePostgresTarget
} from "./desktop-runtime-smoke.mjs";

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

const createPassingDesktopCheck = (calls) => () => {
  calls.push("desktop-check");
  return {
    ok: true,
    checks: [{ name: "desktop scripts", status: "pass", detail: "ok" }]
  };
};

test("getPostgresDatabaseUrl prefers Chemd env and falls back to DATABASE_URL", () => {
  assert.equal(
    getPostgresDatabaseUrl({
      CHEMD_POSTGRES_DATABASE_URL: " postgres://chemd ",
      DATABASE_URL: "postgres://fallback"
    }),
    "postgres://chemd"
  );
  assert.equal(
    getPostgresDatabaseUrl({ DATABASE_URL: " postgres://fallback " }),
    "postgres://fallback"
  );
});

test("summarizePostgresTarget redacts passwords and avoids full URL logging", () => {
  const summary = summarizePostgresTarget(
    "postgres://chemd:super-secret@localhost:15432/chemd"
  );

  assert.match(summary, /host=localhost/u);
  assert.match(summary, /database=chemd/u);
  assert.match(summary, /password=\[REDACTED\]/u);
  assert.doesNotMatch(summary, /super-secret/u);
  assert.doesNotMatch(summary, /postgres:\/\/chemd/u);
});

test("checkDesktopRuntimePreconditions reports missing dist as warn only", () => {
  const files = new Map([
    [
      "D:\\repo\\apps\\desktop\\package.json",
      JSON.stringify({
        scripts: {
          build: "vite build",
          typecheck: "tsc",
          "tauri:build": "tauri build"
        }
      })
    ],
    [
      "D:\\repo\\apps\\desktop\\src-tauri\\tauri.conf.json",
      JSON.stringify({ build: { frontendDist: "../dist" } })
    ]
  ]);

  const result = checkDesktopRuntimePreconditions({
    rootDir: "D:\\repo",
    fileExists: (filePath) => files.has(filePath),
    readTextFile: (filePath) => files.get(filePath)
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.find((check) => check.name === "desktop dist artifact")?.status,
    "warn"
  );
});

test("discoverManagedPostgresBinaries finds dev override binaries", () => {
  const files = new Set([
    "D:\\pg\\bin\\initdb.exe",
    "D:\\pg\\bin\\psql.exe",
    "D:\\pg\\bin\\postgres.exe"
  ]);

  const result = discoverManagedPostgresBinaries({
    env: { CHEMD_MANAGED_POSTGRES_BIN_DIR: "D:\\pg\\bin" },
    fileExists: (filePath) => files.has(filePath)
  });

  assert.equal(result.available, true);
  assert.equal(result.binaries.source, "CHEMD_MANAGED_POSTGRES_BIN_DIR");
  assert.match(result.binaries.postgres, /postgres\.exe$/u);
});

test("runDesktopRuntimeSmoke skips without external env or managed binaries", async () => {
  const calls = [];
  const logger = createLogger();

  const result = await runDesktopRuntimeSmoke({
    rootDir: "D:\\repo",
    envLoader: () => {
      calls.push("env-loader");
      return { env: {}, loadedFiles: [] };
    },
    desktopCheck: createPassingDesktopCheck(calls),
    withClient: async () => {
      throw new Error("must not connect");
    },
    managedPostgres: async () => {
      calls.push("managed-postgres");
      return {
        status: "unavailable",
        reason: "Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries"
      };
    },
    offlineLocalStoreSmoke: async () => {
      calls.push("offline-local-store");
      return {
        status: "offline-local-passed",
        storeRoot: "D:\\offline\\local-store",
        snapshotPath: "D:\\offline\\local-store\\runtime-snapshot.json",
        outboxPath: "D:\\offline\\local-store\\outbox.json",
        localId: "local-runtime-snapshot:test",
        idempotencyKey: "local-runtime-snapshot:fnv1a:test",
        graphSnapshotId: "graph-offline",
        experimentId: "exp-offline",
        outboxPendingCount: 1
      };
    },
    logger
  });

  assert.deepEqual(calls, ["env-loader", "desktop-check", "managed-postgres", "offline-local-store"]);
  assert.deepEqual(result, {
    status: "offline-local-passed",
    database: {
      status: "skipped",
      reason: "missing-postgres-runtime",
      detail: "Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries"
    },
    offline: {
      status: "offline-local-passed",
      storeRoot: "D:\\offline\\local-store",
      snapshotPath: "D:\\offline\\local-store\\runtime-snapshot.json",
      outboxPath: "D:\\offline\\local-store\\outbox.json",
      localId: "local-runtime-snapshot:test",
      idempotencyKey: "local-runtime-snapshot:fnv1a:test",
      graphSnapshotId: "graph-offline",
      experimentId: "exp-offline",
      outboxPendingCount: 1
    }
  });
  assert.match(logger.lines.join("\n"), /SKIP database persistence/u);
  assert.match(logger.lines.join("\n"), /Chemd desktop local offline smoke passed/u);
});

test("buildMinimalDesktopRuntimePersistencePayload mirrors Tauri command payload shape", () => {
  const payload = buildMinimalDesktopRuntimePersistencePayload({
    revisionId: "rev-runtime-shape"
  });

  assert.deepEqual(Object.keys(payload).sort(), [
    "agentRuns",
    "agentToolCalls",
    "citationCandidates",
    "createdAt",
    "edges",
    "graphSnapshot",
    "metadata",
    "nodes",
    "patchProposals"
  ]);
  assert.equal(payload.graphSnapshot.sourceRevisionIds[0], "rev-runtime-shape");
  assert.equal(payload.nodes.length, 2);
  assert.equal(payload.edges.length, 1);
  assert.equal(payload.citationCandidates.length, 1);
  assert.equal(payload.agentRuns.length, 1);
  assert.equal(payload.agentToolCalls.length, 1);
  assert.equal(payload.patchProposals.length, 1);
  assert.equal(typeof payload.metadata.sourceText, "string");
  assert.equal(payload.metadata.workspaceId, "desktop-runtime-smoke-workspace");
});

test("runDesktopOfflineLocalStoreSmoke writes local snapshot and pending outbox", async () => {
  const files = new Map();
  const madeDirs = [];

  const result = await runDesktopOfflineLocalStoreSmoke({
    rootDir: "D:\\repo",
    env: {
      CHEMD_DESKTOP_OFFLINE_SMOKE_DIR: "offline-smoke"
    },
    fileExists: (filePath) => files.has(filePath),
    readTextFile: (filePath) => files.get(filePath),
    writeTextFile: (filePath, content) => {
      files.set(filePath, content);
    },
    makeDir: (dirPath) => {
      madeDirs.push(dirPath);
    },
    localStoreModules: async () => ({
      buildLocalRuntimeSnapshotInput: (payload) => ({
        localId: "local-runtime-snapshot:offline",
        idempotencyKey: "local-runtime-snapshot:fnv1a:offline",
        payload,
        metadata: {
          localStoreKind: "runtime_graph_rag_snapshot",
          graphSnapshotId: payload.graphSnapshot.graphSnapshotId
        },
        createdAt: payload.createdAt
      })
    })
  });

  assert.equal(result.status, "offline-local-passed");
  assert.equal(result.storeRoot, "D:\\repo\\offline-smoke");
  assert.equal(result.outboxPendingCount, 1);
  assert.equal(result.graphSnapshotId, "rev-desktop-offline-runtime-smoke::graph");
  assert.deepEqual(madeDirs, ["D:\\repo\\offline-smoke", "D:\\repo\\offline-smoke"]);

  const snapshot = JSON.parse(files.get("D:\\repo\\offline-smoke\\runtime-snapshot.json"));
  const outbox = JSON.parse(files.get("D:\\repo\\offline-smoke\\outbox.json"));
  assert.equal(snapshot.localId, "local-runtime-snapshot:offline");
  assert.equal(snapshot.payload.graphSnapshot.graphSnapshotId, "rev-desktop-offline-runtime-smoke::graph");
  assert.equal(outbox.entries.length, 1);
  assert.equal(outbox.entries[0].syncStatus, "pending");
  assert.equal(outbox.entries[0].failureCount, 0);
  assert.equal(outbox.entries[0].syncedAt, null);
});

test("runDesktopReconnectOutboxSyncSmoke syncs local outbox payload to shared schema", async () => {
  const files = new Map();
  const calls = [];

  const result = await runDesktopReconnectOutboxSyncSmoke({
    client: { query: async () => ({ rows: [] }) },
    rootDir: "D:\\repo",
    env: { CHEMD_DESKTOP_OFFLINE_SMOKE_DIR: "offline-smoke" },
    fileExists: (filePath) => files.has(filePath),
    readTextFile: (filePath) => files.get(filePath),
    writeTextFile: (filePath, content) => {
      files.set(filePath, content);
    },
    makeDir: () => {},
    now: () => "2026-05-12T00:00:01.000Z",
    localStoreModules: async () => ({
      buildLocalRuntimeSnapshotInput: (payload) => ({
        localId: "local-runtime-snapshot:reconnect",
        idempotencyKey: "local-runtime-snapshot:fnv1a:reconnect",
        payload,
        metadata: {
          localStoreKind: "runtime_graph_rag_snapshot",
          graphSnapshotId: payload.graphSnapshot.graphSnapshotId
        },
        createdAt: payload.createdAt
      })
    }),
    persistenceSmoke: async ({ payloadBuilder }) => {
      const payload = payloadBuilder();
      calls.push(payload.graphSnapshot.graphSnapshotId);
      return {
        experimentId: payload.graphSnapshot.experimentId,
        revisionId: payload.graphSnapshot.sourceRevisionIds[0],
        graphSnapshotId: payload.graphSnapshot.graphSnapshotId,
        counts: { graphSnapshots: 1, graphNodes: 2, graphEdges: 1 }
      };
    }
  });

  assert.equal(result.status, "script-level-reconnect-sync-passed");
  assert.equal(result.sync.syncedCount, 1);
  assert.equal(result.sync.outboxPendingCount, 0);
  assert.equal(result.sync.syncedAt, "2026-05-12T00:00:01.000Z");
  assert.deepEqual(calls, ["rev-desktop-reconnect-runtime-smoke::graph"]);

  const outbox = JSON.parse(files.get("D:\\repo\\offline-smoke\\outbox.json"));
  assert.equal(outbox.entries[0].syncStatus, "synced");
  assert.equal(outbox.entries[0].failureCount, 0);
  assert.equal(outbox.entries[0].lastError, null);
  assert.equal(outbox.entries[0].payload.graphSnapshot.graphSnapshotId, "rev-desktop-reconnect-runtime-smoke::graph");
});

test("runDesktopReconnectOutboxSyncSmoke keeps payload and marks failure", async () => {
  const files = new Map();

  await assert.rejects(
    () =>
      runDesktopReconnectOutboxSyncSmoke({
        client: { query: async () => ({ rows: [] }) },
        rootDir: "D:\\repo",
        env: { CHEMD_DESKTOP_OFFLINE_SMOKE_DIR: "offline-smoke" },
        fileExists: (filePath) => files.has(filePath),
        readTextFile: (filePath) => files.get(filePath),
        writeTextFile: (filePath, content) => {
          files.set(filePath, content);
        },
        makeDir: () => {},
        now: () => "2026-05-12T00:00:02.000Z",
        localStoreModules: async () => ({
          buildLocalRuntimeSnapshotInput: (payload) => ({
            localId: "local-runtime-snapshot:failed",
            idempotencyKey: "local-runtime-snapshot:fnv1a:failed",
            payload,
            metadata: { localStoreKind: "runtime_graph_rag_snapshot" },
            createdAt: payload.createdAt
          })
        }),
        persistenceSmoke: async () => {
          throw new Error("database unavailable");
        }
      }),
    /database unavailable/u
  );

  const outbox = JSON.parse(files.get("D:\\repo\\offline-smoke\\outbox.json"));
  assert.equal(outbox.entries[0].syncStatus, "failed");
  assert.equal(outbox.entries[0].failureCount, 1);
  assert.equal(outbox.entries[0].lastError, "database unavailable");
  assert.equal(outbox.entries[0].syncedAt, null);
  assert.equal(outbox.entries[0].payload.graphSnapshot.graphSnapshotId, "rev-desktop-reconnect-runtime-smoke::graph");
});

test("runDesktopTauriCommandSmoke skips when no command runner is configured", async () => {
  const result = await runDesktopTauriCommandSmoke({
    env: {},
    localStoreModules: async () => {
      throw new Error("must not load local store modules without runner");
    }
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "unsupported-tauri-command-runner");
  assert.match(result.detail, /CHEMD_DESKTOP_TAURI_COMMAND_RUNNER/u);
});

test("runDesktopTauriCommandSmoke fails with the command name and original error", async () => {
  const calls = [];

  await assert.rejects(
    () =>
      runDesktopTauriCommandSmoke({
        commandRunner: async ({ command }) => {
          calls.push(command);
          if (command === "start_managed_postgres") {
            throw new Error("managed start failed");
          }
          return { state: "ready" };
        }
      }),
    /Tauri command start_managed_postgres failed: managed start failed/u
  );

  assert.deepEqual(calls, ["initialize_managed_postgres", "start_managed_postgres"]);
});

test("runDesktopTauriCommandSmoke validates managed command order and pending to synced outbox", async () => {
  const calls = [];
  let saved;

  const result = await runDesktopTauriCommandSmoke({
    postgresMode: "managed",
    revisionId: "rev-tauri-command-smoke",
    localStoreModules: async () => ({
      buildLocalRuntimeSnapshotInput: (payload) => ({
        localId: `local:${payload.graphSnapshot.graphSnapshotId}`,
        idempotencyKey: `idem:${payload.graphSnapshot.graphSnapshotId}`,
        payload,
        metadata: {
          localStoreKind: "runtime_graph_rag_snapshot",
          graphSnapshotId: payload.graphSnapshot.graphSnapshotId
        },
        createdAt: payload.createdAt
      })
    }),
    commandRunner: async ({ command, input }) => {
      calls.push({ command, input });
      if (command === "read_postgres_status") {
        return { state: "ready", configured: true, schemaReady: true };
      }
      if (command === "read_local_store_status") {
        return { state: "ready", available: true, outboxPendingCount: 0, outboxFailedCount: 0 };
      }
      if (command === "save_local_runtime_snapshot") {
        saved = {
          localId: input.localId,
          idempotencyKey: input.idempotencyKey,
          syncStatus: "pending",
          createdAt: input.createdAt,
          outboxPendingCount: 1
        };
        return saved;
      }
      if (command === "list_local_outbox" && input.syncStatus === "pending") {
        return [{ ...saved, syncStatus: "pending", failureCount: 0, lastError: null, syncedAt: null }];
      }
      if (command === "sync_local_outbox_to_postgres") {
        return {
          state: "ready",
          syncedCount: 1,
          failedCount: 0,
          skippedCount: 0,
          entries: [{ localId: saved.localId, idempotencyKey: saved.idempotencyKey, syncStatus: "synced" }]
        };
      }
      if (command === "list_local_outbox" && input.syncStatus === "synced") {
        return [{ ...saved, syncStatus: "synced", failureCount: 0, lastError: null, syncedAt: "2026-05-12T00:00:01.000Z" }];
      }
      return { state: "ready" };
    }
  });

  assert.equal(result.status, "tauri-command-passed");
  assert.equal(result.graphSnapshotId, "rev-tauri-command-smoke::graph");
  assert.equal(result.sync.syncedCount, 1);
  assert.equal(result.pendingEntry.syncStatus, "pending");
  assert.equal(result.syncedEntry.syncStatus, "synced");
  assert.deepEqual(
    calls.map((call) => call.command),
    [
      "initialize_managed_postgres",
      "start_managed_postgres",
      "migrate_managed_postgres",
      "read_postgres_status",
      "read_local_store_status",
      "save_local_runtime_snapshot",
      "list_local_outbox",
      "sync_local_outbox_to_postgres",
      "list_local_outbox"
    ]
  );
  assert.equal(
    calls.find((call) => call.command === "save_local_runtime_snapshot").input.payload.graphSnapshot.graphSnapshotId,
    "rev-tauri-command-smoke::graph"
  );
});

test("runDesktopRuntimeSmoke redacts env while running smoke in order", async () => {
  const calls = [];
  const logger = createLogger();
  let managedFallbackCalled = false;

  const result = await runDesktopRuntimeSmoke({
    rootDir: "D:\\repo",
    envLoader: () => {
      calls.push("env-loader");
      return {
        env: {
          CHEMD_POSTGRES_DATABASE_URL:
            "postgres://chemd:super-secret@localhost:15432/chemd"
        },
        loadedFiles: [".env.local"]
      };
    },
    desktopCheck: createPassingDesktopCheck(calls),
    withClient: async ({ operation }) => {
      calls.push("with-client");
      return operation({ query: async () => ({ rows: [] }) });
    },
    managedPostgres: async () => {
      managedFallbackCalled = true;
      throw new Error("external DB must take priority");
    },
    offlineLocalStoreSmoke: async () => {
      throw new Error("offline local store must not run when external DB is configured");
    },
    postgresSmoke: async () => {
      calls.push("postgres-smoke");
      return {
        experimentId: "exp-1",
        revisionId: "rev-1",
        compileRunId: "rev-1::compile",
        ragChunks: 1,
        firstChunkId: "chunk-1"
      };
    },
    reconnectSyncSmoke: async ({ persistenceSmoke }) => {
      calls.push("reconnect-sync-smoke");
      const persistence = await persistenceSmoke({
        client: { query: async () => ({ rows: [] }) }
      });
      return {
        status: "script-level-reconnect-sync-passed",
        sync: {
          syncedCount: 1,
          failedCount: 0,
          skippedCount: 0,
          outboxPendingCount: 0,
          outboxFailedCount: 0,
          syncedAt: "2026-05-12T00:00:00.000Z"
        },
        persistence
      };
    },
    persistenceSmoke: async () => {
      calls.push("persistence-smoke");
      return {
        experimentId: "exp-runtime",
        revisionId: "rev-runtime",
        graphSnapshotId: "graph-runtime",
        counts: { graphSnapshots: 1 }
      };
    },
    logger
  });

  assert.equal(managedFallbackCalled, false);
  assert.deepEqual(calls, [
    "env-loader",
    "desktop-check",
    "with-client",
    "postgres-smoke",
    "reconnect-sync-smoke",
    "persistence-smoke"
  ]);
  assert.equal(result.status, "passed");
  assert.equal(result.result.reconnectSync.status, "script-level-reconnect-sync-passed");
  assert.equal(result.result.reconnectSync.sync.syncedCount, 1);
  const output = logger.lines.join("\n");
  assert.doesNotMatch(output, /super-secret/u);
  assert.doesNotMatch(output, /postgres:\/\/chemd/u);
  assert.match(output, /host=localhost/u);
  assert.match(output, /runtime graph: graph-runtime/u);
  assert.match(output, /reconnect outbox sync: synced=1, pending=0, failed=0/u);
  assert.match(output, /SKIP Tauri command smoke/u);
});

test("runDesktopRuntimeSmoke starts managed fallback and cleans it after success", async () => {
  const calls = [];
  const logger = createLogger();

  const result = await runDesktopRuntimeSmoke({
    rootDir: "D:\\repo",
    envLoader: () => {
      calls.push("env-loader");
      return { env: {}, loadedFiles: [] };
    },
    desktopCheck: createPassingDesktopCheck(calls),
    managedPostgres: async () => {
      calls.push("managed-postgres");
      return {
        status: "started",
        env: {
          CHEMD_POSTGRES_DATABASE_URL:
            "postgres://chemd_desktop:managed-secret@127.0.0.1:16432/chemd_desktop"
        },
        summary:
          "source=CHEMD_MANAGED_POSTGRES_BIN_DIR, host=127.0.0.1, port=16432, database=chemd_desktop, user=chemd_desktop, password=[REDACTED]",
        cleanup: async () => {
          calls.push("managed-cleanup");
        }
      };
    },
    withClient: async ({ env, operation }) => {
      calls.push(`with-client:${env.CHEMD_POSTGRES_DATABASE_URL.includes("managed-secret")}`);
      return operation({ query: async () => ({ rows: [] }) });
    },
    offlineLocalStoreSmoke: async () => {
      throw new Error("offline local store must not run when managed DB starts");
    },
    postgresSmoke: async () => {
      calls.push("postgres-smoke");
      return {
        experimentId: "exp-1",
        revisionId: "rev-1",
        compileRunId: "rev-1::compile",
        ragChunks: 1,
        firstChunkId: "chunk-1"
      };
    },
    reconnectSyncSmoke: async ({ persistenceSmoke }) => {
      calls.push("reconnect-sync-smoke");
      const persistence = await persistenceSmoke({
        client: { query: async () => ({ rows: [] }) }
      });
      return {
        sync: {
          syncedCount: 1,
          failedCount: 0,
          skippedCount: 0,
          outboxPendingCount: 0,
          outboxFailedCount: 0
        },
        persistence
      };
    },
    persistenceSmoke: async () => {
      calls.push("persistence-smoke");
      return {
        experimentId: "exp-runtime",
        revisionId: "rev-runtime",
        graphSnapshotId: "graph-runtime",
        counts: { graphSnapshots: 1 }
      };
    },
    logger
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(calls, [
    "env-loader",
    "desktop-check",
    "managed-postgres",
    "with-client:true",
    "postgres-smoke",
    "reconnect-sync-smoke",
    "persistence-smoke",
    "managed-cleanup"
  ]);
  const output = logger.lines.join("\n");
  assert.doesNotMatch(output, /managed-secret/u);
  assert.match(output, /Managed PostgreSQL target/u);
});

test("runDesktopRuntimeSmoke cleans managed fallback after database failure", async () => {
  const calls = [];

  await assert.rejects(
    () =>
      runDesktopRuntimeSmoke({
        envLoader: () => ({ env: {}, loadedFiles: [] }),
        desktopCheck: createPassingDesktopCheck(calls),
        managedPostgres: async () => ({
          status: "started",
          env: { CHEMD_POSTGRES_DATABASE_URL: "postgres://user:secret@127.0.0.1/db" },
          summary: "host=127.0.0.1, password=[REDACTED]",
          cleanup: async () => {
            calls.push("managed-cleanup");
          }
        }),
        withClient: async () => {
          throw new Error("managed database unavailable");
        },
        logger: createLogger()
      }),
    /managed database unavailable/u
  );

  assert.deepEqual(calls, ["desktop-check", "managed-cleanup"]);
});

test("startManagedPostgresSmokeRuntime stops owned process on startup failure", async () => {
  const calls = [];
  const files = new Set([
    "D:\\pg\\bin\\initdb.exe",
    "D:\\pg\\bin\\psql.exe",
    "D:\\pg\\bin\\postgres.exe"
  ]);
  const child = {
    pid: 42,
    exitCode: null,
    signalCode: null,
    kill() {
      calls.push("kill");
      this.exitCode = 1;
    },
    once(_event, handler) {
      handler();
    }
  };

  await assert.rejects(
    () =>
      startManagedPostgresSmokeRuntime({
        rootDir: "D:\\repo",
        env: {
          CHEMD_MANAGED_POSTGRES_BIN_DIR: "D:\\pg\\bin",
          CHEMD_MANAGED_POSTGRES_HOME: "D:\\managed"
        },
        fileExists: (filePath) => files.has(filePath),
        readTextFile: () => {
          throw new Error("unexpected read");
        },
        writeTextFile: (filePath) => {
          calls.push(`write:${filePath.endsWith("managed-postgres.pid.json") ? "pid" : "file"}`);
        },
        makeDir: () => {},
        removeFile: (filePath) => {
          calls.push(`remove:${filePath.endsWith("managed-postgres.pid.json") ? "pid" : "file"}`);
        },
        runCommand: async () => {
          calls.push("initdb");
        },
        spawnProcess: () => {
          calls.push("spawn");
          return child;
        },
        getPort: async () => 16432,
        runtimeModules: async () => ({
          createPostgresRuntimeClient: () => ({
            query: async () => {
              throw new Error("not ready");
            },
            close: async () => {}
          })
        }),
        readinessAttempts: 1
      }),
    /Managed Postgres did not accept connections/u
  );

  assert.deepEqual(calls, [
    "write:file",
    "write:file",
    "initdb",
    "remove:file",
    "spawn",
    "write:pid",
    "kill",
    "remove:pid"
  ]);
});

test("runDesktopRuntimePersistenceSmoke installs schema, writes payload, and verifies readback", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ count: 1 }] };
    }
  };
  const payload = buildMinimalDesktopRuntimePersistencePayload({
    revisionId: "rev-runtime-smoke"
  });

  const result = await runDesktopRuntimePersistenceSmoke({
    client,
    revisionId: "rev-runtime-smoke",
    graphModules: async () => ({
      getPostgresGraphRagExtensionSchemaSql: () => "CREATE TABLE graph_extension",
      persistPostgresRuntimeGraphRagRecords: async (_client, input) => {
        calls.push({ sql: "persist-runtime-graph-rag", values: [input.graphSnapshot.graphSnapshotId] });
        return { records: { graphSnapshotInput: { graphSnapshot: input.graphSnapshot } } };
      }
    }),
    payloadBuilder: () => payload,
    coreWriter: async ({ payload: input }) => {
      calls.push({ sql: "write-core-records", values: [input.graphSnapshot.experimentId] });
    },
    persistenceVerifier: async ({ payload: input }) => {
      calls.push({ sql: "verify-runtime-persistence", values: [input.graphSnapshot.graphSnapshotId] });
      return { graphSnapshots: 1, graphNodes: 2, graphEdges: 1 };
    }
  });

  assert.equal(result.graphSnapshotId, "rev-runtime-smoke::graph");
  assert.deepEqual(
    calls.map((call) => call.sql),
    [
      "CREATE TABLE graph_extension",
      "write-core-records",
      "persist-runtime-graph-rag",
      "verify-runtime-persistence"
    ]
  );
});

test("runDesktopRuntimeSmoke fails before database work on desktop preflight failure", async () => {
  await assert.rejects(
    () =>
      runDesktopRuntimeSmoke({
        envLoader: () => ({
          env: { DATABASE_URL: "postgres://chemd:secret@localhost/chemd" },
          loadedFiles: []
        }),
        desktopCheck: () => ({
          ok: false,
          checks: [{ name: "desktop scripts", status: "fail", detail: "missing build" }]
        }),
        withClient: async () => {
          throw new Error("must not connect");
        },
        logger: createLogger()
      }),
    /Desktop runtime preflight failed/u
  );
});

test("runDesktopRuntimeSmokeCli maps failures to exit code 1 and message", async () => {
  const logger = createLogger();
  const exitCode = await runDesktopRuntimeSmokeCli({
    runner: async () => {
      throw new Error("database unavailable");
    },
    logger
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.lines, ["database unavailable"]);
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDesktopDiagnosticsBundle,
  KNOWN_DESKTOP_COMMAND_NAMES,
  redactDiagnosticsValue,
  runDesktopDiagnosticsBundleCli
} from "./desktop-diagnostics-bundle.mjs";

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

const desktopPackage = JSON.stringify({
  name: "@chemd/desktop",
  version: "0.0.0",
  scripts: {
    build: "vite build",
    typecheck: "tsc",
    "tauri:build": "tauri build"
  }
});

const createFiles = (entries) =>
  new Map(
    Object.entries(entries).map(([filePath, content]) => [path.resolve(filePath), content])
  );

const createFileDeps = ({ files, directories = [], sizes = {} }) => {
  const directorySet = new Set(directories.map((directoryPath) => path.resolve(directoryPath)));
  return {
    fileExists: (filePath) =>
      files.has(path.resolve(filePath)) || directorySet.has(path.resolve(filePath)),
    readTextFile: (filePath) => files.get(path.resolve(filePath)),
    statFile: (filePath) => ({
      size: sizes[path.resolve(filePath)] ?? String(files.get(path.resolve(filePath)) ?? "").length,
      isDirectory: () => directorySet.has(path.resolve(filePath)),
      isFile: () => files.has(path.resolve(filePath))
    })
  };
};

const gitSkip = async () => ({ status: "skip", reason: "git unavailable in test" });

const passingDesktopCheck = () => ({
  ok: true,
  checks: [{ name: "desktop scripts", status: "pass", detail: "ok" }]
});

test("redactDiagnosticsValue redacts secrets and database URLs", () => {
  assert.equal(redactDiagnosticsValue("API_KEY", "sk-test"), "[REDACTED]");
  assert.equal(redactDiagnosticsValue("password", "super-secret"), "[REDACTED]");
  assert.equal(
    redactDiagnosticsValue("detail", "postgres://chemd:secret@localhost:5432/db"),
    "postgres://chemd:%5BREDACTED%5D@localhost:5432/db"
  );
});

test("known desktop commands include reaction intelligence, sync, and RAG surfaces", () => {
  assert.deepEqual(
    [
      "read_embedding_provider_status",
      "create_embedding_vector",
      "query_postgres_rag",
      "backfill_postgres_rag_embeddings",
      "run_reaction_intelligence_worker",
      "save_local_reaction_intelligence_artifact",
      "list_local_reaction_intelligence_artifacts",
      "sync_local_outbox_to_postgres",
      "list_postgres_profiles",
      "save_postgres_profile",
      "activate_postgres_profile",
      "delete_postgres_profile"
    ].filter((command) => KNOWN_DESKTOP_COMMAND_NAMES.includes(command)),
    [
      "read_embedding_provider_status",
      "create_embedding_vector",
      "query_postgres_rag",
      "backfill_postgres_rag_embeddings",
      "run_reaction_intelligence_worker",
      "save_local_reaction_intelligence_artifact",
      "list_local_reaction_intelligence_artifacts",
      "sync_local_outbox_to_postgres",
      "list_postgres_profiles",
      "save_postgres_profile",
      "activate_postgres_profile",
      "delete_postgres_profile"
    ]
  );
});

test("buildDesktopDiagnosticsBundle redacts selected env values", async () => {
  const rootDir = "D:\\repo";
  const files = createFiles({
    "D:\\repo\\apps\\desktop\\package.json": desktopPackage,
    "D:\\repo\\apps\\desktop\\dist\\index.html": "<!doctype html>"
  });
  const bundle = await buildDesktopDiagnosticsBundle({
    rootDir,
    env: {
      CHEMD_POSTGRES_DATABASE_URL: "postgres://chemd:super-secret@localhost:5432/chemd",
      DATABASE_URL: "postgres://fallback:secret-token@localhost:5432/fallback",
      CHEMD_DESKTOP_TAURI_COMMAND_RUNNER_ARGS: "[\"--token\",\"secret-token\"]"
    },
    ...createFileDeps({ files }),
    artifactFinder: () => ({ releaseExe: undefined, msiInstallers: [], nsisInstallers: [] }),
    desktopCheck: passingDesktopCheck,
    releasePreflight: async () => ({ status: "skipped", reason: "test", checks: [] }),
    gitCommitResolver: gitSkip
  });

  const serialized = JSON.stringify(bundle);
  assert.doesNotMatch(serialized, /super-secret/u);
  assert.doesNotMatch(serialized, /secret-token/u);
  assert.doesNotMatch(serialized, /postgres:\/\/chemd/u);
  assert.equal(
    bundle.environment.signals.find((signal) => signal.name === "CHEMD_POSTGRES_DATABASE_URL").value,
    "[REDACTED]"
  );
});

test("buildDesktopDiagnosticsBundle marks missing dist and artifacts as skip", async () => {
  const rootDir = "D:\\repo";
  const files = createFiles({
    "D:\\repo\\apps\\desktop\\package.json": desktopPackage
  });
  const bundle = await buildDesktopDiagnosticsBundle({
    rootDir,
    env: {},
    ...createFileDeps({ files }),
    artifactFinder: () => ({ releaseExe: undefined, msiInstallers: [], nsisInstallers: [] }),
    desktopCheck: passingDesktopCheck,
    releasePreflight: async () => ({ status: "skipped", reason: "desktop-dist-missing", checks: [] }),
    gitCommitResolver: gitSkip
  });

  assert.equal(bundle.desktop.distIndex.status, "skip");
  assert.equal(bundle.desktop.releaseArtifacts.releaseExe.status, "skip");
  assert.equal(bundle.desktop.releaseArtifacts.msiInstallers.status, "skip");
  assert.equal(bundle.desktop.releaseArtifacts.nsisInstallers.status, "skip");
  assert.equal(bundle.runtime.releasePreflight.status, "skipped");
  assert.equal(bundle.supportContext.offlineSmoke.status, "skip");
  assert.equal(bundle.supportContext.classifications.releasePreflight, "skip");
  assert.equal(
    bundle.supportContext.classificationTool.contexts.find((entry) => entry.name === "artifact").status,
    "SKIP"
  );
  assert.equal(
    bundle.supportContext.classificationTool.contexts.find((entry) => entry.name === "sync").status,
    "SKIP"
  );
});

test("buildDesktopDiagnosticsBundle summarizes existing release artifacts as pass", async () => {
  const rootDir = "D:\\repo";
  const files = createFiles({
    "D:\\repo\\apps\\desktop\\package.json": desktopPackage,
    "D:\\repo\\apps\\desktop\\dist\\index.html": "<!doctype html>"
  });
  const bundle = await buildDesktopDiagnosticsBundle({
    rootDir,
    env: {},
    ...createFileDeps({ files }),
    artifactFinder: () => ({
      releaseExe: {
        path: "D:\\repo\\apps\\desktop\\src-tauri\\target\\release\\chemd-desktop.exe",
        size: 1024
      },
      msiInstallers: [
        {
          path: "D:\\repo\\apps\\desktop\\src-tauri\\target\\release\\bundle\\msi\\Chemd.msi",
          size: 2048
        }
      ],
      nsisInstallers: [
        {
          path: "D:\\repo\\apps\\desktop\\src-tauri\\target\\release\\bundle\\nsis\\Chemd Setup.exe",
          size: 4096
        }
      ]
    }),
    desktopCheck: passingDesktopCheck,
    releasePreflight: async () => ({ status: "passed", reason: "installer-artifacts-ready", checks: [] }),
    gitCommitResolver: async () => ({ status: "pass", commit: "abc123" })
  });

  assert.equal(bundle.desktop.releaseArtifacts.releaseExe.status, "pass");
  assert.equal(bundle.desktop.releaseArtifacts.msiInstallers.status, "pass");
  assert.equal(bundle.desktop.releaseArtifacts.msiInstallers.count, 1);
  assert.equal(bundle.desktop.releaseArtifacts.nsisInstallers.status, "pass");
  assert.equal(bundle.git.commit, "abc123");
});

test("buildDesktopDiagnosticsBundle summarizes offline support context without payload secrets", async () => {
  const rootDir = "D:\\repo";
  const offlineDir = "D:\\repo\\.chemd\\offline-smoke";
  const files = createFiles({
    "D:\\repo\\apps\\desktop\\package.json": desktopPackage,
    "D:\\repo\\apps\\desktop\\dist\\index.html": "<!doctype html>",
    "D:\\repo\\.chemd\\offline-smoke\\runtime-snapshot.json": JSON.stringify({
      savedAt: "2026-05-13T00:00:00.000Z",
      localId: "local-secret-id",
      idempotencyKey: "secret-idempotency-key",
      payload: { databaseUrl: "postgres://chemd:secret@localhost:5432/chemd" },
      metadata: { workspace: "demo", providerToken: "secret-token" }
    }),
    "D:\\repo\\.chemd\\offline-smoke\\outbox.json": JSON.stringify({
      entries: [
        { syncStatus: "pending", payload: { token: "secret-token" } },
        { syncStatus: "failed", lastError: "password=secret" }
      ]
    })
  });
  const bundle = await buildDesktopDiagnosticsBundle({
    rootDir,
    env: { CHEMD_DESKTOP_OFFLINE_SMOKE_DIR: offlineDir },
    ...createFileDeps({ files, directories: [offlineDir] }),
    artifactFinder: () => ({ releaseExe: undefined, msiInstallers: [], nsisInstallers: [] }),
    desktopCheck: passingDesktopCheck,
    releasePreflight: async () => ({ status: "skipped", reason: "desktop-dist-missing", checks: [] }),
    gitCommitResolver: gitSkip
  });

  const serialized = JSON.stringify(bundle);
  assert.equal(bundle.supportContext.offlineSmoke.status, "pass");
  assert.equal(bundle.supportContext.offlineSmoke.files.runtimeSnapshot.status, "pass");
  assert.equal(bundle.supportContext.offlineSmoke.files.outbox.summary.entryCount, 2);
  assert.equal(bundle.supportContext.offlineSmoke.files.outbox.summary.statusCounts.pending, 1);
  assert.equal(bundle.supportContext.notRun.find((entry) => entry.name === "provider").status, "skip");
  assert.deepEqual(bundle.supportContext.classificationTool.statusValues, ["PASS", "SKIP", "BLOCKED"]);
  assert.deepEqual(
    bundle.supportContext.classificationTool.contexts.map((entry) => entry.name),
    ["provider", "model", "artifact", "sync"]
  );
  assert.ok(
    bundle.supportContext.supportCommands.some((entry) =>
      entry.command.includes("run_reaction_intelligence_worker")
    )
  );
  assert.ok(
    bundle.supportContext.supportCommands.some((entry) =>
      entry.command.includes("save_local_reaction_intelligence_artifact")
    )
  );
  assert.doesNotMatch(serialized, /secret-token|secret-idempotency-key|local-secret-id/u);
  assert.doesNotMatch(serialized, /postgres:\/\/chemd/u);
});

test("buildDesktopDiagnosticsBundle skips oversized offline smoke files without reading them", async () => {
  const rootDir = "D:\\repo";
  const offlineDir = "D:\\repo\\.chemd\\offline-smoke";
  const runtimeSnapshotPath = "D:\\repo\\.chemd\\offline-smoke\\runtime-snapshot.json";
  const files = createFiles({
    "D:\\repo\\apps\\desktop\\package.json": desktopPackage,
    [runtimeSnapshotPath]: ""
  });
  const deps = createFileDeps({
    files,
    directories: [offlineDir],
    sizes: { [path.resolve(runtimeSnapshotPath)]: 100_000 }
  });
  const bundle = await buildDesktopDiagnosticsBundle({
    rootDir,
    env: { CHEMD_DESKTOP_OFFLINE_SMOKE_DIR: offlineDir },
    ...deps,
    readTextFile: (filePath, encoding) => {
      assert.notEqual(path.resolve(filePath), path.resolve(runtimeSnapshotPath));
      return deps.readTextFile(filePath, encoding);
    },
    artifactFinder: () => ({ releaseExe: undefined, msiInstallers: [], nsisInstallers: [] }),
    desktopCheck: passingDesktopCheck,
    releasePreflight: async () => ({ status: "skipped", reason: "desktop-dist-missing", checks: [] }),
    gitCommitResolver: gitSkip
  });

  assert.equal(bundle.supportContext.offlineSmoke.files.runtimeSnapshot.status, "skip");
  assert.equal(bundle.supportContext.offlineSmoke.files.runtimeSnapshot.reason, "file-too-large");
});

test("runDesktopDiagnosticsBundleCli writes JSON to --output path", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "chemd-diagnostics-test-"));
  const outputPath = path.join(tempDir, "diagnostics.json");
  const logger = createLogger();

  try {
    const exitCode = await runDesktopDiagnosticsBundleCli({
      argv: ["--output", outputPath],
      logger,
      runOptions: {
        bundleBuilder: async () => ({
          schemaVersion: 1,
          generatedAt: "2026-05-13T00:00:00.000Z",
          desktop: { package: { version: "0.0.0" } }
        })
      }
    });

    assert.equal(exitCode, 0);
    assert.match(logger.lines.join("\n"), /Desktop diagnostics bundle written:/u);
    const written = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.desktop.package.version, "0.0.0");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

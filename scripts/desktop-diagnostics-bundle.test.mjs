import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDesktopDiagnosticsBundle,
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

const createFileDeps = ({ files, sizes = {} }) => ({
  fileExists: (filePath) => files.has(path.resolve(filePath)),
  readTextFile: (filePath) => files.get(path.resolve(filePath)),
  statFile: (filePath) => ({
    size: sizes[path.resolve(filePath)] ?? String(files.get(path.resolve(filePath)) ?? "").length,
    isFile: () => true
  })
});

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

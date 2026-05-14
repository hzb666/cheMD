import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDesktopReleaseReadinessReport,
  computeOverallStatus,
  runDesktopReleaseReadinessCli
} from "./desktop-release-readiness.mjs";

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

const runtimePass = () => ({
  ok: true,
  checks: [{ name: "desktop scripts", status: "pass", detail: "ok" }]
});

const releasePass = async () => ({
  status: "passed",
  reason: "installer-artifacts-ready",
  releaseExePath: "D:\\repo\\apps\\desktop\\src-tauri\\target\\release\\chemd-desktop.exe",
  checks: [{ name: "release exe artifact", status: "pass", detail: "ok" }]
});

const diagnosticsPass = async () => ({
  schemaVersion: 1,
  generatedAt: "2026-05-13T00:00:00.000Z",
  supportContext: { offlineSmoke: { status: "skip" } }
});

const buildReport = (overrides = {}) =>
  buildDesktopReleaseReadinessReport({
    rootDir: "D:\\repo",
    now: () => new Date("2026-05-13T00:00:00.000Z"),
    desktopCheck: runtimePass,
    releasePreflight: releasePass,
    diagnosticsBuilder: diagnosticsPass,
    ...overrides
  });

test("computeOverallStatus covers pass, skip, and blocked aggregation", () => {
  assert.equal(computeOverallStatus([{ status: "pass" }, { status: "pass" }]), "pass");
  assert.equal(computeOverallStatus([{ status: "pass" }, { status: "skip" }]), "skip");
  assert.equal(computeOverallStatus([{ status: "skip" }, { status: "blocked" }]), "blocked");
});

test("buildDesktopReleaseReadinessReport keeps production smoke not-run as skip", async () => {
  const report = await buildReport();

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.overallStatus, "skip");
  assert.equal(report.cleanMachineInstallerSmoke.status, "skip");
  assert.equal(report.cleanMachineInstallerSmoke.result, "not-run");
  assert.equal(report.realNetwork.status, "skip");
  assert.equal(report.realNetwork.result, "not-run");
  assert.equal(report.boundaries.startsGui, false);
  assert.equal(report.boundaries.opensNetwork, false);
  assert.equal(report.boundaries.readsDotEnv, false);
  const degradation = report.checks.find((check) => check.name === "enhancedCapabilityDegradation");
  assert.equal(degradation.status, "pass");
  assert.equal(degradation.result, "covered");
  assert.equal(degradation.capabilities.length, 5);
});

test("buildDesktopReleaseReadinessReport reports blocked offline checks", async () => {
  const report = await buildReport({
    releasePreflight: async () => ({
      status: "blocked",
      reason: "release-artifact-empty",
      checks: [{ name: "MSI installer artifact", status: "blocked", detail: "empty" }]
    })
  });

  assert.equal(report.overallStatus, "blocked");
  assert.equal(report.overall.reason, "one-or-more-offline-checks-blocked");
  assert.equal(report.checks.find((check) => check.name === "offlineReleasePreflight").status, "blocked");
  assert.equal(report.checks.find((check) => check.name === "enhancedCapabilityDegradation").status, "pass");
});

test("buildDesktopReleaseReadinessReport redacts sensitive values", async () => {
  const report = await buildReport({
    desktopCheck: () => ({
      ok: false,
      checks: [
        {
          name: "desktop scripts",
          status: "fail",
          detail: "postgres://chemd:super-secret@localhost:5432/db?token=secret-token"
        }
      ]
    }),
    diagnosticsBuilder: async () => ({
      schemaVersion: 1,
      generatedAt: "2026-05-13T00:00:00.000Z",
      supportContext: {
        offlineSmoke: { status: "pass", databaseUrl: "postgres://user:secret@localhost/db" }
      }
    })
  });

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /super-secret|secret-token|postgres:\/\/chemd/u);
  assert.equal(report.checks[0].status, "blocked");
});

test("runDesktopReleaseReadinessCli writes --output JSON", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "chemd-release-readiness-test-"));
  const outputPath = path.join(tempDir, "readiness.json");
  const logger = createLogger();

  try {
    const exitCode = await runDesktopReleaseReadinessCli({
      argv: ["--output", outputPath],
      logger,
      runOptions: { reportBuilder: buildReport }
    });

    assert.equal(exitCode, 0);
    assert.match(logger.lines.join("\n"), /Release readiness JSON written:/u);
    const written = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(written.overallStatus, "skip");
    assert.equal(written.cleanMachineInstallerSmoke.result, "not-run");
    assert.equal(
      written.checks.find((check) => check.name === "enhancedCapabilityDegradation").status,
      "pass"
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runDesktopReleaseReadinessCli prints JSON for --json", async () => {
  const logger = createLogger();
  const exitCode = await runDesktopReleaseReadinessCli({
    argv: ["--json"],
    logger,
    runOptions: { reportBuilder: buildReport }
  });

  assert.equal(exitCode, 0);
  const printed = JSON.parse(logger.lines.join("\n"));
  assert.equal(printed.overallStatus, "skip");
  assert.equal(printed.realNetwork.status, "skip");
  assert.match(
    JSON.stringify(printed.checks.find((check) => check.name === "enhancedCapabilityDegradation")),
    /connectedRag/u
  );
});

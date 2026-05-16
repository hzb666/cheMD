import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inspectPostgresBinDir,
  POSTGRES_BUNDLE_MANIFEST_FILE_NAME,
  resolvePostgresBinDir,
  stagePostgresBinaries,
  verifyStagedPostgresBinaries
} from "./desktop-postgres-bundle.mjs";

const tempDir = () => mkdtempSync(path.join(os.tmpdir(), "chemd-postgres-bundle-"));

const touch = (filePath) => {
  writeFileSync(filePath, "");
};

const withTempDir = (fn) => {
  const root = tempDir();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const createPostgresBin = (binDir, names = ["initdb", "psql", "postgres"]) => {
  mkdirSync(binDir, { recursive: true });
  for (const name of names) {
    touch(path.join(binDir, name));
  }
};

test("resolvePostgresBinDir accepts a distribution directory with bin", () =>
  withTempDir((root) => {
    const dist = path.join(root, "pgsql");
    const bin = path.join(dist, "bin");
    createPostgresBin(bin);

    const result = resolvePostgresBinDir({ sourceDir: dist });

    assert.equal(result.ok, true);
    assert.equal(result.binDir, bin);
    assert.equal(result.sourceRootDir, dist);
    assert.equal(result.binOnly, false);
  }));

test("resolvePostgresBinDir accepts a source that is already bin", () =>
  withTempDir((root) => {
    createPostgresBin(root, ["initdb", "psql", "pg_ctl"]);

    const result = resolvePostgresBinDir({ sourceDir: root });

    assert.equal(result.ok, true);
    assert.equal(result.binDir, root);
    assert.equal(result.sourceRootDir, root);
    assert.equal(result.binOnly, true);
    assert.match(result.binaries.pg_ctl, /pg_ctl$/u);
  }));

test("inspectPostgresBinDir supports Windows .exe suffixes", () =>
  withTempDir((root) => {
    createPostgresBin(root, ["initdb.exe", "psql.exe", "postgres.exe"]);

    const result = inspectPostgresBinDir({ binDir: root, platform: "win32" });

    assert.equal(result.ok, true);
    assert.match(result.binaries.initdb, /initdb\.exe$/u);
    assert.match(result.binaries.postgres, /postgres\.exe$/u);
  }));

test("inspectPostgresBinDir fails when required binaries are missing", () =>
  withTempDir((root) => {
    createPostgresBin(root, ["initdb"]);

    const result = inspectPostgresBinDir({ binDir: root });

    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["psql", "postgres or pg_ctl"]);
  }));

test("verifyStagedPostgresBinaries passes for a staged target without a manifest", () =>
  withTempDir((root) => {
    createPostgresBin(root);

    const result = verifyStagedPostgresBinaries({ targetBinDir: root });

    assert.equal(result.ok, true);
    assert.equal(result.manifest, null);
    assert.match(result.verificationSummary, /manifest proof unavailable/u);
    assert.match(result.binaries.psql, /psql$/u);
  }));

test("verifyStagedPostgresBinaries fails when staged binaries are missing", () =>
  withTempDir((root) => {
    createPostgresBin(root, ["initdb"]);

    assert.throws(
      () => verifyStagedPostgresBinaries({ targetBinDir: root }),
      /Staged PostgreSQL binaries are missing: psql, postgres or pg_ctl/u
    );
  }));

test("stagePostgresBinaries writes a full distribution manifest", () =>
  withTempDir((root) => {
    const sourceRoot = path.join(root, "source");
    const sourceBin = path.join(sourceRoot, "bin");
    const sourceShare = path.join(sourceRoot, "share");
    const targetResource = path.join(root, "target", "postgres");
    const targetBin = path.join(targetResource, "bin");
    createPostgresBin(sourceBin);
    mkdirSync(sourceShare, { recursive: true });
    touch(path.join(sourceShare, "postgres.bki"));

    const result = stagePostgresBinaries({
      sourceDir: sourceRoot,
      targetResourceDir: targetResource,
      targetBinDir: targetBin,
      now: () => new Date("2026-05-12T00:00:00.000Z")
    });

    assert.equal(result.sourceRootDir, sourceRoot);
    assert.equal(result.sourceBinDir, sourceBin);
    assert.equal(result.targetResourceDir, targetResource);
    assert.equal(result.targetBinDir, targetBin);
    assert.equal(result.binOnly, false);
    assert.match(result.binaries.initdb, /target[\\/]postgres[\\/]bin[\\/]initdb$/u);

    const manifestPath = path.join(targetResource, POSTGRES_BUNDLE_MANIFEST_FILE_NAME);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(result.manifestPath, manifestPath);
    assert.equal(manifest.stagedAt, "2026-05-12T00:00:00.000Z");
    assert.equal(manifest.platform, process.platform);
    assert.equal(manifest.mode, "full-distribution");
    assert.equal(manifest.binOnly, false);
    assert.equal(manifest.sourceRoot, sourceRoot);
    assert.equal(manifest.sourceBin, sourceBin);
    assert.equal(manifest.targetBin, targetBin);
    assert.deepEqual(manifest.requiredBinaries, ["initdb", "psql", "postgres or pg_ctl"]);
    assert.match(manifest.verificationSummary, /complete offline distribution proof/u);
    assert.doesNotThrow(() => verifyStagedPostgresBinaries({ targetBinDir: targetBin }));
  }));

test("stagePostgresBinaries writes a bin-only development manifest", () =>
  withTempDir((root) => {
    const sourceBin = path.join(root, "source-bin");
    const targetResource = path.join(root, "target", "postgres");
    const targetBin = path.join(root, "target", "postgres", "bin");
    createPostgresBin(sourceBin);

    const result = stagePostgresBinaries({
      sourceDir: sourceBin,
      targetResourceDir: targetResource,
      targetBinDir: targetBin
    });

    assert.equal(result.sourceRootDir, sourceBin);
    assert.equal(result.sourceBinDir, sourceBin);
    assert.equal(result.targetBinDir, targetBin);
    assert.equal(result.binOnly, true);
    assert.equal(result.manifest.binOnly, true);
    assert.equal(result.manifest.mode, "bin-only-development");
    assert.match(result.manifest.verificationSummary, /not a complete offline distribution proof/u);
    assert.match(result.binaries.psql, /target[\\/]postgres[\\/]bin[\\/]psql$/u);
  }));

test("verifyStagedPostgresBinaries reads the staged manifest summary", () =>
  withTempDir((root) => {
    const sourceRoot = path.join(root, "source");
    const targetResource = path.join(root, "target", "postgres");
    const targetBin = path.join(targetResource, "bin");
    createPostgresBin(path.join(sourceRoot, "bin"));

    const staged = stagePostgresBinaries({
      sourceDir: sourceRoot,
      targetResourceDir: targetResource,
      targetBinDir: targetBin
    });
    const verified = verifyStagedPostgresBinaries({
      targetResourceDir: targetResource,
      targetBinDir: targetBin,
      requireFullDistribution: true
    });

    assert.equal(verified.manifestPath, staged.manifestPath);
    assert.equal(verified.manifest.sourceRoot, sourceRoot);
    assert.equal(verified.verificationSummary, staged.manifest.verificationSummary);
  }));

test("requireFullDistribution rejects bin-only staging and verification", () =>
  withTempDir((root) => {
    const sourceBin = path.join(root, "source-bin");
    const targetResource = path.join(root, "target", "postgres");
    const targetBin = path.join(targetResource, "bin");
    createPostgresBin(sourceBin);

    assert.throws(
      () =>
        stagePostgresBinaries({
          sourceDir: sourceBin,
          targetResourceDir: targetResource,
          targetBinDir: targetBin,
          requireFullDistribution: true
        }),
      /Full PostgreSQL distribution proof is required/u
    );

    stagePostgresBinaries({
      sourceDir: sourceBin,
      targetResourceDir: targetResource,
      targetBinDir: targetBin
    });
    assert.throws(
      () =>
        verifyStagedPostgresBinaries({
          targetResourceDir: targetResource,
          targetBinDir: targetBin,
          requireFullDistribution: true
        }),
      /Full PostgreSQL distribution proof is required/u
    );
  }));

test("stagePostgresBinaries fails when required source binaries are missing", () =>
  withTempDir((root) => {
    const sourceRoot = path.join(root, "source");
    const sourceBin = path.join(sourceRoot, "bin");
    createPostgresBin(sourceBin, ["initdb", "postgres"]);

    assert.throws(
      () => stagePostgresBinaries({ sourceDir: sourceRoot }),
      /PostgreSQL binaries not found/u
    );
  }));

const SHARED_SCHEMA_SIGNATURE = [
  {
    table: "chemd_reaction_graph_snapshots",
    columns: ["graph_snapshot_id text PRIMARY KEY", "source_revision_ids jsonb NOT NULL"]
  },
  {
    table: "chemd_reaction_graph_nodes",
    columns: ["node_id text PRIMARY KEY", "graph_snapshot_id text NOT NULL", "source_range jsonb NOT NULL"]
  },
  {
    table: "chemd_reaction_graph_edges",
    columns: ["edge_id text PRIMARY KEY", "from_node_id text NOT NULL", "evidence jsonb NOT NULL"]
  },
  {
    table: "chemd_rag_chunk_citations",
    columns: ["PRIMARY KEY (revision_id, chunk_id)", "quality jsonb NOT NULL"]
  },
  {
    table: "chemd_agent_runs",
    columns: ["agent_run_id text PRIMARY KEY", "audit_timeline jsonb NOT NULL DEFAULT '[]'::jsonb"]
  },
  {
    table: "chemd_agent_tool_calls",
    columns: ["tool_call_id text PRIMARY KEY", "agent_run_id text NOT NULL", "input jsonb NOT NULL"]
  },
  {
    table: "chemd_patch_proposals",
    columns: ["patch_proposal_id text PRIMARY KEY", "patch jsonb NOT NULL", "validation_result jsonb"]
  }
];

const assertSharedSchemaSignature = ({ sql, label }) => {
  for (const { table, columns } of SHARED_SCHEMA_SIGNATURE) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${label} missing ${table}`);
    for (const column of columns) {
      assert.ok(sql.includes(column), `${label} missing ${column}`);
    }
  }
};

test("managed Postgres migration keeps external shared Graph/RAG/Agent schema signature", () => {
  const externalSchema = readFileSync(
    path.resolve("packages/storage-postgres/src/graph-rag-schema.ts"),
    "utf8"
  );
  const managedSchema = readFileSync(
    path.resolve("apps/desktop/src-tauri/src/managed_postgres_migrations.rs"),
    "utf8"
  );

  assertSharedSchemaSignature({ sql: externalSchema, label: "external schema" });
  assertSharedSchemaSignature({ sql: managedSchema, label: "managed schema" });
  assert.match(managedSchema, /ALTER TABLE IF EXISTS chemd_agent_runs/u);
  assert.doesNotMatch(managedSchema, /CREATE TABLE IF NOT EXISTS desktop_/u);
  assert.doesNotMatch(managedSchema, /CREATE TABLE IF NOT EXISTS chemd_desktop_/u);
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inspectPostgresBinDir,
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

test("verifyStagedPostgresBinaries passes for a staged target", () =>
  withTempDir((root) => {
    createPostgresBin(root);

    const result = verifyStagedPostgresBinaries({ targetBinDir: root });

    assert.equal(result.ok, true);
    assert.match(result.binaries.psql, /psql$/u);
  }));

test("stagePostgresBinaries copies a full distribution into the resource path", () =>
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
      targetBinDir: targetBin
    });

    assert.equal(result.sourceRootDir, sourceRoot);
    assert.equal(result.sourceBinDir, sourceBin);
    assert.equal(result.targetResourceDir, targetResource);
    assert.equal(result.targetBinDir, targetBin);
    assert.match(result.binaries.initdb, /target[\\/]postgres[\\/]bin[\\/]initdb$/u);
    assert.doesNotThrow(() => verifyStagedPostgresBinaries({ targetBinDir: targetBin }));
  }));

test("stagePostgresBinaries still accepts a bin-only development source", () =>
  withTempDir((root) => {
    const sourceBin = path.join(root, "source-bin");
    const targetBin = path.join(root, "target", "postgres", "bin");
    createPostgresBin(sourceBin);

    const result = stagePostgresBinaries({ sourceDir: sourceBin, targetBinDir: targetBin });

    assert.equal(result.sourceRootDir, sourceBin);
    assert.equal(result.sourceBinDir, sourceBin);
    assert.equal(result.targetBinDir, targetBin);
    assert.match(result.binaries.psql, /target[\\/]postgres[\\/]bin[\\/]psql$/u);
  }));

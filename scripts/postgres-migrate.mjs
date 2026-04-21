#!/usr/bin/env node

import process from "node:process";

import {
  formatLoadedEnvFiles,
  loadPostgresEnv,
  runPostgresMigration,
  withPostgresRuntimeClient
} from "./postgres-tools.mjs";

const main = async () => {
  const { env, loadedFiles } = loadPostgresEnv();
  const result = await withPostgresRuntimeClient({
    env,
    operation: (client) => runPostgresMigration({ client })
  });

  console.log("Chemd PostgreSQL schema installed.");
  console.log(`Loaded env files: ${formatLoadedEnvFiles(loadedFiles)}`);
  console.log(`pgvector extension: ${result.vectorInstalled ? "ok" : "missing"}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

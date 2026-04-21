#!/usr/bin/env node

import process from "node:process";

import {
  formatLoadedEnvFiles,
  loadPostgresEnv,
  runPostgresSmoke,
  withPostgresRuntimeClient
} from "./postgres-tools.mjs";

const main = async () => {
  const { env, loadedFiles } = loadPostgresEnv();
  const result = await withPostgresRuntimeClient({
    env,
    operation: (client) => runPostgresSmoke({ client })
  });

  console.log("Chemd PostgreSQL smoke passed.");
  console.log(`Loaded env files: ${formatLoadedEnvFiles(loadedFiles)}`);
  console.log(`experiment: ${result.experimentId}`);
  console.log(`revision: ${result.revisionId}`);
  console.log(`compile run: ${result.compileRunId}`);
  console.log(`rag chunks: ${result.ragChunks}`);
  console.log(`first chunk: ${result.firstChunkId}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

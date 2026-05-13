import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const TS_LOADER_URL = new URL("../packages/cli/src/ts-loader.mjs", import.meta.url);

register(TS_LOADER_URL);

const ENV_FILE_PATHS = [
  ".env",
  ".env.local",
  path.join("apps", "web", ".env"),
  path.join("apps", "web", ".env.local")
];

const SMOKE_SOURCE = `---
id: exp-postgres-smoke
title: PostgreSQL smoke experiment
date: 2026-04-22
primary_result: res-main
---

:::chemd #mol-a
kind: molecule
name: ethanol
smiles: CCO
amount: 1 mmol
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-a
products: product
solvent: THF
temperature: 25 C
yield: 81%
:::

:::result #res-main
reaction: @rxn-main
status: success
yield: 80%
:::
`;

const stripQuotes = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const parseEnvContent = (content) => {
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match) {
      continue;
    }
    parsed[match[1]] = stripQuotes(match[2]);
  }
  return parsed;
};

export const loadPostgresEnv = ({
  rootDir = REPO_ROOT,
  env = process.env,
  filePaths = ENV_FILE_PATHS,
  fileExists = existsSync,
  readTextFile = readFileSync
} = {}) => {
  const merged = {};
  const loadedFiles = [];

  for (const relativePath of filePaths) {
    const filePath = path.resolve(rootDir, relativePath);
    if (!fileExists(filePath)) {
      continue;
    }
    Object.assign(merged, parseEnvContent(readTextFile(filePath, "utf8")));
    loadedFiles.push(relativePath);
  }

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return { env: merged, loadedFiles };
};

export const requirePostgresDatabaseUrl = (env) => {
  const value = env.CHEMD_POSTGRES_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required in the shell, "
        + "root .env.local, or apps/web/.env.local"
    );
  }
  return normalizePostgresDatabaseUrl(value);
};

export const normalizePostgresDatabaseUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("jdbc:")) {
    return trimmed;
  }
  const url = new URL(trimmed.slice("jdbc:".length));
  const user = url.searchParams.get("user");
  const password = url.searchParams.get("password");
  if (!url.username && user) {
    url.username = user;
    url.searchParams.delete("user");
  }
  if (!url.password && password) {
    url.password = password;
    url.searchParams.delete("password");
  }
  return url.toString();
};

const normalizePostgresRuntimeEnv = (env) => {
  const databaseUrl = requirePostgresDatabaseUrl(env);
  if (env.CHEMD_POSTGRES_DATABASE_URL?.trim()) {
    return { ...env, CHEMD_POSTGRES_DATABASE_URL: databaseUrl };
  }
  return { ...env, DATABASE_URL: databaseUrl };
};

export const loadRuntimeModules = async () => {
  const [{ createPostgresRuntimeClient }, { installChemdStorageSchema }, ingest] =
    await Promise.all([
      import("../apps/web/src/server/chem/postgres-client.ts"),
      import("../apps/web/src/server/chem/postgres-storage.ts"),
      import("../apps/web/src/server/chem/postgres-ingest-service.ts")
    ]);

  return {
    createPostgresRuntimeClient,
    installChemdStorageSchema,
    persistChemdExperiment: ingest.persistChemdExperiment
  };
};

export const withPostgresRuntimeClient = async ({
  env,
  operation,
  runtimeModules = loadRuntimeModules
}) => {
  const runtimeEnv = normalizePostgresRuntimeEnv(env);
  const { createPostgresRuntimeClient } = await runtimeModules();
  const client = createPostgresRuntimeClient({ env: runtimeEnv });
  try {
    return await operation(client);
  } finally {
    await client.close();
  }
};

const readFirstRow = (result) => {
  if (!result || !Array.isArray(result.rows)) {
    return undefined;
  }
  return result.rows[0];
};

const readCount = (result) => {
  const row = readFirstRow(result);
  const rawCount = row?.count ?? row?.chunk_count;
  const count = Number(rawCount);
  if (!Number.isFinite(count)) {
    throw new Error("PostgreSQL count query returned an invalid result");
  }
  return count;
};

export const runPostgresMigration = async ({
  client,
  runtimeModules = loadRuntimeModules
}) => {
  const { installChemdStorageSchema } = await runtimeModules();
  await installChemdStorageSchema(client);

  const extensionResult = await client.query(
    "SELECT extname FROM pg_extension WHERE extname = $1",
    ["vector"]
  );
  const vectorInstalled = readFirstRow(extensionResult)?.extname === "vector";
  if (!vectorInstalled) {
    throw new Error("pgvector extension is not installed after migration");
  }

  return { vectorInstalled };
};

export const runPostgresSmoke = async ({
  client,
  source = SMOKE_SOURCE,
  revisionId = `rev-postgres-smoke-${Date.now()}`,
  compileRunId = `${revisionId}::compile`,
  runtimeModules = loadRuntimeModules
}) => {
  const modules = await runtimeModules();
  const migration = await runPostgresMigration({
    client,
    runtimeModules: async () => modules
  });
  const result = await modules.persistChemdExperiment({
    client,
    source,
    revisionId,
    compileRunId,
    sourceKind: "chemd",
    sourceUri: "chemd://smoke/postgres"
  });

  const chunkCountResult = await client.query(
    "SELECT count(*)::int AS count FROM chemd_rag_chunks WHERE revision_id = $1",
    [revisionId]
  );
  const chunkCount = readCount(chunkCountResult);
  if (chunkCount <= 0) {
    throw new Error("PostgreSQL smoke did not persist any RAG chunks");
  }

  const firstChunkResult = await client.query(
    `SELECT chunk_id, text
     FROM chemd_rag_chunks
     WHERE revision_id = $1
     ORDER BY chunk_id
     LIMIT 1`,
    [revisionId]
  );
  const firstChunk = readFirstRow(firstChunkResult);
  if (!firstChunk?.chunk_id || typeof firstChunk.text !== "string") {
    throw new Error("PostgreSQL smoke could not read back a RAG chunk");
  }

  return {
    migration,
    experimentId: result.records.experiment.experimentId,
    revisionId,
    compileRunId,
    ragChunks: chunkCount,
    firstChunkId: firstChunk.chunk_id
  };
};

export const formatLoadedEnvFiles = (loadedFiles) =>
  loadedFiles.length > 0 ? loadedFiles.join(", ") : "(none)";

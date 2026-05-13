import assert from "node:assert/strict";
import test from "node:test";

import {
  loadPostgresEnv,
  normalizePostgresDatabaseUrl,
  parseEnvContent,
  requirePostgresDatabaseUrl,
  runPostgresMigration,
  runPostgresSmoke
} from "./postgres-tools.mjs";

const createFakeClient = () => {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("pg_extension")) {
        return { rows: [{ extname: "vector" }] };
      }
      if (sql.includes("count(*)::int")) {
        return { rows: [{ count: 1 }] };
      }
      if (sql.includes("FROM chemd_rag_chunks")) {
        return { rows: [{ chunk_id: "chunk-1", text: "stored chunk" }] };
      }
      return { rows: [], rowCount: 1 };
    }
  };
};

const createRuntimeModules = () => ({
  createPostgresRuntimeClient: () => {
    throw new Error("not used");
  },
  async installChemdStorageSchema(client) {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
  },
  async persistChemdExperiment() {
    return {
      records: {
        experiment: { experimentId: "exp-postgres-smoke" }
      }
    };
  }
});

test("parseEnvContent reads comments, exports, and quoted values", () => {
  assert.deepEqual(
    parseEnvContent([
      "# ignored",
      "CHEMD_POSTGRES_SSL=false",
      "export CHEMD_EMBEDDING_MODEL=\"text-embedding\"",
      "CHEMD_POSTGRES_POOL_MAX='4'"
    ].join("\n")),
    {
      CHEMD_POSTGRES_SSL: "false",
      CHEMD_EMBEDDING_MODEL: "text-embedding",
      CHEMD_POSTGRES_POOL_MAX: "4"
    }
  );
});

test("loadPostgresEnv merges root, app env files, and process env", () => {
  const files = new Map([
    ["D:\\repo\\.env.local", "CHEMD_POSTGRES_DATABASE_URL=postgres://root\n"],
    [
      "D:\\repo\\apps\\web\\.env.local",
      "CHEMD_POSTGRES_SSL=false\nCHEMD_EMBEDDING_DIM=384\n"
    ]
  ]);

  const result = loadPostgresEnv({
    rootDir: "D:\\repo",
    env: { CHEMD_EMBEDDING_DIM: "768" },
    filePaths: [".env.local", "apps/web/.env.local"],
    fileExists: (filePath) => files.has(filePath),
    readTextFile: (filePath) => files.get(filePath)
  });

  assert.deepEqual(result.loadedFiles, [".env.local", "apps/web/.env.local"]);
  assert.equal(result.env.CHEMD_POSTGRES_DATABASE_URL, "postgres://root");
  assert.equal(result.env.CHEMD_POSTGRES_SSL, "false");
  assert.equal(result.env.CHEMD_EMBEDDING_DIM, "768");
});

test("requirePostgresDatabaseUrl fails with a clear message", () => {
  assert.throws(
    () => requirePostgresDatabaseUrl({}),
    /CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required/u
  );
});

test("PostgreSQL env accepts JDBC URLs for runtime clients", () => {
  assert.equal(
    normalizePostgresDatabaseUrl(" jdbc:postgresql://103.24.219.156:5632/postgres "),
    "postgresql://103.24.219.156:5632/postgres"
  );
  assert.equal(
    requirePostgresDatabaseUrl({
      CHEMD_POSTGRES_DATABASE_URL:
        "jdbc:postgresql://103.24.219.156:5632/postgres?user=chemd&password=secret&sslmode=require"
    }),
    "postgresql://chemd:secret@103.24.219.156:5632/postgres?sslmode=require"
  );
});

test("runPostgresMigration installs schema and verifies pgvector", async () => {
  const client = createFakeClient();

  const result = await runPostgresMigration({
    client,
    runtimeModules: async () => createRuntimeModules()
  });

  assert.deepEqual(result, { vectorInstalled: true });
  assert.equal(client.calls[0].sql, "CREATE EXTENSION IF NOT EXISTS vector;");
  assert.match(client.calls[1].sql, /pg_extension/u);
});

test("runPostgresSmoke migrates, persists, and reads back a chunk", async () => {
  const client = createFakeClient();

  const result = await runPostgresSmoke({
    client,
    revisionId: "rev-test",
    runtimeModules: async () => createRuntimeModules()
  });

  assert.equal(result.experimentId, "exp-postgres-smoke");
  assert.equal(result.revisionId, "rev-test");
  assert.equal(result.ragChunks, 1);
  assert.equal(result.firstChunkId, "chunk-1");
});

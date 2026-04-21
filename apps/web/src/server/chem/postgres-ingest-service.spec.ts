import { describe, expect, it } from "vitest";

import type {
  PostgresPoolConstructor,
  PostgresPoolLike,
  PostgresRuntimeConfig
} from "./postgres-client";
import type { PostgresQueryClient } from "./postgres-storage";
import {
  persistChemdExperiment,
  persistChemdExperimentWithRuntime
} from "./postgres-ingest-service";
import type { EmbeddingProvider } from "./postgres-rag";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

const source = `---
id: exp-ingest-storage
title: Ingest Storage
date: 2026-04-22
primary_result: res-main
---

:::chemd #mol-a
kind: molecule
name: ethanol
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-a
products: product
solvent: THF
yield: 81%
:::

:::result #res-main
reaction: @rxn-main
status: success
yield: 80%
:::
`;

const createClient = (failOn?: string): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (failOn && sql.includes(failOn)) {
        throw new Error(`failed on ${failOn}`);
      }
      return { rows: [], rowCount: 1 };
    }
  };
};

const normalizedSql = (call: QueryCall): string => call.sql.replace(/\s+/g, " ").trim();

const createProvider = (): EmbeddingProvider & { texts: string[] } => {
  const texts: string[] = [];
  return {
    texts,
    async embed(text: string): Promise<readonly number[]> {
      texts.push(text);
      return [0.1, 0.2, 0.3];
    }
  };
};

class FakeRuntimePool implements PostgresPoolLike {
  static instances: FakeRuntimePool[] = [];

  readonly calls: QueryCall[] = [];
  closed = false;

  constructor(readonly config: PostgresRuntimeConfig) {
    FakeRuntimePool.instances.push(this);
  }

  async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
    this.calls.push({ sql, values });
    if (sql.includes("chemd_experiments")) {
      throw new Error("runtime write failed");
    }
    return { rows: [], rowCount: 1 };
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

const fakeRuntimePoolConstructor =
  FakeRuntimePool as unknown as PostgresPoolConstructor;

describe("postgres ingest service", () => {
  it("installs schema, persists records, and writes embeddings in order", async () => {
    const client = createClient();
    const provider = createProvider();

    const result = await persistChemdExperiment({
      client,
      source,
      revisionId: "rev-ingest-1",
      commitSha: "commit-ingest",
      installSchema: true,
      embedding: {
        provider,
        model: {
          embeddingModel: "test-embedding-3",
          embeddingDim: 3
        }
      }
    });

    const statements = client.calls.map(normalizedSql);
    expect(statements[0]).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(statements.findIndex((sql) => sql.includes("INSERT INTO chemd_rag_chunks"))).toBeLessThan(
      statements.findIndex((sql) => sql.includes("INSERT INTO chemd_embedding_models"))
    );
    expect(result.schemaInstalled).toBe(true);
    expect(result.records.revision).toMatchObject({
      revisionId: "rev-ingest-1",
      commitSha: "commit-ingest"
    });
    expect(provider.texts).toEqual(result.records.ragChunks.map((chunk) => chunk.text));
    expect(result.embeddings).toHaveLength(result.records.ragChunks.length);
  });

  it("skips schema and embedding work unless requested", async () => {
    const client = createClient();

    const result = await persistChemdExperiment({
      client,
      source,
      revisionId: "rev-ingest-no-embedding"
    });

    const statements = client.calls.map(normalizedSql);
    expect(statements.some((sql) => sql.includes("CREATE EXTENSION"))).toBe(false);
    expect(statements.some((sql) => sql.includes("chemd_embedding_models"))).toBe(false);
    expect(result.schemaInstalled).toBe(false);
    expect(result.embeddings).toEqual([]);
  });

  it("keeps persisted records separate from later embedding failures", async () => {
    const client = createClient("chemd_rag_chunk_embeddings");
    const provider = createProvider();

    await expect(persistChemdExperiment({
      client,
      source,
      revisionId: "rev-ingest-embedding-failure",
      embedding: {
        provider,
        model: {
          embeddingModel: "test-embedding-3",
          embeddingDim: 3
        }
      }
    })).rejects.toThrow("failed on chemd_rag_chunk_embeddings");

    const statements = client.calls.map(normalizedSql);
    expect(statements.filter((sql) => sql === "COMMIT")).toHaveLength(1);
    expect(statements).toContain("ROLLBACK");
    expect(statements.some((sql) => sql.includes("chemd_rag_chunks"))).toBe(true);
  });

  it("closes runtime clients when persistence fails", async () => {
    FakeRuntimePool.instances = [];

    await expect(persistChemdExperimentWithRuntime({
      runtime: {
        PoolConstructor: fakeRuntimePoolConstructor,
        env: {
          CHEMD_POSTGRES_DATABASE_URL: "postgres://localhost/chemd"
        }
      },
      source,
      revisionId: "rev-runtime-close"
    })).rejects.toThrow("runtime write failed");

    const pool = FakeRuntimePool.instances[0] as FakeRuntimePool;
    expect(pool.closed).toBe(true);
    expect(pool.config.connectionString).toBe("postgres://localhost/chemd");
  });
});

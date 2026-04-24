import { describe, expect, it } from "vitest";

import type {
  PostgresPoolConstructor,
  PostgresPoolConnectionLike,
  PostgresPoolLike,
  PostgresRuntimeConfig
} from "./postgres-client";
import { searchSimilarRagChunksWithRuntime } from "./postgres-rag-search-service";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

class FakeRuntimePool implements PostgresPoolLike {
  static instances: FakeRuntimePool[] = [];

  readonly calls: QueryCall[] = [];
  closed = false;

  constructor(readonly config: PostgresRuntimeConfig) {
    FakeRuntimePool.instances.push(this);
  }

  async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
    this.calls.push({ sql, values });
    if (sql.includes("chemd_rag_chunk_embeddings") && values?.includes("fail-model")) {
      throw new Error("rag search failed");
    }
    return {
      rows: [{
        chunk_id: "chunk-reaction",
        revision_id: "rev-1",
        experiment_id: "exp-1",
        chunk_type: "reaction_summary",
        source_entity_ids: ["rxn-1"],
        text: "reaction uses ethanol",
        metadata: { date: "2026-04-22" },
        distance: "0.14"
      }]
    };
  }

  async connect(): Promise<PostgresPoolConnectionLike> {
    return {
      query: async (sql: string, values?: readonly unknown[]): Promise<unknown> =>
        this.query(sql, values),
      release: () => undefined
    };
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

const fakeRuntimePoolConstructor =
  FakeRuntimePool as unknown as PostgresPoolConstructor;

describe("postgres RAG search runtime service", () => {
  it("searches with a runtime client and closes it", async () => {
    FakeRuntimePool.instances = [];

    const results = await searchSimilarRagChunksWithRuntime({
      runtime: {
        PoolConstructor: fakeRuntimePoolConstructor,
        env: {
          CHEMD_POSTGRES_DATABASE_URL: "postgres://localhost/chemd"
        }
      },
      embedding: [0.1, 0.2, 0.3],
      limit: 4,
      experimentId: "exp-1",
      model: {
        embeddingModel: "test-embedding-3",
        embeddingDim: 3
      }
    });

    const pool = FakeRuntimePool.instances[0] as FakeRuntimePool;
    expect(pool.closed).toBe(true);
    expect(pool.config.connectionString).toBe("postgres://localhost/chemd");
    expect(pool.calls[0]?.values).toEqual([
      "test-embedding-3",
      "[0.1,0.2,0.3]",
      "exp-1",
      4
    ]);
    expect(results[0]).toMatchObject({
      chunkId: "chunk-reaction",
      distance: 0.14
    });
  });

  it("closes runtime clients when search fails", async () => {
    FakeRuntimePool.instances = [];

    await expect(searchSimilarRagChunksWithRuntime({
      runtime: {
        PoolConstructor: fakeRuntimePoolConstructor,
        env: {
          CHEMD_POSTGRES_DATABASE_URL: "postgres://localhost/chemd"
        }
      },
      embedding: [0.1, 0.2, 0.3],
      model: {
        embeddingModel: "fail-model",
        embeddingDim: 3
      }
    })).rejects.toThrow("rag search failed");

    expect(FakeRuntimePool.instances[0]?.closed).toBe(true);
  });
});

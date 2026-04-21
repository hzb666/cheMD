import { describe, expect, it, vi } from "vitest";

import type {
  PostgresPoolConstructor,
  PostgresPoolLike,
  PostgresRuntimeConfig
} from "./postgres-client";
import { searchRagChunksByQuery } from "./postgres-rag-query-service";

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
    return {
      rows: [{
        chunk_id: "chunk-result",
        revision_id: "rev-1",
        experiment_id: "exp-1",
        chunk_type: "result_notes",
        source_entity_ids: ["res-1"],
        text: "result reports 80 percent yield",
        metadata: { date: "2026-04-22", result_ids: ["res-1"] },
        distance: "0.08"
      }]
    };
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

const fakeRuntimePoolConstructor =
  FakeRuntimePool as unknown as PostgresPoolConstructor;

const createEmbeddingFetch = (): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify({
    embedding: [0.1, 0.2, 0.3]
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  })) as unknown as typeof fetch;

describe("postgres RAG query service", () => {
  it("embeds query text, searches pgvector, and closes runtime client", async () => {
    FakeRuntimePool.instances = [];
    const fetchImpl = createEmbeddingFetch();

    const result = await searchRagChunksByQuery({
      query: "ethanol yield",
      limit: 3,
      experimentId: "exp-1",
      chunkTypes: ["result_notes"],
      embeddingRuntime: {
        fetchImpl,
        env: {
          CHEMD_EMBEDDING_BASE_URL: "https://embed.example",
          CHEMD_EMBEDDING_MODEL: "text-embedding-test",
          CHEMD_EMBEDDING_DIM: "3",
          CHEMD_EMBEDDING_DISTANCE_METRIC: "cosine"
        }
      },
      searchRuntime: {
        PoolConstructor: fakeRuntimePoolConstructor,
        env: {
          CHEMD_POSTGRES_DATABASE_URL: "postgres://localhost/chemd"
        }
      }
    });

    const pool = FakeRuntimePool.instances[0] as FakeRuntimePool;
    expect(pool.closed).toBe(true);
    expect(pool.calls[0]?.values).toEqual([
      "text-embedding-test",
      "[0.1,0.2,0.3]",
      "exp-1",
      ["result_notes"],
      3
    ]);
    expect(result).toMatchObject({
      query: "ethanol yield",
      model: {
        embeddingModel: "text-embedding-test",
        embeddingDim: 3,
        distanceMetric: "cosine"
      },
      results: [{
        chunkId: "chunk-result",
        distance: 0.08
      }]
    });
  });
});

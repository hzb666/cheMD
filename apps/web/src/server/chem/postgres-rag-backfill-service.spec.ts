import { describe, expect, it, vi } from "vitest";

import type {
  PostgresPoolConstructor,
  PostgresPoolLike,
  PostgresRuntimeConfig
} from "./postgres-client";
import {
  backfillRagChunkEmbeddings,
  backfillRagChunkEmbeddingsWithRuntime
} from "./postgres-rag-backfill-service";
import type { PostgresQueryClient } from "./postgres-storage";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

const createChunkRow = (overrides: Record<string, unknown> = {}) => ({
  chunk_id: "chunk-1",
  revision_id: "rev-1",
  experiment_id: "exp-1",
  chunk_type: "result_notes",
  source_entity_ids: ["res-1"],
  text: "result reports 80 percent yield",
  metadata: { result_ids: ["res-1"] },
  has_embedding: false,
  ...overrides
});

const createClient = (
  rows: Record<string, unknown>[]
): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (sql.includes("FROM chemd_rag_chunks")) {
        return { rows };
      }
      return { rows: [], rowCount: 1 };
    }
  };
};

const createProvider = () => ({
  embed: vi.fn(async () => [0.1, 0.2, 0.3])
});

describe("postgres RAG embedding backfill service", () => {
  it("selects chunks and writes embeddings through the pgvector helper", async () => {
    const client = createClient([createChunkRow()]);
    const provider = createProvider();

    const result = await backfillRagChunkEmbeddings({
      client,
      provider,
      revisionId: "rev-1",
      model: {
        embeddingModel: "text-embedding-test",
        embeddingDim: 3,
        distanceMetric: "cosine"
      }
    });

    expect(provider.embed).toHaveBeenCalledWith("result reports 80 percent yield");
    expect(client.calls[0]?.values).toEqual(["text-embedding-test", "rev-1", 100]);
    expect(client.calls.some((call) => call.sql === "BEGIN")).toBe(true);
    expect(client.calls.some((call) => call.sql.includes("chemd_rag_chunk_embeddings"))).toBe(
      true
    );
    expect(result).toMatchObject({
      selected: 1,
      embedded: 1,
      skippedExisting: 0
    });
  });

  it("skips existing embeddings unless overwriteExisting is enabled", async () => {
    const client = createClient([
      createChunkRow({ chunk_id: "chunk-existing", has_embedding: true }),
      createChunkRow({ chunk_id: "chunk-new", text: "new chunk" })
    ]);
    const provider = createProvider();

    const result = await backfillRagChunkEmbeddings({
      client,
      provider,
      limit: 2,
      model: {
        embeddingModel: "text-embedding-test",
        embeddingDim: 3
      }
    });

    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(provider.embed).toHaveBeenCalledWith("new chunk");
    expect(result).toMatchObject({
      selected: 2,
      embedded: 1,
      skippedExisting: 1
    });
  });

  it("returns an empty summary when no chunks are selected", async () => {
    const client = createClient([]);
    const provider = createProvider();

    const result = await backfillRagChunkEmbeddings({
      client,
      provider,
      experimentId: "exp-missing",
      model: {
        embeddingModel: "text-embedding-test",
        embeddingDim: 3
      }
    });

    expect(provider.embed).not.toHaveBeenCalled();
    expect(client.calls).toHaveLength(1);
    expect(result).toMatchObject({
      selected: 0,
      embedded: 0,
      skippedExisting: 0
    });
  });

  it("requires a bounded selection", async () => {
    const client = createClient([]);
    const provider = createProvider();

    await expect(backfillRagChunkEmbeddings({
      client,
      provider,
      model: {
        embeddingModel: "text-embedding-test",
        embeddingDim: 3
      }
    })).rejects.toThrow("revisionId, experimentId, or limit is required");
    expect(client.calls).toHaveLength(0);
  });
});

class FakeRuntimePool implements PostgresPoolLike {
  static instances: FakeRuntimePool[] = [];

  readonly calls: QueryCall[] = [];
  closed = false;

  constructor(readonly config: PostgresRuntimeConfig) {
    FakeRuntimePool.instances.push(this);
  }

  async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
    this.calls.push({ sql, values });
    if (sql.includes("FROM chemd_rag_chunks")) {
      return { rows: [createChunkRow()] };
    }
    return { rows: [], rowCount: 1 };
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

describe("postgres RAG embedding backfill runtime wrapper", () => {
  it("uses runtime provider and closes the PostgreSQL client", async () => {
    FakeRuntimePool.instances = [];

    const result = await backfillRagChunkEmbeddingsWithRuntime({
      revisionId: "rev-1",
      embeddingRuntime: {
        fetchImpl: createEmbeddingFetch(),
        env: {
          CHEMD_EMBEDDING_BASE_URL: "https://embed.example",
          CHEMD_EMBEDDING_MODEL: "text-embedding-test",
          CHEMD_EMBEDDING_DIM: "3"
        }
      },
      postgresRuntime: {
        PoolConstructor: fakeRuntimePoolConstructor,
        env: {
          CHEMD_POSTGRES_DATABASE_URL: "postgres://localhost/chemd"
        }
      }
    });

    const pool = FakeRuntimePool.instances[0] as FakeRuntimePool;
    expect(pool.closed).toBe(true);
    expect(result.embedded).toBe(1);
  });
});

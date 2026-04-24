import type { RagChunkRecord } from "@chemd/storage-postgres";
import { describe, expect, it } from "vitest";

import type { PostgresQueryClient } from "./postgres-storage";
import {
  searchSimilarRagChunks,
  writeRagChunkEmbeddings,
  type EmbeddingProvider
} from "./postgres-rag";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

const chunks: RagChunkRecord[] = [
  {
    chunkId: "chunk-reaction",
    revisionId: "rev-1",
    experimentId: "exp-1",
    chunkType: "reaction_summary",
    sourceEntityIds: ["rxn-1"],
    text: "reaction uses ethanol and THF",
    metadata: { date: "2026-04-22", reaction_ids: ["rxn-1"] }
  },
  {
    chunkId: "chunk-result",
    revisionId: "rev-1",
    experimentId: "exp-1",
    chunkType: "result_notes",
    sourceEntityIds: ["res-1"],
    text: "result reports 80 percent yield",
    metadata: { date: "2026-04-22", result_ids: ["res-1"], yield_percent: 80 }
  }
];

const createClient = (
  options: {
    failOn?: string;
    rows?: unknown[];
  } = {}
): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (options.failOn && sql.includes(options.failOn)) {
        throw new Error(`failed on ${options.failOn}`);
      }
      return { rows: options.rows ?? [], rowCount: 1 };
    }
  };
};

const createProvider = (vectors: readonly (readonly number[])[]): EmbeddingProvider & {
  texts: string[];
} => {
  const texts: string[] = [];
  let index = 0;
  return {
    texts,
    async embed(text: string): Promise<readonly number[]> {
      texts.push(text);
      const vector = vectors[index];
      index += 1;
      if (!vector) {
        throw new Error("missing test vector");
      }
      return vector;
    }
  };
};

const normalizedSql = (call: QueryCall): string => call.sql.replace(/\s+/g, " ").trim();

describe("postgres RAG pgvector helpers", () => {
  it("embeds and writes RAG chunk vectors after model metadata", async () => {
    const client = createClient();
    const provider = createProvider([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ]);

    const written = await writeRagChunkEmbeddings({
      client,
      provider,
      chunks,
      model: {
        embeddingModel: "test-embedding-3",
        embeddingDim: 3
      }
    });

    const statements = client.calls.map(normalizedSql);
    expect(provider.texts).toEqual(chunks.map((chunk) => chunk.text));
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.findIndex((sql) => sql.includes("chemd_embedding_models"))).toBeLessThan(
      statements.findIndex((sql) => sql.includes("chemd_rag_chunk_embeddings"))
    );
    expect(statements.filter((sql) => sql.includes("chemd_rag_chunk_embeddings"))).toHaveLength(2);
    expect(statements.some((sql) => sql.includes("$4::vector"))).toBe(true);
    expect(client.calls[2]?.values).toEqual([
      "rev-1",
      "chunk-reaction",
      "test-embedding-3",
      "[0.1,0.2,0.3]"
    ]);
    expect(written.map((embedding) => embedding.chunkId)).toEqual(["chunk-reaction", "chunk-result"]);
    expect(written.map((embedding) => embedding.revisionId)).toEqual(["rev-1", "rev-1"]);
  });

  it("rejects invalid dimensions before running SQL", async () => {
    const client = createClient();
    const provider = createProvider([[1, 2]]);

    await expect(writeRagChunkEmbeddings({
      client,
      provider,
      chunks: [chunks[0] as RagChunkRecord],
      model: {
        embeddingModel: "test-embedding-3",
        embeddingDim: 3
      }
    })).rejects.toThrow("embedding dimension 2 does not match 3");

    expect(client.calls).toHaveLength(0);
  });

  it("rolls back embedding writes when SQL fails", async () => {
    const client = createClient({ failOn: "chemd_rag_chunk_embeddings" });
    const provider = createProvider([[0.1, 0.2, 0.3]]);

    await expect(writeRagChunkEmbeddings({
      client,
      provider,
      chunks: [chunks[0] as RagChunkRecord],
      model: {
        embeddingModel: "test-embedding-3",
        embeddingDim: 3
      }
    })).rejects.toThrow("failed on chemd_rag_chunk_embeddings");

    const statements = client.calls.map(normalizedSql);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });

  it("searches similar chunks with pgvector distance and filters", async () => {
    const client = createClient({
      rows: [
        {
          chunk_id: "chunk-reaction",
          revision_id: "rev-1",
          experiment_id: "exp-1",
          chunk_type: "reaction_summary",
          source_entity_ids: ["rxn-1"],
          text: "reaction uses ethanol and THF",
          metadata: { date: "2026-04-22", reaction_ids: ["rxn-1"] },
          distance: "0.12"
        }
      ]
    });

    const results = await searchSimilarRagChunks({
      client,
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
      experimentId: "exp-1",
      revisionId: "rev-1",
      chunkTypes: ["reaction_summary"],
      model: {
        embeddingModel: "test-embedding-3",
        embeddingDim: 3
      }
    });

    const statement = normalizedSql(client.calls[0] as QueryCall);
    expect(statement).toContain("e.embedding <=> $2::vector AS distance");
    expect(statement).toContain("c.revision_id = e.revision_id");
    expect(statement).toContain("c.experiment_id = $3");
    expect(statement).toContain("c.revision_id = $4");
    expect(statement).toContain("c.chunk_type = ANY($5)");
    expect(statement).toContain("LIMIT $6");
    expect(client.calls[0]?.values).toEqual([
      "test-embedding-3",
      "[0.1,0.2,0.3]",
      "exp-1",
      "rev-1",
      ["reaction_summary"],
      5
    ]);
    expect(results).toEqual([
      {
        chunkId: "chunk-reaction",
        revisionId: "rev-1",
        experimentId: "exp-1",
        chunkType: "reaction_summary",
        sourceEntityIds: ["rxn-1"],
        text: "reaction uses ethanol and THF",
        metadata: { date: "2026-04-22", reaction_ids: ["rxn-1"] },
        distance: 0.12
      }
    ]);
  });
});

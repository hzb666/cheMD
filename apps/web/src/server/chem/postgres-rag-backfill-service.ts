import type { RagChunkRecord } from "@chemd/storage-postgres";

import {
  createRuntimeEmbeddingProvider,
  type CreateRuntimeEmbeddingProviderOptions
} from "./postgres-embedding-provider";
import {
  createPostgresRuntimeClient,
  type CreatePostgresRuntimeClientOptions,
  type PostgresRuntimeClient
} from "./postgres-client";
import {
  writeRagChunkEmbeddings,
  type EmbeddingProvider,
  type RagEmbeddingModelConfig,
  type WrittenRagChunkEmbedding
} from "./postgres-rag";
import type { PostgresQueryClient } from "./postgres-storage";

export interface BackfillRagChunkEmbeddingsInput {
  client: PostgresQueryClient;
  provider: EmbeddingProvider;
  model: RagEmbeddingModelConfig;
  experimentId?: string;
  revisionId?: string;
  chunkTypes?: readonly RagChunkRecord["chunkType"][];
  limit?: number;
  overwriteExisting?: boolean;
}

export interface BackfillRagChunkEmbeddingsWithRuntimeInput
  extends Omit<BackfillRagChunkEmbeddingsInput, "client" | "provider" | "model"> {
  embeddingRuntime?: CreateRuntimeEmbeddingProviderOptions;
  postgresRuntime?: CreatePostgresRuntimeClientOptions;
}

export interface BackfillRagChunkEmbeddingsResult {
  model: RagEmbeddingModelConfig;
  selected: number;
  embedded: number;
  skippedExisting: number;
  embeddings: WrittenRagChunkEmbedding[];
}

interface RowsResult<Row> {
  rows: Row[];
}

interface RagChunkBackfillRow {
  chunk_id: unknown;
  revision_id: unknown;
  experiment_id: unknown;
  chunk_type: unknown;
  source_entity_ids: unknown;
  text: unknown;
  metadata: unknown;
  has_embedding: unknown;
}

interface SelectedChunk {
  chunk: RagChunkRecord;
  hasEmbedding: boolean;
}

const DEFAULT_BACKFILL_LIMIT = 100;

const readRows = <Row>(result: unknown): Row[] => {
  if (
    typeof result !== "object" ||
    result === null ||
    !Array.isArray((result as { rows?: unknown }).rows)
  ) {
    throw new TypeError("Postgres query result must include rows");
  }
  return (result as RowsResult<Row>).rows;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
};

const requireStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${field} must be a string array`);
  }
  return value;
};

const normalizeBackfillLimit = (input: BackfillRagChunkEmbeddingsInput): number => {
  if (!input.experimentId && !input.revisionId && input.limit === undefined) {
    throw new Error("revisionId, experimentId, or limit is required");
  }
  if (input.limit === undefined) {
    return DEFAULT_BACKFILL_LIMIT;
  }
  if (!Number.isInteger(input.limit) || input.limit <= 0) {
    throw new RangeError("limit must be a positive integer");
  }
  return input.limit;
};

const mapBackfillRow = (row: RagChunkBackfillRow): SelectedChunk => ({
  chunk: {
    chunkId: requireString(row.chunk_id, "chunk_id"),
    revisionId: requireString(row.revision_id, "revision_id"),
    experimentId: requireString(row.experiment_id, "experiment_id"),
    chunkType: requireString(row.chunk_type, "chunk_type") as RagChunkRecord["chunkType"],
    sourceEntityIds: requireStringArray(row.source_entity_ids, "source_entity_ids"),
    text: requireString(row.text, "text"),
    metadata: row.metadata as RagChunkRecord["metadata"]
  },
  hasEmbedding: row.has_embedding === true
});

const selectBackfillChunks = async (
  input: BackfillRagChunkEmbeddingsInput
): Promise<SelectedChunk[]> => {
  const limit = normalizeBackfillLimit(input);
  const values: unknown[] = [input.model.embeddingModel];
  const clauses: string[] = [];

  if (input.experimentId) {
    values.push(input.experimentId);
    clauses.push(`c.experiment_id = $${values.length}`);
  }
  if (input.revisionId) {
    values.push(input.revisionId);
    clauses.push(`c.revision_id = $${values.length}`);
  }
  if (input.chunkTypes && input.chunkTypes.length > 0) {
    values.push([...input.chunkTypes]);
    clauses.push(`c.chunk_type = ANY($${values.length})`);
  }

  values.push(limit);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await input.client.query(
    `SELECT
      c.chunk_id,
      c.revision_id,
      c.experiment_id,
      c.chunk_type,
      c.source_entity_ids,
      c.text,
      c.metadata,
      e.chunk_id IS NOT NULL AS has_embedding
    FROM chemd_rag_chunks c
    LEFT JOIN chemd_rag_chunk_embeddings e
      ON e.chunk_id = c.chunk_id
      AND e.embedding_model = $1
    ${whereSql}
    ORDER BY c.revision_id, c.chunk_id
    LIMIT $${values.length}`,
    values
  );

  return readRows<RagChunkBackfillRow>(result).map(mapBackfillRow);
};

export const backfillRagChunkEmbeddings = async (
  input: BackfillRagChunkEmbeddingsInput
): Promise<BackfillRagChunkEmbeddingsResult> => {
  const selected = await selectBackfillChunks(input);
  const chunks = input.overwriteExisting
    ? selected.map((item) => item.chunk)
    : selected.filter((item) => !item.hasEmbedding).map((item) => item.chunk);
  const embeddings = await writeRagChunkEmbeddings({
    client: input.client,
    provider: input.provider,
    model: input.model,
    chunks
  });

  return {
    model: input.model,
    selected: selected.length,
    embedded: embeddings.length,
    skippedExisting: selected.length - chunks.length,
    embeddings
  };
};

export const backfillRagChunkEmbeddingsWithRuntime = async (
  input: BackfillRagChunkEmbeddingsWithRuntimeInput
): Promise<BackfillRagChunkEmbeddingsResult> => {
  const runtimeProvider = createRuntimeEmbeddingProvider(input.embeddingRuntime);
  const client: PostgresRuntimeClient = createPostgresRuntimeClient(
    input.postgresRuntime
  );
  try {
    return await backfillRagChunkEmbeddings({
      client,
      provider: runtimeProvider.provider,
      model: runtimeProvider.model,
      experimentId: input.experimentId,
      revisionId: input.revisionId,
      chunkTypes: input.chunkTypes,
      limit: input.limit,
      overwriteExisting: input.overwriteExisting
    });
  } finally {
    await client.close();
  }
};

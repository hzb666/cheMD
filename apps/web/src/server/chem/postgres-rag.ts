import type { RagChunkRecord } from "@chemd/storage-postgres";

import type { PostgresQueryClient } from "./postgres-storage";

export type PgvectorDistanceMetric = "cosine" | "l2" | "inner_product";

export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
}

export interface RagEmbeddingModelConfig {
  embeddingModel: string;
  embeddingDim: number;
  distanceMetric?: PgvectorDistanceMetric;
}

export interface WriteRagChunkEmbeddingsInput {
  client: PostgresQueryClient;
  provider: EmbeddingProvider;
  model: RagEmbeddingModelConfig;
  chunks: readonly RagChunkRecord[];
}

export interface WrittenRagChunkEmbedding {
  chunkId: string;
  embeddingModel: string;
  embedding: readonly number[];
}

export interface SearchSimilarRagChunksInput {
  client: PostgresQueryClient;
  model: RagEmbeddingModelConfig;
  embedding: readonly number[];
  limit?: number;
  experimentId?: string;
  revisionId?: string;
  chunkTypes?: readonly RagChunkRecord["chunkType"][];
}

export interface SimilarRagChunkResult {
  chunkId: string;
  revisionId: string;
  experimentId: string;
  chunkType: RagChunkRecord["chunkType"];
  sourceEntityIds: string[];
  text: string;
  metadata: RagChunkRecord["metadata"];
  distance: number;
}

interface RowsResult<Row> {
  rows: Row[];
}

interface RagSearchRow {
  chunk_id: unknown;
  revision_id: unknown;
  experiment_id: unknown;
  chunk_type: unknown;
  source_entity_ids: unknown;
  text: unknown;
  metadata: unknown;
  distance: unknown;
}

const distanceOperators: Record<PgvectorDistanceMetric, string> = {
  cosine: "<=>",
  l2: "<->",
  inner_product: "<#>"
};

const assertModelConfig = (model: RagEmbeddingModelConfig): void => {
  if (!model.embeddingModel.trim()) {
    throw new TypeError("embeddingModel must be a non-empty string");
  }
  if (!Number.isInteger(model.embeddingDim) || model.embeddingDim <= 0) {
    throw new RangeError("embeddingDim must be a positive integer");
  }
  if (model.distanceMetric && !(model.distanceMetric in distanceOperators)) {
    throw new TypeError(`unsupported distanceMetric: ${model.distanceMetric}`);
  }
};

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return 8;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError("limit must be a positive integer");
  }
  return limit;
};

const vectorLiteral = (
  values: readonly number[],
  expectedDim: number
): string => {
  if (values.length !== expectedDim) {
    throw new RangeError(`embedding dimension ${values.length} does not match ${expectedDim}`);
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new TypeError("embedding values must be finite numbers");
    }
  }
  return `[${values.map((value) => value.toString()).join(",")}]`;
};

const withTransaction = async <T>(
  client: PostgresQueryClient,
  operation: () => Promise<T>
): Promise<T> => {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const upsertEmbeddingModel = async (
  client: PostgresQueryClient,
  model: RagEmbeddingModelConfig
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_embedding_models (
      embedding_model, embedding_dim, distance_metric
    ) VALUES ($1,$2,$3)
    ON CONFLICT (embedding_model) DO UPDATE SET
      embedding_dim = EXCLUDED.embedding_dim,
      distance_metric = EXCLUDED.distance_metric`,
    [model.embeddingModel, model.embeddingDim, model.distanceMetric ?? "cosine"]
  );
};

const insertChunkEmbedding = async (
  client: PostgresQueryClient,
  embedding: WrittenRagChunkEmbedding
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_rag_chunk_embeddings (
      chunk_id, embedding_model, embedding
    ) VALUES ($1,$2,$3::vector)
    ON CONFLICT (chunk_id, embedding_model) DO UPDATE SET
      embedding = EXCLUDED.embedding`,
    [embedding.chunkId, embedding.embeddingModel, vectorLiteral(embedding.embedding, embedding.embedding.length)]
  );
};

const buildChunkEmbeddings = async (
  provider: EmbeddingProvider,
  model: RagEmbeddingModelConfig,
  chunks: readonly RagChunkRecord[]
): Promise<WrittenRagChunkEmbedding[]> => {
  const embeddings: WrittenRagChunkEmbedding[] = [];
  for (const chunk of chunks) {
    const embedding = await provider.embed(chunk.text);
    vectorLiteral(embedding, model.embeddingDim);
    embeddings.push({
      chunkId: chunk.chunkId,
      embeddingModel: model.embeddingModel,
      embedding: [...embedding]
    });
  }
  return embeddings;
};

export const writeRagChunkEmbeddings = async (
  input: WriteRagChunkEmbeddingsInput
): Promise<WrittenRagChunkEmbedding[]> => {
  assertModelConfig(input.model);
  const embeddings = await buildChunkEmbeddings(input.provider, input.model, input.chunks);
  if (embeddings.length === 0) {
    return [];
  }

  await withTransaction(input.client, async () => {
    await upsertEmbeddingModel(input.client, input.model);
    for (const embedding of embeddings) {
      await insertChunkEmbedding(input.client, embedding);
    }
  });
  return embeddings;
};

const isRowsResult = <Row>(value: unknown): value is RowsResult<Row> =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { rows?: unknown }).rows);

const readRows = <Row>(result: unknown): Row[] => {
  if (!isRowsResult<Row>(result)) {
    throw new TypeError("Postgres query result must include rows");
  }
  return result.rows;
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

const requireDistance = (value: unknown): number => {
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) {
    throw new TypeError("distance must be a finite number");
  }
  return numberValue;
};

const mapSearchRow = (row: RagSearchRow): SimilarRagChunkResult => ({
  chunkId: requireString(row.chunk_id, "chunk_id"),
  revisionId: requireString(row.revision_id, "revision_id"),
  experimentId: requireString(row.experiment_id, "experiment_id"),
  chunkType: requireString(row.chunk_type, "chunk_type") as RagChunkRecord["chunkType"],
  sourceEntityIds: requireStringArray(row.source_entity_ids, "source_entity_ids"),
  text: requireString(row.text, "text"),
  metadata: row.metadata as RagChunkRecord["metadata"],
  distance: requireDistance(row.distance)
});

export const searchSimilarRagChunks = async (
  input: SearchSimilarRagChunksInput
): Promise<SimilarRagChunkResult[]> => {
  assertModelConfig(input.model);
  const limit = normalizeLimit(input.limit);
  const queryVector = vectorLiteral(input.embedding, input.model.embeddingDim);
  const operator = distanceOperators[input.model.distanceMetric ?? "cosine"];
  const values: unknown[] = [input.model.embeddingModel, queryVector];
  const clauses = ["e.embedding_model = $1"];

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
  const result = await input.client.query(
    `SELECT
      c.chunk_id,
      c.revision_id,
      c.experiment_id,
      c.chunk_type,
      c.source_entity_ids,
      c.text,
      c.metadata,
      e.embedding ${operator} $2::vector AS distance
    FROM chemd_rag_chunk_embeddings e
    JOIN chemd_rag_chunks c ON c.chunk_id = e.chunk_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY e.embedding ${operator} $2::vector
    LIMIT $${values.length}`,
    values
  );

  return readRows<RagSearchRow>(result).map(mapSearchRow);
};

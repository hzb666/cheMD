import type {
  BuildExperimentStorageInput,
  ExperimentStorageRecords
} from "@chemd/storage-postgres";

import {
  createPostgresRuntimeClient,
  type CreatePostgresRuntimeClientOptions,
  type PostgresRuntimeClient
} from "./postgres-client";
import {
  installChemdStorageSchema,
  saveCompiledExperiment,
  type PostgresQueryClient
} from "./postgres-storage";
import {
  writeRagChunkEmbeddings,
  type EmbeddingProvider,
  type RagEmbeddingModelConfig,
  type WrittenRagChunkEmbedding
} from "./postgres-rag";

export interface PostgresEmbeddingWriteOptions {
  provider: EmbeddingProvider;
  model: RagEmbeddingModelConfig;
}

export interface PersistChemdExperimentInput {
  client: PostgresQueryClient;
  source: string;
  revisionId: string;
  sourceKind?: BuildExperimentStorageInput["sourceKind"];
  sourceUri?: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt?: string;
  compileRunId?: string;
  compilerVersion?: string;
  installSchema?: boolean;
  embedding?: PostgresEmbeddingWriteOptions;
}

export interface PersistChemdExperimentWithRuntimeInput
  extends Omit<PersistChemdExperimentInput, "client"> {
  runtime?: CreatePostgresRuntimeClientOptions;
}

export interface PersistChemdExperimentResult {
  records: ExperimentStorageRecords;
  embeddings: WrittenRagChunkEmbedding[];
  schemaInstalled: boolean;
}

const runOptionalEmbeddingWrite = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords,
  embedding: PostgresEmbeddingWriteOptions | undefined
): Promise<WrittenRagChunkEmbedding[]> => {
  if (!embedding) {
    return [];
  }
  return writeRagChunkEmbeddings({
    client,
    provider: embedding.provider,
    model: embedding.model,
    chunks: records.ragChunks
  });
};

export const persistChemdExperiment = async (
  input: PersistChemdExperimentInput
): Promise<PersistChemdExperimentResult> => {
  if (input.installSchema) {
    await installChemdStorageSchema(input.client);
  }

  const records = await saveCompiledExperiment({
    client: input.client,
    source: input.source,
    revisionId: input.revisionId,
    sourceKind: input.sourceKind,
    sourceUri: input.sourceUri,
    parentRevisionId: input.parentRevisionId,
    commitSha: input.commitSha,
    createdAt: input.createdAt,
    compileRunId: input.compileRunId,
    compilerVersion: input.compilerVersion
  });
  const embeddings = await runOptionalEmbeddingWrite(
    input.client,
    records,
    input.embedding
  );

  return {
    records,
    embeddings,
    schemaInstalled: input.installSchema === true
  };
};

export const persistChemdExperimentWithRuntime = async (
  input: PersistChemdExperimentWithRuntimeInput
): Promise<PersistChemdExperimentResult> => {
  const { runtime, ...persistInput } = input;
  const client: PostgresRuntimeClient = createPostgresRuntimeClient(runtime);
  try {
    return await persistChemdExperiment({
      ...persistInput,
      client
    });
  } finally {
    await client.close();
  }
};

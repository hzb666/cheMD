import {
  createRuntimeEmbeddingProvider,
  type CreateRuntimeEmbeddingProviderOptions
} from "./postgres-embedding-provider";
import type { RagChunkRecord } from "@chemd/storage-postgres";
import type { SimilarRagChunkResult } from "./postgres-rag";
import {
  searchSimilarRagChunksWithRuntime,
  type SearchSimilarRagChunksWithRuntimeInput
} from "./postgres-rag-search-service";

export interface SearchRagChunksByQueryInput {
  query: string;
  limit?: number;
  experimentId?: string;
  revisionId?: string;
  chunkTypes?: readonly RagChunkRecord["chunkType"][];
  embeddingRuntime?: CreateRuntimeEmbeddingProviderOptions;
  searchRuntime?: SearchSimilarRagChunksWithRuntimeInput["runtime"];
}

export interface SearchRagChunksByQueryResult {
  query: string;
  model: SearchSimilarRagChunksWithRuntimeInput["model"];
  results: SimilarRagChunkResult[];
}

export const searchRagChunksByQuery = async (
  input: SearchRagChunksByQueryInput
): Promise<SearchRagChunksByQueryResult> => {
  const runtimeProvider = createRuntimeEmbeddingProvider(input.embeddingRuntime);
  const embedding = await runtimeProvider.provider.embed(input.query);
  const results = await searchSimilarRagChunksWithRuntime({
    runtime: input.searchRuntime,
    embedding,
    limit: input.limit,
    experimentId: input.experimentId,
    revisionId: input.revisionId,
    chunkTypes: input.chunkTypes,
    model: runtimeProvider.model
  });

  return {
    query: input.query,
    model: runtimeProvider.model,
    results
  };
};

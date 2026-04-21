import {
  createPostgresRuntimeClient,
  type CreatePostgresRuntimeClientOptions,
  type PostgresRuntimeClient
} from "./postgres-client";
import {
  searchSimilarRagChunks,
  type SearchSimilarRagChunksInput,
  type SimilarRagChunkResult
} from "./postgres-rag";

export interface SearchSimilarRagChunksWithRuntimeInput
  extends Omit<SearchSimilarRagChunksInput, "client"> {
  runtime?: CreatePostgresRuntimeClientOptions;
}

export const searchSimilarRagChunksWithRuntime = async (
  input: SearchSimilarRagChunksWithRuntimeInput
): Promise<SimilarRagChunkResult[]> => {
  const { runtime, ...searchInput } = input;
  const client: PostgresRuntimeClient = createPostgresRuntimeClient(runtime);
  try {
    return await searchSimilarRagChunks({
      ...searchInput,
      client
    });
  } finally {
    await client.close();
  }
};

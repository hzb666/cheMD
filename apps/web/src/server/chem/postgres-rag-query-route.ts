import type { RagChunkRecord } from "@chemd/storage-postgres";

import type {
  SearchRagChunksByQueryInput,
  SearchRagChunksByQueryResult
} from "./postgres-rag-query-service";
import {
  badRequest,
  errorResponse,
  jsonResult,
  type JsonRouteResult,
  upstreamFailure
} from "./route-responses";
import {
  parseJsonObjectBody,
  readOptionalTrimmedString,
  readStringArray
} from "./request-parsers";

type RagQueryRouteInput = Omit<
  SearchRagChunksByQueryInput,
  "embeddingRuntime" | "searchRuntime"
>;

const chunkTypes = new Set<string>([
  "markdown",
  "reaction_summary",
  "result_notes",
  "analysis_notes",
  "sample_notes",
  "document_summary"
]);

const readRequiredQuery = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const readPositiveInteger = (value: unknown): number | null => {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    return null;
  }
  return value;
};

const readOptionalPositiveInteger = (value: unknown): number | undefined | null =>
  value === undefined ? undefined : readPositiveInteger(value);

const readChunkTypes = (
  value: unknown
): readonly RagChunkRecord["chunkType"][] | undefined | null => {
  if (value === undefined) {
    return undefined;
  }
  const values = readStringArray(value);
  if (!values || values.some((chunkType) => !chunkTypes.has(chunkType))) {
    return null;
  }
  return values as RagChunkRecord["chunkType"][];
};

export const parseRagQueryRouteInput = async (
  request: Request
): Promise<RagQueryRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const query = readRequiredQuery(body.query);
  if (!query) {
    return badRequest("query is required");
  }

  const limit = readOptionalPositiveInteger(body.limit);
  const parsedChunkTypes = readChunkTypes(body.chunkTypes);
  if (limit === null || parsedChunkTypes === null) {
    return badRequest("limit or chunkTypes is invalid");
  }

  return {
    query,
    limit,
    experimentId: readOptionalTrimmedString(body.experimentId),
    revisionId: readOptionalTrimmedString(body.revisionId),
    chunkTypes: parsedChunkTypes
  };
};

export const buildRagQueryRouteResult = (
  result: SearchRagChunksByQueryResult
): JsonRouteResult<{
  query: string;
  model: SearchRagChunksByQueryResult["model"];
  count: number;
  results: SearchRagChunksByQueryResult["results"];
}> =>
  jsonResult({
    query: result.query,
    model: {
      embeddingModel: result.model.embeddingModel,
      embeddingDim: result.model.embeddingDim,
      distanceMetric: result.model.distanceMetric ?? "cosine"
    },
    count: result.results.length,
    results: result.results
  });

const isEmbeddingConfigError = (error: Error): boolean =>
  error.message.startsWith("CHEMD_EMBEDDING_");

export const ragQueryErrorResponse = (error: unknown): Response => {
  if (
    error instanceof Error &&
    error.message === "CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required"
  ) {
    return errorResponse(500, "postgres database url is not configured", {
      code: "E_POSTGRES_CONFIG"
    });
  }

  if (error instanceof Error && isEmbeddingConfigError(error)) {
    return errorResponse(500, "embedding provider is not configured", {
      code: "E_EMBEDDING_CONFIG"
    });
  }

  return upstreamFailure(
    error instanceof Error ? error.message : "postgres rag query failed",
    502,
    "E_POSTGRES_RAG_QUERY"
  );
};

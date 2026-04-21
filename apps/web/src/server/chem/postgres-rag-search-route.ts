import type { RagChunkRecord } from "@chemd/storage-postgres";

import type { PgvectorDistanceMetric, SimilarRagChunkResult } from "./postgres-rag";
import type { SearchSimilarRagChunksWithRuntimeInput } from "./postgres-rag-search-service";
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

type RagSearchRouteInput = Omit<
  SearchSimilarRagChunksWithRuntimeInput,
  "runtime"
>;

const distanceMetrics = new Set<string>(["cosine", "l2", "inner_product"]);
const chunkTypes = new Set<string>([
  "markdown",
  "reaction_summary",
  "result_notes",
  "analysis_notes",
  "sample_notes",
  "document_summary"
]);

const readRequiredModel = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const readPositiveInteger = (value: unknown): number | null => {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    return null;
  }
  return value;
};

const readOptionalPositiveInteger = (value: unknown): number | undefined | null =>
  value === undefined ? undefined : readPositiveInteger(value);

const readEmbedding = (value: unknown, dim: number): readonly number[] | null => {
  if (!Array.isArray(value) || value.length !== dim) {
    return null;
  }
  return value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [...value]
    : null;
};

const readDistanceMetric = (
  value: unknown
): PgvectorDistanceMetric | undefined | null => {
  const metric = readOptionalTrimmedString(value);
  if (metric === undefined) {
    return undefined;
  }
  return distanceMetrics.has(metric) ? metric as PgvectorDistanceMetric : null;
};

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

export const parseRagSearchRouteInput = async (
  request: Request
): Promise<RagSearchRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const embeddingModel = readRequiredModel(body.embeddingModel);
  const embeddingDim = readPositiveInteger(body.embeddingDim);
  if (!embeddingModel || !embeddingDim) {
    return badRequest("embeddingModel and embeddingDim are required");
  }

  const embedding = readEmbedding(body.embedding, embeddingDim);
  if (!embedding) {
    return badRequest("embedding must be a finite number array matching embeddingDim");
  }

  const distanceMetric = readDistanceMetric(body.distanceMetric);
  const limit = readOptionalPositiveInteger(body.limit);
  const parsedChunkTypes = readChunkTypes(body.chunkTypes);
  if (distanceMetric === null || limit === null || parsedChunkTypes === null) {
    return badRequest("distanceMetric, limit, or chunkTypes is invalid");
  }

  return {
    embedding,
    limit,
    experimentId: readOptionalTrimmedString(body.experimentId),
    revisionId: readOptionalTrimmedString(body.revisionId),
    chunkTypes: parsedChunkTypes,
    model: {
      embeddingModel,
      embeddingDim,
      distanceMetric
    }
  };
};

export const buildRagSearchRouteResult = (
  input: RagSearchRouteInput,
  results: readonly SimilarRagChunkResult[]
): JsonRouteResult<{
  model: {
    embeddingModel: string;
    embeddingDim: number;
    distanceMetric: PgvectorDistanceMetric;
  };
  count: number;
  results: readonly SimilarRagChunkResult[];
}> =>
  jsonResult({
    model: {
      embeddingModel: input.model.embeddingModel,
      embeddingDim: input.model.embeddingDim,
      distanceMetric: input.model.distanceMetric ?? "cosine"
    },
    count: results.length,
    results
  });

export const ragSearchErrorResponse = (error: unknown): Response => {
  if (
    error instanceof Error &&
    error.message === "CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required"
  ) {
    return errorResponse(500, "postgres database url is not configured", {
      code: "E_POSTGRES_CONFIG"
    });
  }

  return upstreamFailure(
    error instanceof Error ? error.message : "postgres rag search failed",
    502,
    "E_POSTGRES_RAG_SEARCH"
  );
};

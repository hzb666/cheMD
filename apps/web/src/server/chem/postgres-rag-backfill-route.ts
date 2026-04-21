import type { RagChunkRecord } from "@chemd/storage-postgres";

import type {
  BackfillRagChunkEmbeddingsResult,
  BackfillRagChunkEmbeddingsWithRuntimeInput
} from "./postgres-rag-backfill-service";
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

type RagBackfillRouteInput = Omit<
  BackfillRagChunkEmbeddingsWithRuntimeInput,
  "embeddingRuntime" | "postgresRuntime"
>;

const chunkTypes = new Set<string>([
  "markdown",
  "reaction_summary",
  "result_notes",
  "analysis_notes",
  "sample_notes",
  "document_summary"
]);

const readPositiveInteger = (value: unknown): number | null => {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    return null;
  }
  return value;
};

const readOptionalPositiveInteger = (value: unknown): number | undefined | null =>
  value === undefined ? undefined : readPositiveInteger(value);

const readOptionalBoolean = (value: unknown): boolean | undefined | null => {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : null;
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

export const parseRagBackfillRouteInput = async (
  request: Request
): Promise<RagBackfillRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const limit = readOptionalPositiveInteger(body.limit);
  const overwriteExisting = readOptionalBoolean(body.overwriteExisting);
  const parsedChunkTypes = readChunkTypes(body.chunkTypes);
  if (limit === null || overwriteExisting === null || parsedChunkTypes === null) {
    return badRequest("limit, overwriteExisting, or chunkTypes is invalid");
  }

  const experimentId = readOptionalTrimmedString(body.experimentId);
  const revisionId = readOptionalTrimmedString(body.revisionId);
  if (!experimentId && !revisionId && limit === undefined) {
    return badRequest("revisionId, experimentId, or limit is required");
  }

  return {
    experimentId,
    revisionId,
    chunkTypes: parsedChunkTypes,
    limit,
    overwriteExisting
  };
};

export const buildRagBackfillRouteResult = (
  result: BackfillRagChunkEmbeddingsResult
): JsonRouteResult<{
  model: BackfillRagChunkEmbeddingsResult["model"];
  selected: number;
  embedded: number;
  skippedExisting: number;
  embeddings: { count: number; chunkIds: string[] };
}> =>
  jsonResult({
    model: {
      embeddingModel: result.model.embeddingModel,
      embeddingDim: result.model.embeddingDim,
      distanceMetric: result.model.distanceMetric ?? "cosine"
    },
    selected: result.selected,
    embedded: result.embedded,
    skippedExisting: result.skippedExisting,
    embeddings: {
      count: result.embeddings.length,
      chunkIds: result.embeddings.map((embedding) => embedding.chunkId)
    }
  }, 202);

const isEmbeddingConfigError = (error: Error): boolean =>
  error.message.startsWith("CHEMD_EMBEDDING_");

export const ragBackfillErrorResponse = (error: unknown): Response => {
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
    error instanceof Error ? error.message : "postgres rag backfill failed",
    502,
    "E_POSTGRES_RAG_BACKFILL"
  );
};

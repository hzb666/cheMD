import type {
  RunTrainingMemoryLoopResult,
  RunTrainingMemoryLoopWithRuntimeInput
} from "./postgres-memory-loop-service";
import {
  TrainingMemoryLoopArtifactError,
  TrainingMemoryLoopNotFoundError
} from "./postgres-memory-loop-service";
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
  readRequiredTrimmedString
} from "./request-parsers";

type PostgresMemoryLoopRouteInput = Omit<
  RunTrainingMemoryLoopWithRuntimeInput,
  "runtime"
>;

export const parsePostgresMemoryLoopRouteInput = async (
  request: Request
): Promise<PostgresMemoryLoopRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const afterRevisionId = readRequiredTrimmedString(body.afterRevisionId);
  if (!afterRevisionId) {
    return badRequest("afterRevisionId is required");
  }

  return {
    afterRevisionId,
    beforeRevisionId: readOptionalTrimmedString(body.beforeRevisionId)
  };
};

export const buildPostgresMemoryLoopRouteResult = (
  result: RunTrainingMemoryLoopResult
): JsonRouteResult<{
  beforeRevisionId?: string;
  afterRevisionId: string;
  semanticDiffId: string;
  records: {
    trainingExperienceEvents: number;
    correctionPatterns: number;
    experimentPatternMemories: number;
    datasetProjections: number;
  };
  correctionPatternAggregation: {
    recomputed: number;
    deleted: number;
  };
}> =>
  jsonResult({
    beforeRevisionId: result.beforeRevisionId,
    afterRevisionId: result.afterRevisionId,
    semanticDiffId: result.records.semanticDiff.semanticDiffId,
    records: {
      trainingExperienceEvents: result.records.trainingExperienceEvents.length,
      correctionPatterns: result.records.correctionPatterns.length,
      experimentPatternMemories: result.records.experimentPatternMemories.length,
      datasetProjections: result.records.datasetProjections.length
    },
    correctionPatternAggregation: {
      recomputed: result.correctionPatternAggregation.recomputed,
      deleted: result.correctionPatternAggregation.deleted
    }
  }, 201);

export const postgresMemoryLoopErrorResponse = (error: unknown): Response => {
  if (
    error instanceof Error &&
    error.message === "CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required"
  ) {
    return errorResponse(500, "postgres database url is not configured", {
      code: "E_POSTGRES_CONFIG"
    });
  }

  if (error instanceof TrainingMemoryLoopNotFoundError) {
    return errorResponse(404, error.message, { code: "E_REVISION_NOT_FOUND" });
  }

  if (error instanceof TrainingMemoryLoopArtifactError) {
    return errorResponse(422, error.message, { code: "E_TRAINING_ARTIFACT" });
  }

  return upstreamFailure(
    error instanceof Error ? error.message : "postgres memory loop failed",
    502,
    "E_POSTGRES_MEMORY_LOOP"
  );
};

import {
  MAX_TRAINING_EXPORT_LIMIT,
  PostgresTrainingExportArtifactError,
  PostgresTrainingExportFilterError,
  type ExportPostgresTrainingResult,
  type ExportPostgresTrainingWithRuntimeInput
} from "./postgres-training-export-service";
import {
  badRequest,
  errorResponse,
  jsonResult,
  type JsonRouteResult,
  upstreamFailure
} from "./route-responses";
import {
  parseJsonObjectBody,
  readOptionalTrimmedString
} from "./request-parsers";

type PostgresTrainingExportRouteInput = Omit<
  ExportPostgresTrainingWithRuntimeInput,
  "runtime"
>;

const readOptionalBoolean = (value: unknown): boolean | undefined | null => {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : null;
};

const readOptionalLimit = (value: unknown): number | undefined | null => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_TRAINING_EXPORT_LIMIT
  ) {
    return null;
  }
  return value;
};

export const parsePostgresTrainingExportRouteInput = async (
  request: Request
): Promise<PostgresTrainingExportRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const revisionId = readOptionalTrimmedString(body.revisionId);
  const experimentId = readOptionalTrimmedString(body.experimentId);
  if (!revisionId && !experimentId) {
    return badRequest("revisionId or experimentId is required");
  }
  if (revisionId && experimentId) {
    return badRequest("provide exactly one of revisionId or experimentId");
  }

  const limit = readOptionalLimit(body.limit);
  const includeCorrectionPatterns = readOptionalBoolean(body.includeCorrectionPatterns);
  const includeExperimentPatternMemory = readOptionalBoolean(body.includeExperimentPatternMemory);
  if (
    limit === null ||
    includeCorrectionPatterns === null ||
    includeExperimentPatternMemory === null
  ) {
    return badRequest("limit or export options are invalid");
  }

  return {
    revisionId,
    experimentId,
    limit,
    includeCorrectionPatterns,
    includeExperimentPatternMemory
  };
};

export const buildPostgresTrainingExportRouteResult = (
  result: ExportPostgresTrainingResult
): JsonRouteResult<ExportPostgresTrainingResult> =>
  jsonResult(result);

export const postgresTrainingExportErrorResponse = (error: unknown): Response => {
  if (
    error instanceof Error &&
    error.message === "CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required"
  ) {
    return errorResponse(500, "postgres database url is not configured", {
      code: "E_POSTGRES_CONFIG"
    });
  }

  if (error instanceof PostgresTrainingExportFilterError) {
    return errorResponse(400, error.message, { code: "E_POSTGRES_TRAINING_EXPORT_FILTER" });
  }

  if (error instanceof PostgresTrainingExportArtifactError) {
    return errorResponse(422, error.message, { code: "E_TRAINING_EXPORT_ARTIFACT" });
  }

  return upstreamFailure(
    error instanceof Error ? error.message : "postgres training export failed",
    502,
    "E_POSTGRES_TRAINING_EXPORT"
  );
};

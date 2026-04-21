import type { ExperimentSourceKind } from "@chemd/storage-postgres";

import type {
  PersistChemdExperimentResult,
  PersistChemdExperimentWithRuntimeInput
} from "./postgres-ingest-service";
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

type PostgresIngestRouteInput = Omit<
  PersistChemdExperimentWithRuntimeInput,
  "embedding" | "runtime"
>;

const sourceKinds = new Set<string>([
  "chemd",
  "patent_xml",
  "paper_pdf",
  "ocr_text",
  "external_import"
]);

const readRequiredSource = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const readOptionalBoolean = (value: unknown): boolean | undefined | null => {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : null;
};

const readOptionalSourceKind = (
  value: unknown
): ExperimentSourceKind | undefined | null => {
  const sourceKind = readOptionalTrimmedString(value);
  if (sourceKind === undefined) {
    return undefined;
  }
  return sourceKinds.has(sourceKind) ? sourceKind as ExperimentSourceKind : null;
};

export const parsePostgresIngestRouteInput = async (
  request: Request
): Promise<PostgresIngestRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const source = readRequiredSource(body.source);
  const revisionId = readOptionalTrimmedString(body.revisionId);
  if (!source || !revisionId) {
    return badRequest("source and revisionId are required");
  }

  const sourceKind = readOptionalSourceKind(body.sourceKind);
  if (sourceKind === null) {
    return badRequest("sourceKind is invalid");
  }

  const installSchema = readOptionalBoolean(body.installSchema);
  if (installSchema === null) {
    return badRequest("installSchema must be a boolean when provided");
  }

  return {
    source,
    revisionId,
    sourceKind,
    sourceUri: readOptionalTrimmedString(body.sourceUri),
    parentRevisionId: readOptionalTrimmedString(body.parentRevisionId),
    commitSha: readOptionalTrimmedString(body.commitSha),
    createdAt: readOptionalTrimmedString(body.createdAt),
    compileRunId: readOptionalTrimmedString(body.compileRunId),
    compilerVersion: readOptionalTrimmedString(body.compilerVersion),
    installSchema
  };
};

export const buildPostgresIngestRouteResult = (
  result: PersistChemdExperimentResult
): JsonRouteResult<{
  experimentId: string;
  revisionId: string;
  compileRunId: string;
  schemaInstalled: boolean;
  embeddings: { count: number };
  records: {
    semanticEntities: number;
    semanticRelations: number;
    fieldEvidence: number;
    ragChunks: number;
  };
}> =>
  jsonResult({
    experimentId: result.records.experiment.experimentId,
    revisionId: result.records.revision.revisionId,
    compileRunId: result.records.compileRun.compileRunId,
    schemaInstalled: result.schemaInstalled,
    embeddings: {
      count: result.embeddings.length
    },
    records: {
      semanticEntities: result.records.semanticEntities.length,
      semanticRelations: result.records.semanticRelations.length,
      fieldEvidence: result.records.fieldEvidence.length,
      ragChunks: result.records.ragChunks.length
    }
  }, 201);

export const postgresIngestErrorResponse = (error: unknown): Response => {
  if (
    error instanceof Error &&
    error.message === "CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required"
  ) {
    return errorResponse(500, "postgres database url is not configured", {
      code: "E_POSTGRES_CONFIG"
    });
  }

  return upstreamFailure(
    error instanceof Error ? error.message : "postgres ingest failed",
    502,
    "E_POSTGRES_INGEST"
  );
};

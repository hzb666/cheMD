import {
  buildPostgresIngestRouteResult,
  parsePostgresIngestRouteInput,
  postgresIngestErrorResponse
} from "../../../../../server/chem/postgres-ingest-route";
import { persistChemdExperimentWithRuntime } from "../../../../../server/chem/postgres-ingest-service";
import { toJsonResponse } from "../../../../../server/chem/route-responses";
import { requireMatchingSessionToken } from "../../../../../server/chem/session-guard";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  try {
    const parsed = await parsePostgresIngestRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const result = await persistChemdExperimentWithRuntime(parsed);
    return toJsonResponse(buildPostgresIngestRouteResult(result));
  } catch (error) {
    return postgresIngestErrorResponse(error);
  }
};

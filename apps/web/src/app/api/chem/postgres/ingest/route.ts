import {
  buildPostgresIngestRouteResult,
  parsePostgresIngestRouteInput,
  postgresIngestErrorResponse
} from "../../../../../server/chem/postgres-ingest-route";
import { persistChemdExperimentWithRuntime } from "../../../../../server/chem/postgres-ingest-service";
import { toJsonResponse } from "../../../../../server/chem/route-responses";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
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

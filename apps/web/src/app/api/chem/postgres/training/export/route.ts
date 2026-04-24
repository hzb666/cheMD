import {
  buildPostgresTrainingExportRouteResult,
  parsePostgresTrainingExportRouteInput,
  postgresTrainingExportErrorResponse
} from "../../../../../../server/chem/postgres-training-export-route";
import { exportPostgresTrainingWithRuntime } from "../../../../../../server/chem/postgres-training-export-service";
import { toJsonResponse } from "../../../../../../server/chem/route-responses";
import { requireMatchingSessionToken } from "../../../../../../server/chem/session-guard";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  try {
    const parsed = await parsePostgresTrainingExportRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const result = await exportPostgresTrainingWithRuntime(parsed);
    return toJsonResponse(buildPostgresTrainingExportRouteResult(result));
  } catch (error) {
    return postgresTrainingExportErrorResponse(error);
  }
};

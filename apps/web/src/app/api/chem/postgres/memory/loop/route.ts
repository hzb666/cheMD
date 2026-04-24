import {
  buildPostgresMemoryLoopRouteResult,
  parsePostgresMemoryLoopRouteInput,
  postgresMemoryLoopErrorResponse
} from "../../../../../../server/chem/postgres-memory-loop-route";
import { runTrainingMemoryLoopWithRuntime } from "../../../../../../server/chem/postgres-memory-loop-service";
import { toJsonResponse } from "../../../../../../server/chem/route-responses";
import { requireMatchingSessionToken } from "../../../../../../server/chem/session-guard";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  try {
    const parsed = await parsePostgresMemoryLoopRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const result = await runTrainingMemoryLoopWithRuntime(parsed);
    return toJsonResponse(buildPostgresMemoryLoopRouteResult(result));
  } catch (error) {
    return postgresMemoryLoopErrorResponse(error);
  }
};

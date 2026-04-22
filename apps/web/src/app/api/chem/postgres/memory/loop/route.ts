import {
  buildPostgresMemoryLoopRouteResult,
  parsePostgresMemoryLoopRouteInput,
  postgresMemoryLoopErrorResponse
} from "../../../../../../server/chem/postgres-memory-loop-route";
import { runTrainingMemoryLoopWithRuntime } from "../../../../../../server/chem/postgres-memory-loop-service";
import { toJsonResponse } from "../../../../../../server/chem/route-responses";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
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

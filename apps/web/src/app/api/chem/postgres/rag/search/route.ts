import {
  buildRagSearchRouteResult,
  parseRagSearchRouteInput,
  ragSearchErrorResponse
} from "../../../../../../server/chem/postgres-rag-search-route";
import { searchSimilarRagChunksWithRuntime } from "../../../../../../server/chem/postgres-rag-search-service";
import { toJsonResponse } from "../../../../../../server/chem/route-responses";
import { requireMatchingSessionToken } from "../../../../../../server/chem/session-guard";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  try {
    const parsed = await parseRagSearchRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const results = await searchSimilarRagChunksWithRuntime(parsed);
    return toJsonResponse(buildRagSearchRouteResult(parsed, results));
  } catch (error) {
    return ragSearchErrorResponse(error);
  }
};

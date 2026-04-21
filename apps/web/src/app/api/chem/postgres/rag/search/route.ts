import {
  buildRagSearchRouteResult,
  parseRagSearchRouteInput,
  ragSearchErrorResponse
} from "../../../../../../server/chem/postgres-rag-search-route";
import { searchSimilarRagChunksWithRuntime } from "../../../../../../server/chem/postgres-rag-search-service";
import { toJsonResponse } from "../../../../../../server/chem/route-responses";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
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

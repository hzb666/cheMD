import {
  buildRagQueryRouteResult,
  parseRagQueryRouteInput,
  ragQueryErrorResponse
} from "../../../../../../server/chem/postgres-rag-query-route";
import { searchRagChunksByQuery } from "../../../../../../server/chem/postgres-rag-query-service";
import { toJsonResponse } from "../../../../../../server/chem/route-responses";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  try {
    const parsed = await parseRagQueryRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const result = await searchRagChunksByQuery(parsed);
    return toJsonResponse(buildRagQueryRouteResult(result));
  } catch (error) {
    return ragQueryErrorResponse(error);
  }
};

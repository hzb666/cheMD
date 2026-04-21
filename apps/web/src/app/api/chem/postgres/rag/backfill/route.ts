import {
  buildRagBackfillRouteResult,
  parseRagBackfillRouteInput,
  ragBackfillErrorResponse
} from "../../../../../../server/chem/postgres-rag-backfill-route";
import { backfillRagChunkEmbeddingsWithRuntime } from "../../../../../../server/chem/postgres-rag-backfill-service";
import { toJsonResponse } from "../../../../../../server/chem/route-responses";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  try {
    const parsed = await parseRagBackfillRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const result = await backfillRagChunkEmbeddingsWithRuntime(parsed);
    return toJsonResponse(buildRagBackfillRouteResult(result));
  } catch (error) {
    return ragBackfillErrorResponse(error);
  }
};

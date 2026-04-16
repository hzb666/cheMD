import { exportNormalizedJson } from "../../../../server/chem/json-export";
import {
  parseJsonObjectBody,
  readOptionalTrimmedString
} from "../../../../server/chem/request-parsers";
import { badRequest, errorResponse } from "../../../../server/chem/route-responses";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const body = await parseJsonObjectBody(request);
  const source = body ? readOptionalTrimmedString(body.source) : undefined;

  if (!source) {
    return badRequest("source must be a non-empty string", "E_INVALID_JSON_EXPORT_REQUEST");
  }

  try {
    const json = await exportNormalizedJson(source);
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return errorResponse(
      500,
      error instanceof Error ? error.message : "JSON export failed",
      { code: "E_JSON_EXPORT_FAILED" }
    );
  }
};

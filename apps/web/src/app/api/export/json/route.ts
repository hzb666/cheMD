import { exportNormalizedJson } from "../../../../server/chem/json-export";
import {
  isJsonContentType,
  parseJsonObjectBody,
  readOptionalTrimmedString
} from "../../../../server/chem/request-parsers";
import {
  badRequest,
  errorResponse,
  requestTooLarge,
  unsupportedMediaType
} from "../../../../server/chem/route-responses";

export const runtime = "nodejs";

const MAX_JSON_EXPORT_BODY_BYTES = 256 * 1024;
const MAX_JSON_EXPORT_SOURCE_CHARS = 240_000;

const readContentLength = (request: Request): number | null => {
  const rawValue = request.headers.get("Content-Length");
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
};

export const POST = async (request: Request): Promise<Response> => {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    return unsupportedMediaType("Content-Type must be application/json", "E_UNSUPPORTED_JSON_EXPORT_MEDIA_TYPE");
  }

  const contentLength = readContentLength(request);
  if (contentLength !== null && contentLength > MAX_JSON_EXPORT_BODY_BYTES) {
    return requestTooLarge("JSON export request body is too large", "E_JSON_EXPORT_TOO_LARGE");
  }

  const body = await parseJsonObjectBody(request);
  const source = body ? readOptionalTrimmedString(body.source) : undefined;

  if (!source) {
    return badRequest("source must be a non-empty string", "E_INVALID_JSON_EXPORT_REQUEST");
  }

  if (source.length > MAX_JSON_EXPORT_SOURCE_CHARS) {
    return requestTooLarge("source is too large", "E_JSON_EXPORT_SOURCE_TOO_LARGE");
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

import {
  MAX_DOCX_EXPORT_REQUEST_BYTES
} from "./config";
import {
  isJsonObjectBody,
  isJsonContentType,
  readOptionalTrimmedString,
  readRequestText
} from "../../../../server/chem/request-parsers";
import {
  badRequest,
  errorResponse,
  requestTooLarge,
  unsupportedMediaType
} from "../../../../server/chem/route-responses";
import { exportDocxDocument, type DocxExportRequest } from "../../../../server/chem/docx-export-service";

export const runtime = "nodejs";

const parseDocxExportRequest = async (
  request: Request
): Promise<DocxExportRequest | Response> => {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    return unsupportedMediaType("request content-type must be application/json", "E_UNSUPPORTED_MEDIA_TYPE");
  }

  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_DOCX_EXPORT_REQUEST_BYTES) {
      return requestTooLarge(`request body must be <= ${MAX_DOCX_EXPORT_REQUEST_BYTES} bytes`, "E_DOCX_EXPORT_REQUEST_TOO_LARGE");
    }
  }

  const rawBody = await readRequestText(request);
  if (rawBody === null) {
    return badRequest("invalid JSON payload", "E_INVALID_EXPORT_REQUEST");
  }

  const bodySize = new TextEncoder().encode(rawBody).length;
  if (bodySize > MAX_DOCX_EXPORT_REQUEST_BYTES) {
    return requestTooLarge(`request body must be <= ${MAX_DOCX_EXPORT_REQUEST_BYTES} bytes`, "E_DOCX_EXPORT_REQUEST_TOO_LARGE");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return badRequest("invalid JSON payload", "E_INVALID_EXPORT_REQUEST");
  }

  if (!isJsonObjectBody(body)) {
    return badRequest("request body must be a JSON object", "E_INVALID_EXPORT_REQUEST");
  }

  const source = readOptionalTrimmedString(body.source);
  if (!source) {
    return badRequest("source must be a non-empty string", "E_INVALID_EXPORT_REQUEST");
  }

  if (body.profileId !== undefined && typeof body.profileId !== "string") {
    return badRequest("profileId must be a string when provided", "E_INVALID_EXPORT_REQUEST");
  }

  if (body.fileName !== undefined && typeof body.fileName !== "string") {
    return badRequest("fileName must be a string when provided", "E_INVALID_EXPORT_REQUEST");
  }

  return {
    source,
    profileId: readOptionalTrimmedString(body.profileId),
    fileName: readOptionalTrimmedString(body.fileName)
  };
};

export const POST = async (request: Request): Promise<Response> => {
  try {
    const parsed = await parseDocxExportRequest(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    return exportDocxDocument(parsed);
  } catch (error) {
    return errorResponse(
      500,
      error instanceof Error ? error.message : "DOCX export failed",
      { code: "E_DOCX_EXPORT_FAILED" }
    );
  }
};

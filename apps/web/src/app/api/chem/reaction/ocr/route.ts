import { readErrorCode, readErrorMessage } from "../../../../../server/chem/chem-service-error";
import type { OcrWritebackInput } from "../../../../../server/chem/dto";
import { runReactionOcrWorkflow } from "../../../../../server/chem/ocr-workflow";
import {
  parseFormDataBody,
  readFormDataFile,
  readFormDataString,
  validateImageUpload
} from "../../../../../server/chem/request-parsers";
import {
  badRequest,
  errorResponse,
  toJsonResponse,
  upstreamFailure
} from "../../../../../server/chem/route-responses";
import { requireMatchingSessionToken } from "../../../../../server/chem/session-guard";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const parseReactionOcrInput = async (
  request: Request
): Promise<OcrWritebackInput | Response> => {
  const formData = await parseFormDataBody(request);
  if (!formData) {
    return badRequest("invalid form data");
  }

  const documentId = readFormDataString(formData, "documentId");
  const blockId = readFormDataString(formData, "blockId");
  const sessionId = readFormDataString(formData, "sessionId");
  const image = readFormDataFile(formData, "image");

  if (!documentId || !blockId || !sessionId) {
    return badRequest("documentId, blockId, and sessionId are required");
  }

  const imageIssue = validateImageUpload(image, MAX_UPLOAD_BYTES);
  if (imageIssue) {
    return errorResponse(imageIssue.status, imageIssue.message);
  }

  return {
    documentId,
    sessionId,
    image: image!,
    targets: {
      blockId
    }
  };
};

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  try {
    const parsed = await parseReactionOcrInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    return toJsonResponse(await runReactionOcrWorkflow(parsed));
  } catch (error) {
    return upstreamFailure(
      readErrorMessage(error, "reaction ocr failed"),
      502,
      readErrorCode(error)
    );
  }
};

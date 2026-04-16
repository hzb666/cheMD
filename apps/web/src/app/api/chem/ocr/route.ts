import { readErrorCode, readErrorMessage } from "../../../../server/chem/chem-service-error";
import type { OcrWritebackInput } from "../../../../server/chem/dto";
import { runReactionFirstOcrWorkflow } from "../../../../server/chem/ocr-workflow";
import {
  parseFormDataBody,
  readFormDataFile,
  readFormDataString,
  validateImageUpload
} from "../../../../server/chem/request-parsers";
import {
  badRequest,
  errorResponse,
  toJsonResponse,
  upstreamFailure
} from "../../../../server/chem/route-responses";
import { hasWritebackTarget } from "../../../../server/chem/reaction-target";
import { requireMatchingSessionToken } from "../../../../server/chem/session-guard";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const parseOcrRouteInput = async (
  request: Request
): Promise<OcrWritebackInput | Response> => {
  const formData = await parseFormDataBody(request);
  if (!formData) {
    return badRequest("invalid form data");
  }

  const documentId = readFormDataString(formData, "documentId");
  const sessionId = readFormDataString(formData, "sessionId");
  const image = readFormDataFile(formData, "image");
  const targets = {
    // blockId 优先兼容历史入口，fallbackBlockId 兜底，molecule/reactionBlockId 仅用于显式分流。
    blockId: readFormDataString(formData, "blockId"),
    fallbackBlockId: readFormDataString(formData, "fallbackBlockId"),
    moleculeBlockId: readFormDataString(formData, "moleculeBlockId"),
    reactionBlockId: readFormDataString(formData, "reactionBlockId")
  };

  if (!documentId || !sessionId || !hasWritebackTarget(targets)) {
    return badRequest("documentId, sessionId, and at least one block id are required");
  }

  const imageIssue = validateImageUpload(image, MAX_UPLOAD_BYTES);
  if (imageIssue) {
    return errorResponse(imageIssue.status, imageIssue.message);
  }

  return {
    documentId,
    sessionId,
    image: image!,
    targets
  };
};

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  try {
    const parsed = await parseOcrRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    return toJsonResponse(await runReactionFirstOcrWorkflow(parsed));
  } catch (error) {
    return upstreamFailure(
      readErrorMessage(error, "ocr failed"),
      502,
      readErrorCode(error)
    );
  }
};

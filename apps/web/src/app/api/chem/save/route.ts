import { isKnownCasResolutionError } from "../../../../server/chem/cas-error-guard";
import { readErrorCode, readErrorMessage } from "../../../../server/chem/chem-service-error";
import type { ParsedSaveRouteInput } from "../../../../server/chem/dto";
import {
  parseJsonObjectBody,
  readOptionalTrimmedString,
  readStringArray
} from "../../../../server/chem/request-parsers";
import {
  badRequest,
  errorResponse,
  toJsonResponse,
  upstreamFailure
} from "../../../../server/chem/route-responses";
import {
  saveMoleculeNotation,
  saveReactionNotation
} from "../../../../server/chem/render-save-service";
import { requireMatchingSessionToken } from "../../../../server/chem/session-guard";

export const runtime = "nodejs";

const parseSaveRouteInput = async (
  request: Request
): Promise<ParsedSaveRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const documentId = readOptionalTrimmedString(body.documentId);
  const blockId = readOptionalTrimmedString(body.blockId);
  const sessionId = readOptionalTrimmedString(body.sessionId);
  if (!documentId || !blockId || !sessionId) {
    return badRequest("documentId, blockId, and sessionId are required");
  }

  if (body.type === "reaction") {
    const reactants = readStringArray(body.reactants);
    const products = readStringArray(body.products);
    const conditions = body.conditions === undefined ? [] : readStringArray(body.conditions);

    if (!reactants || !products || conditions === null) {
      return badRequest("reactants, products, and conditions must be string arrays");
    }

    return {
      documentId,
      blockId,
      sessionId,
      type: "reaction",
      reactants,
      products,
      conditions: conditions ?? [],
      reactionSmiles: readOptionalTrimmedString(body.reactionSmiles),
      rxnfile: readOptionalTrimmedString(body.rxnfile)
    };
  }

  if (body.type !== "molecule") {
    return badRequest("type must be molecule or reaction");
  }

  const smiles = readOptionalTrimmedString(body.smiles);
  const molfile = readOptionalTrimmedString(body.molfile);
  if (!smiles && !molfile) {
    return badRequest("smiles or molfile is required");
  }

  return {
    documentId,
    blockId,
    sessionId,
    type: "molecule",
    smiles,
    molfile
  };
};

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  try {
    const parsed = await parseSaveRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const result =
      parsed.type === "reaction"
        ? await saveReactionNotation(parsed)
        : await saveMoleculeNotation(parsed);

    return toJsonResponse(result);
  } catch (error) {
    if (isKnownCasResolutionError(error)) {
      return errorResponse(error.status, error.message, { code: error.code });
    }

    return upstreamFailure(
      readErrorMessage(error, "save chemd failed"),
      502,
      readErrorCode(error)
    );
  }
};

import { isCasResolutionError } from "../../../../server/chem/cas-resolver";
import { readErrorCode } from "../../../../server/chem/chem-service-error";
import type { ParsedRenderRouteInput } from "../../../../server/chem/dto";
import {
  parseJsonObjectBody,
  readOptionalObject,
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
  renderMoleculeNotation,
  renderReactionNotation
} from "../../../../server/chem/render-save-service";

export const runtime = "nodejs";

const parseRenderRouteInput = async (
  request: Request
): Promise<ParsedRenderRouteInput | Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  if (body.type === "reaction") {
    const reactants = readStringArray(body.reactants, { allowEmptyArray: false });
    const products = readStringArray(body.products, { allowEmptyArray: false });
    const conditions = body.conditions === undefined ? [] : readStringArray(body.conditions);

    if (!reactants || !products) {
      return badRequest("reactants and products must be string arrays");
    }

    if (body.conditions !== undefined && conditions === null) {
      return badRequest("conditions must be a string array when provided");
    }

    return {
      type: "reaction",
      reactants,
      products,
      conditions: conditions ?? [],
      renderOptions: readOptionalObject(body.renderOptions)
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
    type: "molecule",
    smiles,
    molfile,
    renderOptions: readOptionalObject(body.renderOptions)
  };
};

export const POST = async (request: Request): Promise<Response> => {
  try {
    const parsed = await parseRenderRouteInput(request);
    if (parsed instanceof Response) {
      return parsed;
    }

    const result =
      parsed.type === "reaction"
        ? await renderReactionNotation(parsed)
        : await renderMoleculeNotation(parsed);

    return toJsonResponse(result);
  } catch (error) {
    if (isCasResolutionError(error)) {
      return errorResponse(error.status, error.message, { code: error.code });
    }

    return upstreamFailure(
      error instanceof Error ? error.message : "render failed",
      502,
      readErrorCode(error)
    );
  }
};

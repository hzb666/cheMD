import { callChemServiceNormalize } from "../../../../server/chem/chem-service-client";
import {
  parseJsonObjectBody,
  readOptionalTrimmedString
} from "../../../../server/chem/request-parsers";
import { badRequest, upstreamFailure } from "../../../../server/chem/route-responses";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body) {
    return badRequest("invalid request body");
  }

  const smiles = readOptionalTrimmedString(body.smiles);
  const molfile = readOptionalTrimmedString(body.molfile);

  if (!smiles && !molfile) {
    return badRequest("smiles or molfile is required");
  }

  try {
    return Response.json(await callChemServiceNormalize({ smiles, molfile }));
  } catch (error) {
    return upstreamFailure(error instanceof Error ? error.message : "normalize failed");
  }
};

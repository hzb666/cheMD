import {
  parseJsonObjectBody,
  readOptionalTrimmedString,
  readStringArray
} from "@/server/chem/request-parsers";
import { badRequest } from "@/server/chem/route-responses";
import {
  lookupMoleculeInventory,
  lookupReactionInventory
} from "@/server/chem/inventory-service";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const body = await parseJsonObjectBody(request);
  if (!body || (body.type !== "molecule" && body.type !== "reaction")) {
    return badRequest("type must be molecule or reaction");
  }

  if (body.type === "molecule") {
    const smiles = readOptionalTrimmedString(body.smiles);
    if (!smiles) {
      return badRequest("smiles is required");
    }

    return Response.json({
      type: "molecule",
      item: await lookupMoleculeInventory(smiles)
    });
  }

  const reactants = readStringArray(body.reactants, { allowEmptyArray: false });
  if (!reactants) {
    return badRequest("reactants must be a non-empty string array");
  }

  return Response.json({
    type: "reaction",
    items: await lookupReactionInventory(reactants)
  });
};

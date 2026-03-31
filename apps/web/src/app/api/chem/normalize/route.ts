import { NextResponse } from "next/server";

import { callChemServiceNormalize } from "../../../../server/chem/chem-service-client";
import { mapNormalizeResponse } from "../../../../server/chem/mappers/map-normalize-response";

export const runtime = "nodejs";

interface NormalizeRequestBody {
  smiles?: unknown;
  molfile?: unknown;
}

/**
 * POST /api/chem/normalize
 *
 * Accepts JSON body with optional `smiles` and/or `molfile` fields.
 * Proxies to the Python chem-service `/normalize` endpoint.
 */
export const POST = async (request: Request): Promise<Response> => {
  let body: NormalizeRequestBody;
  try {
    body = (await request.json()) as NormalizeRequestBody;
  } catch {
    return NextResponse.json({ code: "E_INVALID_JSON", message: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.smiles !== "string" && typeof body.molfile !== "string") {
    return NextResponse.json(
      { code: "E_MISSING_STRUCTURE", message: "Provide at least one of: smiles, molfile" },
      { status: 400 }
    );
  }

  try {
    const raw = await callChemServiceNormalize({
      smiles: typeof body.smiles === "string" ? body.smiles : undefined,
      molfile: typeof body.molfile === "string" ? body.molfile : undefined,
    });
    return NextResponse.json(mapNormalizeResponse(raw), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Normalize service unavailable";
    return NextResponse.json({ code: "E_NORMALIZE_FAILED", message }, { status: 502 });
  }
};

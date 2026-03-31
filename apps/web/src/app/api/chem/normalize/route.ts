import { NextResponse } from "next/server";

import { callChemServiceNormalize } from "../../../../server/chem/chem-service-client";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json().catch(() => null)) as
    | { smiles?: unknown; molfile?: unknown }
    | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "invalid request body" }, { status: 400 });
  }

  const smiles = typeof body.smiles === "string" ? body.smiles : undefined;
  const molfile = typeof body.molfile === "string" ? body.molfile : undefined;

  if (!smiles && !molfile) {
    return NextResponse.json({ message: "smiles or molfile is required" }, { status: 400 });
  }

  try {
    const normalized = await callChemServiceNormalize({ smiles, molfile });
    return NextResponse.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "normalize failed";
    return NextResponse.json({ message }, { status: 502 });
  }
};

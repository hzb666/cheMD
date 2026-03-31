import { NextResponse } from "next/server";

import { callChemServiceRender } from "../../../../server/chem/chem-service-client";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json().catch(() => null)) as
    | { kind?: unknown; smiles?: unknown; molfile?: unknown; renderOptions?: unknown }
    | null;

  if (!body || body.kind !== "molecule") {
    return NextResponse.json({ message: "kind must be molecule" }, { status: 400 });
  }

  const smiles = typeof body.smiles === "string" ? body.smiles : undefined;
  const molfile = typeof body.molfile === "string" ? body.molfile : undefined;

  if (!smiles && !molfile) {
    return NextResponse.json({ message: "smiles or molfile is required" }, { status: 400 });
  }

  try {
    const rendered = await callChemServiceRender({
      kind: "molecule",
      smiles,
      molfile,
      renderOptions:
        body.renderOptions && typeof body.renderOptions === "object"
          ? (body.renderOptions as Record<string, unknown>)
          : undefined
    });
    return NextResponse.json(rendered);
  } catch (error) {
    const message = error instanceof Error ? error.message : "render failed";
    return NextResponse.json({ message }, { status: 502 });
  }
};

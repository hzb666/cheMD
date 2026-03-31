import { NextResponse } from "next/server";

import { callChemServiceRender } from "../../../../server/chem/chem-service-client";
import { mapRenderResponse } from "../../../../server/chem/mappers/map-render-response";

export const runtime = "nodejs";

interface RenderRequestBody {
  kind?: unknown;
  smiles?: unknown;
  molfile?: unknown;
  renderOptions?: unknown;
}

/**
 * POST /api/chem/render
 *
 * Accepts JSON body with `kind`, optional `smiles`, `molfile`, and
 * `renderOptions`. Currently only `kind: "molecule"` is supported.
 *
 * Proxies to the Python chem-service `/render` endpoint.
 */
export const POST = async (request: Request): Promise<Response> => {
  let body: RenderRequestBody;
  try {
    body = (await request.json()) as RenderRequestBody;
  } catch {
    return NextResponse.json({ code: "E_INVALID_JSON", message: "Invalid JSON body" }, { status: 400 });
  }

  if (body.kind !== "molecule") {
    return NextResponse.json(
      { code: "E_UNSUPPORTED_KIND", message: 'Only kind "molecule" is supported' },
      { status: 400 }
    );
  }

  if (typeof body.smiles !== "string" && typeof body.molfile !== "string") {
    return NextResponse.json(
      { code: "E_MISSING_STRUCTURE", message: "Provide at least one of: smiles, molfile" },
      { status: 400 }
    );
  }

  try {
    const raw = await callChemServiceRender({
      smiles: typeof body.smiles === "string" ? body.smiles : undefined,
      molfile: typeof body.molfile === "string" ? body.molfile : undefined,
    });
    return NextResponse.json(mapRenderResponse(raw), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render service unavailable";
    return NextResponse.json({ code: "E_RENDER_FAILED", message }, { status: 502 });
  }
};

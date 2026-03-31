import { NextResponse } from "next/server";

import { callChemServiceRender } from "../../../../server/chem/chem-service-client";

export const runtime = "nodejs";

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (match) => HTML_ESCAPE_MAP[match]);

const buildFallbackSvg = (label: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120" role="img" aria-label="Chemical structure fallback visualization"><rect x="1" y="1" width="358" height="118" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="20" y="64" font-size="20" fill="#0f172a">${escapeHtml(label)}</text></svg>`;

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
    const fallbackLabel = smiles ?? "structure";
    const message = error instanceof Error ? error.message : "render failed";
    return NextResponse.json({
      svg: buildFallbackSvg(fallbackLabel),
      warnings: [`chem-service unavailable, fallback renderer used: ${message}`]
    });
  }
};

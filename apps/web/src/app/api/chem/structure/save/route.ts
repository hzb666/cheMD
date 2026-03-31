import { NextResponse } from "next/server";

import { callChemServiceNormalize } from "../../../../../server/chem/chem-service-client";
import { upsertStructureRecord } from "../../../../../server/chem/structure-store";

export const runtime = "nodejs";

interface SaveStructureRequestBody {
  documentId?: unknown;
  blockId?: unknown;
  molfile?: unknown;
  smiles?: unknown;
}

/**
 * POST /api/chem/structure/save
 *
 * Saves Ketcher's edited structure. Calls RDKit to normalize, updates the
 * in-memory cache, and returns the canonical smiles so the editor can write
 * it back to the document.
 */
export const POST = async (request: Request): Promise<Response> => {
  let body: SaveStructureRequestBody;
  try {
    body = (await request.json()) as SaveStructureRequestBody;
  } catch {
    return NextResponse.json({ code: "E_INVALID_JSON", message: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.documentId !== "string" || !body.documentId) {
    return NextResponse.json({ code: "E_MISSING_DOCUMENT_ID", message: "documentId is required" }, { status: 400 });
  }

  if (typeof body.blockId !== "string" || !body.blockId) {
    return NextResponse.json({ code: "E_MISSING_BLOCK_ID", message: "blockId is required" }, { status: 400 });
  }

  const hasMolfile = typeof body.molfile === "string" && body.molfile.trim().length > 0;
  const hasSmiles = typeof body.smiles === "string" && body.smiles.trim().length > 0;

  if (!hasMolfile && !hasSmiles) {
    return NextResponse.json(
      { code: "E_MISSING_STRUCTURE", message: "Provide at least one of: molfile, smiles" },
      { status: 400 }
    );
  }

  let canonicalSmiles = hasSmiles ? (body.smiles as string) : "";
  let normalizedMolfile: string | undefined = hasMolfile ? (body.molfile as string) : undefined;
  const warnings: string[] = [];

  try {
    const normalizeResult = await callChemServiceNormalize({
      smiles: hasSmiles ? (body.smiles as string) : undefined,
      molfile: hasMolfile ? (body.molfile as string) : undefined,
    });
    canonicalSmiles = normalizeResult.canonical_smiles || canonicalSmiles;
    normalizedMolfile = normalizeResult.normalized_molfile ?? normalizedMolfile;
    warnings.push(...normalizeResult.warnings);
  } catch {
    warnings.push("Normalize step failed – using provided smiles/molfile directly");
  }

  upsertStructureRecord({
    documentId: body.documentId as string,
    blockId: body.blockId as string,
    kind: "molecule",
    smiles: canonicalSmiles,
    molfile: normalizedMolfile,
    source: "ketcher",
  });

  return NextResponse.json(
    {
      blockId: body.blockId,
      smiles: canonicalSmiles,
      molfile: normalizedMolfile,
      warnings,
    },
    { status: 200 }
  );
};

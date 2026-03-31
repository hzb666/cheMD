import { type NextRequest, NextResponse } from "next/server";

import { getStructureRecord } from "../../../../server/chem/structure-store";

export const runtime = "nodejs";

/**
 * GET /api/chem/structure?documentId=...&blockId=...
 *
 * Returns the cached `StructureRecord` for the given document + block, if
 * one exists and has not expired.
 */
export const GET = (request: NextRequest): Response => {
  const { searchParams } = request.nextUrl;
  const documentId = searchParams.get("documentId");
  const blockId = searchParams.get("blockId");

  if (!documentId || !blockId) {
    return NextResponse.json(
      { code: "E_MISSING_PARAMS", message: "documentId and blockId are required" },
      { status: 400 }
    );
  }

  const record = getStructureRecord(documentId, blockId);

  if (!record) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  return NextResponse.json(
    {
      found: true,
      structure: {
        smiles: record.smiles,
        molfile: record.molfile,
        source: record.source,
        expiresAt: record.expiresAt,
      },
    },
    { status: 200 }
  );
};

import { NextResponse } from "next/server";

import { getStructureRecord } from "../../../../server/chem/structure-store";

export const runtime = "nodejs";

export const GET = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const documentId = url.searchParams.get("documentId");
  const blockId = url.searchParams.get("blockId");

  if (!documentId || !blockId) {
    return NextResponse.json({ message: "documentId and blockId are required" }, { status: 400 });
  }

  const record = getStructureRecord(documentId, blockId);
  if (!record) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    structure: {
      smiles: record.smiles,
      molfile: record.molfile,
      source: record.source,
      expiresAt: record.expiresAt
    }
  });
};

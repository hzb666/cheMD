import { NextResponse } from "next/server";

import { getStructureRecord } from "../../../../server/chem/structure-store";

export const runtime = "nodejs";

export const GET = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const documentId = url.searchParams.get("documentId");
  const blockId = url.searchParams.get("blockId");
  const sessionId = url.searchParams.get("sessionId");

  if (!documentId || !blockId || !sessionId) {
    return NextResponse.json({ message: "documentId, blockId, and sessionId are required" }, { status: 400 });
  }

  const record = await getStructureRecord(documentId, blockId, sessionId);
  if (!record) {
    return NextResponse.json({ found: false });
  }

  if (record.kind !== "molecule") {
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

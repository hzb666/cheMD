import { NextResponse } from "next/server";

import { getStructureRecord } from "../../../../../server/chem/structure-store";

export const runtime = "nodejs";

export const GET = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const documentId = url.searchParams.get("documentId");
  const blockId = url.searchParams.get("blockId");
  const sessionId = url.searchParams.get("sessionId");

  if (!documentId || !blockId || !sessionId) {
    return NextResponse.json(
      { message: "documentId, blockId, and sessionId are required" },
      { status: 400 }
    );
  }

  const record = getStructureRecord(documentId, blockId, sessionId);
  if (!record || record.kind !== "reaction") {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    reaction: {
      reactants: record.reactants,
      products: record.products,
      conditions: record.conditions ?? [],
      source: record.source,
      expiresAt: record.expiresAt
    }
  });
};

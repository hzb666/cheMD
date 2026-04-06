import { NextResponse } from "next/server";

import { callChemServiceNormalize } from "../../../../../server/chem/chem-service-client";
import { isCasResolutionError, resolveChemicalNotation } from "../../../../../server/chem/cas-resolver";
import { requireMatchingSessionToken } from "../../../../../server/chem/session-guard";
import { saveStructureRecord } from "../../../../../server/chem/structure-store";

export const runtime = "nodejs";

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  const body = (await request.json().catch(() => null)) as
    | { documentId?: unknown; blockId?: unknown; sessionId?: unknown; molfile?: unknown; smiles?: unknown }
    | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "invalid request body" }, { status: 400 });
  }

  if (
    typeof body.documentId !== "string"
    || typeof body.blockId !== "string"
    || typeof body.sessionId !== "string"
  ) {
    return NextResponse.json({ message: "documentId, blockId, and sessionId are required" }, { status: 400 });
  }

  const smiles = typeof body.smiles === "string" ? body.smiles : undefined;
  const molfile = typeof body.molfile === "string" ? body.molfile : undefined;

  if (!smiles && !molfile) {
    return NextResponse.json({ message: "smiles or molfile is required" }, { status: 400 });
  }

  try {
    const resolvedSmiles = smiles ? await resolveChemicalNotation(smiles) : undefined;
    const normalized = await callChemServiceNormalize({ smiles: resolvedSmiles, molfile });
    await saveStructureRecord({
      kind: "molecule",
      documentId: body.documentId,
      blockId: body.blockId,
      sessionId: body.sessionId,
      smiles: normalized.canonicalSmiles,
      molfile: normalized.normalizedMolfile,
      source: "ketcher"
    });

    return NextResponse.json({
      blockId: body.blockId,
      smiles: normalized.canonicalSmiles,
      molfile: normalized.normalizedMolfile,
      warnings: normalized.warnings
    });
  } catch (error) {
    if (isCasResolutionError(error)) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "save structure failed";
    return NextResponse.json({ message }, { status: 502 });
  }
};

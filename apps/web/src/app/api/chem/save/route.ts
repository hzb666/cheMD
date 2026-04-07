import { NextResponse } from "next/server";

import { callChemServiceNormalize } from "../../../../server/chem/chem-service-client";
import {
  isCasResolutionError,
  resolveChemicalNotation,
  resolveChemicalNotationList
} from "../../../../server/chem/cas-resolver";
import { requireMatchingSessionToken } from "../../../../server/chem/session-guard";
import { saveStructureRecord } from "../../../../server/chem/structure-store";

export const runtime = "nodejs";

const normalizeStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length === value.length ? items : null;
};

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        documentId?: unknown;
        blockId?: unknown;
        sessionId?: unknown;
        type?: unknown;
        smiles?: unknown;
        molfile?: unknown;
        reactants?: unknown;
        products?: unknown;
        conditions?: unknown;
        reactionSmiles?: unknown;
        rxnfile?: unknown;
      }
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

  try {
    if (body.type === "reaction") {
      const reactants = normalizeStringArray(body.reactants);
      const products = normalizeStringArray(body.products);
      const conditions = body.conditions === undefined ? [] : normalizeStringArray(body.conditions);

      if (!reactants || !products || conditions === null) {
        return NextResponse.json(
          { message: "reactants, products, and conditions must be string arrays" },
          { status: 400 }
        );
      }

      const [resolvedReactants, resolvedProducts] = await Promise.all([
        resolveChemicalNotationList(reactants),
        resolveChemicalNotationList(products)
      ]);

      await saveStructureRecord({
        kind: "reaction",
        documentId: body.documentId,
        blockId: body.blockId,
        sessionId: body.sessionId,
        reactants: resolvedReactants,
        products: resolvedProducts,
        conditions,
        reactionSmiles:
          typeof body.reactionSmiles === "string" && body.reactionSmiles.trim().length > 0
            ? body.reactionSmiles.trim()
            : undefined,
        rxnfile:
          typeof body.rxnfile === "string" && body.rxnfile.trim().length > 0
            ? body.rxnfile.trim()
            : undefined,
        source: "ketcher"
      });

      return NextResponse.json({
        blockId: body.blockId,
        type: "reaction",
        reactants: resolvedReactants,
        products: resolvedProducts,
        conditions,
        reactionSmiles:
          typeof body.reactionSmiles === "string" && body.reactionSmiles.trim().length > 0
            ? body.reactionSmiles.trim()
            : undefined,
        rxnfile:
          typeof body.rxnfile === "string" && body.rxnfile.trim().length > 0
            ? body.rxnfile.trim()
            : undefined
      });
    }

    if (body.type !== "molecule") {
      return NextResponse.json({ message: "type must be molecule or reaction" }, { status: 400 });
    }

    const smiles = typeof body.smiles === "string" ? body.smiles : undefined;
    const molfile = typeof body.molfile === "string" ? body.molfile : undefined;

    if (!smiles && !molfile) {
      return NextResponse.json({ message: "smiles or molfile is required" }, { status: 400 });
    }

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
      type: "molecule",
      smiles: normalized.canonicalSmiles,
      molfile: normalized.normalizedMolfile,
      warnings: normalized.warnings
    });
  } catch (error) {
    if (isCasResolutionError(error)) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "save chemd failed";
    return NextResponse.json({ message }, { status: 502 });
  }
};

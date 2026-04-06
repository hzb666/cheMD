import { NextResponse } from "next/server";

import {
  isCasResolutionError,
  resolveChemicalNotationList
} from "../../../../../server/chem/cas-resolver";
import { requireMatchingSessionToken } from "../../../../../server/chem/session-guard";
import { saveStructureRecord } from "../../../../../server/chem/structure-store";

export const runtime = "nodejs";

const normalizeStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length === value.length ? items : null;
};

const normalizeOptionalStringArray = (value: unknown): string[] | null => {
  if (value === undefined) {
    return [];
  }

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
    return NextResponse.json(
      { message: "documentId, blockId, and sessionId are required" },
      { status: 400 }
    );
  }

  const reactants = normalizeStringArray(body.reactants);
  const products = normalizeStringArray(body.products);
  const conditions = normalizeOptionalStringArray(body.conditions);

  if (!reactants) {
    return NextResponse.json(
      { message: "reactants must be a non-empty string array" },
      { status: 400 }
    );
  }

  if (!products) {
    return NextResponse.json(
      { message: "products must be a non-empty string array" },
      { status: 400 }
    );
  }

  if (conditions === null) {
    return NextResponse.json(
      { message: "conditions must be a string array when provided" },
      { status: 400 }
    );
  }

  try {
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
  } catch (error) {
    if (isCasResolutionError(error)) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "reaction save failed";
    return NextResponse.json({ message }, { status: 502 });
  }
};

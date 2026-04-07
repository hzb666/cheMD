import { NextResponse } from "next/server";
import { classifyReactionConditions } from "@chemd/core";

import {
  callChemServiceNormalize,
  callChemServiceRender,
  callChemServiceReactionRender
} from "../../../../server/chem/chem-service-client";
import {
  isCasResolutionError,
  resolveChemicalNotation,
  resolveChemicalNotationList
} from "../../../../server/chem/cas-resolver";

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

const joinSide = (values: string[]): string => values.join(" + ");

const buildReactionFallbackSvg = (
  reactants: string[],
  products: string[],
  conditions: string[]
): string => {
  const reactionLabel = `${joinSide(reactants)} -> ${joinSide(products)}`;
  const conditionsLabel = conditions.length > 0 ? `Conditions: ${conditions.join(" | ")}` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 140" role="img" aria-label="Reaction fallback visualization"><rect x="1" y="1" width="538" height="138" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="20" y="64" font-size="20" fill="#0f172a">${escapeHtml(reactionLabel)}</text><text x="20" y="96" font-size="14" fill="#475569">${escapeHtml(conditionsLabel)}</text></svg>`;
};

const isOptionalStringArray = (value: unknown): value is string[] =>
  value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0));

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json().catch(() => null)) as
    | {
        type?: unknown;
        smiles?: unknown;
        molfile?: unknown;
        reactants?: unknown;
        products?: unknown;
        conditions?: unknown;
        renderOptions?: unknown;
      }
    | null;

  if (!body || (body.type !== "molecule" && body.type !== "reaction")) {
    return NextResponse.json({ message: "type must be molecule or reaction" }, { status: 400 });
  }

  if (body.type === "reaction") {
    if (!isStringArray(body.reactants) || !isStringArray(body.products)) {
      return NextResponse.json({ message: "reactants and products must be string arrays" }, { status: 400 });
    }

    if (!isOptionalStringArray(body.conditions)) {
      return NextResponse.json({ message: "conditions must be a string array when provided" }, { status: 400 });
    }

    const reactants = body.reactants.map((item) => item.trim());
    const products = body.products.map((item) => item.trim());
    const conditions = (body.conditions ?? []).map((item) => item.trim());

    try {
      const [resolvedReactants, resolvedProducts] = await Promise.all([
        resolveChemicalNotationList(reactants),
        resolveChemicalNotationList(products)
      ]);
      const rendered = await callChemServiceReactionRender({
        kind: "reaction",
        reactants: resolvedReactants,
        products: resolvedProducts,
        conditions,
        renderOptions:
          body.renderOptions && typeof body.renderOptions === "object"
            ? (body.renderOptions as Record<string, unknown>)
            : undefined
      });

      return NextResponse.json({
        ...rendered,
        type: "reaction",
        reaction: rendered.reaction ?? {
          reactants: resolvedReactants,
          products: resolvedProducts,
          conditions
        },
        normalized_conditions:
          rendered.normalized_conditions ?? classifyReactionConditions({ conditions })
      });
    } catch (error) {
      if (isCasResolutionError(error)) {
        return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
      }

      const message = error instanceof Error ? error.message : "render failed";
      return NextResponse.json({
        type: "reaction",
        svg: buildReactionFallbackSvg(reactants, products, conditions),
        warnings: [`chem-service unavailable, fallback renderer used: ${message}`],
        reaction: { reactants, products, conditions },
        normalized_conditions: classifyReactionConditions({ conditions })
      });
    }
  }

  const smiles = typeof body.smiles === "string" ? body.smiles : undefined;
  const molfile = typeof body.molfile === "string" ? body.molfile : undefined;

  if (!smiles && !molfile) {
    return NextResponse.json({ message: "smiles or molfile is required" }, { status: 400 });
  }

  try {
    const resolvedSmiles = smiles ? await resolveChemicalNotation(smiles) : undefined;
    const normalized = await callChemServiceNormalize({ smiles: resolvedSmiles, molfile });
    const rendered = await callChemServiceRender({
      kind: "molecule",
      smiles: normalized.canonicalSmiles || undefined,
      molfile: normalized.normalizedMolfile,
      renderOptions:
        body.renderOptions && typeof body.renderOptions === "object"
          ? (body.renderOptions as Record<string, unknown>)
          : undefined
    });
    return NextResponse.json({
      ...rendered,
      type: "molecule",
      canonicalSmiles: normalized.canonicalSmiles,
      normalizedMolfile: normalized.normalizedMolfile,
      warnings: [...(normalized.warnings ?? []), ...(rendered.warnings ?? [])]
    });
  } catch (error) {
    if (isCasResolutionError(error)) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }

    const fallbackLabel = smiles ?? "structure";
    const message = error instanceof Error ? error.message : "render failed";
    return NextResponse.json({
      type: "molecule",
      svg: buildFallbackSvg(fallbackLabel),
      warnings: [`chem-service unavailable, fallback renderer used: ${message}`]
    });
  }
};

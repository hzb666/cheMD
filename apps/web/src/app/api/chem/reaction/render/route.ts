import { NextResponse } from "next/server";
import { classifyReactionConditions } from "@chemd/core";

import {
  isCasResolutionError,
  resolveChemicalNotationList
} from "../../../../../server/chem/cas-resolver";
import { callChemServiceReactionRender } from "../../../../../server/chem/chem-service-client";
import type { ReactionPayload, ReactionRenderResponse } from "../../../../../server/chem/dto";

export const runtime = "nodejs";

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (match) => HTML_ESCAPE_MAP[match]);

const joinSide = (values: string[]): string => values.join(" + ");

const buildFallbackSvg = (
  reactants: string[],
  products: string[],
  conditions: string[]
): string => {
  const reactionLabel = `${joinSide(reactants)} -> ${joinSide(products)}`;
  const conditionsLabel = conditions.length > 0 ? `Conditions: ${conditions.join(" | ")}` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 140" role="img" aria-label="Reaction fallback visualization"><rect x="1" y="1" width="538" height="138" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="20" y="64" font-size="20" fill="#0f172a">${escapeHtml(reactionLabel)}</text><text x="20" y="96" font-size="14" fill="#475569">${escapeHtml(conditionsLabel)}</text></svg>`;
};

const buildReactionPayload = (
  reactants: string[],
  products: string[],
  conditions: string[]
): ReactionPayload => ({
  reactants,
  products,
  conditions
});

const isNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);

const isOptionalStringArray = (value: unknown): value is string[] =>
  value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0));

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json().catch(() => null)) as
    | {
        reactants?: unknown;
        products?: unknown;
        conditions?: unknown;
        renderOptions?: unknown;
      }
    | null;

  if (!body || !isNonEmptyStringArray(body.reactants) || !isNonEmptyStringArray(body.products)) {
    return NextResponse.json({ message: "reactants and products must be non-empty string arrays" }, { status: 400 });
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
    const reaction = buildReactionPayload(resolvedReactants, resolvedProducts, conditions);
    const normalizedConditions = classifyReactionConditions({ conditions });
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
    const payload: ReactionRenderResponse = {
      ...rendered,
      renderer: rendered.renderer ?? "chem-service",
      reaction: rendered.reaction ?? reaction,
      normalized_conditions: rendered.normalized_conditions ?? normalizedConditions
    };
    return NextResponse.json(payload);
  } catch (error) {
    if (isCasResolutionError(error)) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "render failed";
    const reaction = buildReactionPayload(reactants, products, conditions);
    const normalizedConditions = classifyReactionConditions({ conditions });
    return NextResponse.json({
      svg: buildFallbackSvg(reactants, products, conditions),
      warnings: [`chem-service unavailable, fallback renderer used: ${message}`],
      renderer: "fallback",
      reaction,
      normalized_conditions: normalizedConditions
    });
  }
};

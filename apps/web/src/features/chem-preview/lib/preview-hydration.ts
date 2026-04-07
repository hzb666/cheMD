import type { RenderOptions } from "@chemd/render-profile";

export interface RenderPayload {
  svg?: string;
  canonicalSmiles?: string;
  reaction?: {
    reactants?: unknown;
    products?: unknown;
    conditions?: unknown;
  };
}

export interface HydratedMoleculeEntry {
  blockId: string;
  smiles: string;
}

export interface HydratedReactionEntry {
  blockId: string;
  reactants: string[];
  products: string[];
  conditions: string[];
}

interface LoadHydratedMoleculeEntryOptions {
  documentId?: string;
  sessionId?: string;
  fetchImpl?: typeof fetch;
}

interface LoadHydratedReactionEntryOptions {
  documentId?: string;
  sessionId?: string;
  fetchImpl?: typeof fetch;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (match) => HTML_ESCAPE_MAP[match]);

export const buildMoleculeRenderRequestPayload = (
  entry: Pick<HydratedMoleculeEntry, "smiles"> & { molfile?: string },
  renderOptions?: RenderOptions
): {
  type: "molecule";
  smiles: string;
  molfile?: string;
  renderOptions?: RenderOptions;
} => ({
  type: "molecule",
  smiles: entry.smiles,
  ...(entry.molfile ? { molfile: entry.molfile } : {}),
  renderOptions
});

export const buildReactionRenderRequestPayload = (
  entry: Pick<HydratedReactionEntry, "reactants" | "products" | "conditions">,
  renderOptions?: RenderOptions
): {
  type: "reaction";
  reactants: string[];
  products: string[];
  conditions: string[];
  renderOptions?: RenderOptions;
} => ({
  type: "reaction",
  reactants: entry.reactants,
  products: entry.products,
  conditions: entry.conditions,
  renderOptions
});

export const parseMoleculeEntries = (html: string): Array<{ blockId: string; smiles: string }> => {
  const entries: Array<{ blockId: string; smiles: string }> = [];
  const blockPattern =
    /<section class="chemd-block chemd-block--molecule"[^>]*data-node-id="([^"]*)"[^>]*>[\s\S]*?<dt>SMILES<\/dt><dd>([^<]*)<\/dd>/g;
  for (const match of html.matchAll(blockPattern)) {
    entries.push({
      blockId: (match[1] || "").trim(),
      smiles: (match[2] || "").trim()
    });
  }
  return entries;
};

export const loadHydratedMoleculeEntry = async (
  entry: HydratedMoleculeEntry,
  { documentId, sessionId, fetchImpl = fetch }: LoadHydratedMoleculeEntryOptions
): Promise<{ smiles: string; molfile?: string }> => {
  if (!documentId || !sessionId || !entry.blockId) {
    return { smiles: entry.smiles };
  }

  try {
    const params = new URLSearchParams({
      documentId,
      blockId: entry.blockId,
      sessionId
    });
    const response = await fetchImpl(`/api/chem/draft?${params.toString()}`);
    if (!response.ok) {
      return { smiles: entry.smiles };
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          found?: boolean;
          draft?: {
            type?: unknown;
            smiles?: unknown;
            molfile?: unknown;
          };
        }
      | null;
    if (!payload?.found) {
      return { smiles: entry.smiles };
    }

    return {
      smiles:
        typeof payload.draft?.smiles === "string" && payload.draft.smiles.trim().length > 0
          ? payload.draft.smiles
          : entry.smiles,
      molfile:
        typeof payload.draft?.molfile === "string" && payload.draft.molfile.trim().length > 0
          ? payload.draft.molfile
          : undefined
    };
  } catch {
    return { smiles: entry.smiles };
  }
};

const splitListText = (value: string): string[] =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const parseReactionEntries = (html: string): Array<HydratedReactionEntry> => {
  const entries: Array<HydratedReactionEntry> = [];
  const blockPattern =
    /<section class="chemd-block chemd-block--reaction"[^>]*data-node-id="([^"]*)"[^>]*>([\s\S]*?)<\/section>/g;
  const readField = (blockHtml: string, label: string): string[] => {
    const fieldPattern = new RegExp(`<dt>${label}<\\/dt><dd>([^<]*)<\\/dd>`, "i");
    const match = blockHtml.match(fieldPattern);
    return splitListText(match?.[1] ?? "");
  };

  for (const match of html.matchAll(blockPattern)) {
    const blockHtml = match[2] || "";
    entries.push({
      blockId: (match[1] || "").trim(),
      reactants: readField(blockHtml, "Reactants"),
      products: readField(blockHtml, "Products"),
      conditions: readField(blockHtml, "Conditions")
    });
  }
  return entries;
};

export const loadHydratedReactionEntry = async (
  entry: HydratedReactionEntry,
  { documentId, sessionId, fetchImpl = fetch }: LoadHydratedReactionEntryOptions
): Promise<{ reactants: string[]; products: string[]; conditions: string[] }> => {
  if (!documentId || !sessionId || !entry.blockId) {
    return {
      reactants: entry.reactants,
      products: entry.products,
      conditions: entry.conditions
    };
  }

  try {
    const params = new URLSearchParams({
      documentId,
      blockId: entry.blockId,
      sessionId
    });
    const response = await fetchImpl(`/api/chem/draft?${params.toString()}`);
    if (!response.ok) {
      return {
        reactants: entry.reactants,
        products: entry.products,
        conditions: entry.conditions
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          found?: boolean;
          draft?: {
            type?: unknown;
            reactants?: unknown;
            products?: unknown;
            conditions?: unknown;
          };
        }
      | null;

    if (!payload?.found || payload.draft?.type !== "reaction") {
      return {
        reactants: entry.reactants,
        products: entry.products,
        conditions: entry.conditions
      };
    }

    const hasReactants = Array.isArray(payload.draft.reactants);
    const hasProducts = Array.isArray(payload.draft.products);
    if (!hasReactants || !hasProducts) {
      return {
        reactants: entry.reactants,
        products: entry.products,
        conditions: entry.conditions
      };
    }

    const reactants = Array.isArray(payload?.draft?.reactants)
      ? payload?.draft?.reactants.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];
    const products = Array.isArray(payload?.draft?.products)
      ? payload?.draft?.products.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];
    const conditions = Array.isArray(payload?.draft?.conditions)
      ? payload?.draft?.conditions.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];

    return {
      reactants,
      products,
      conditions
    };
  } catch {
    return {
      reactants: entry.reactants,
      products: entry.products,
      conditions: entry.conditions
    };
  }
};

export const replaceMoleculeGraphics = (html: string, svgs: string[]): string => {
  let index = 0;
  return html.replace(
    /(<section class="chemd-block chemd-block--molecule"[\s\S]*?<div class="chemd-graphic">)([\s\S]*?)(<\/div>)/g,
    (_, open, oldGraphic, close) => {
      const nextSvg = svgs[index] || "";
      index += 1;
      if (!nextSvg) {
        return `${open}${oldGraphic}${close}`;
      }
      return `${open}${nextSvg}${close}`;
    }
  );
};

export const replaceReactionGraphics = (html: string, svgs: string[]): string => {
  let index = 0;
  return html.replace(
    /(<section class="chemd-block chemd-block--reaction"[\s\S]*?<div class="chemd-graphic">)([\s\S]*?)(<\/div>)/g,
    (_, open, oldGraphic, close) => {
      const nextSvg = svgs[index] || "";
      index += 1;
      if (!nextSvg) {
        return `${open}${oldGraphic}${close}`;
      }
      return `${open}${nextSvg}${close}`;
    }
  );
};

const replaceFieldValue = (blockHtml: string, label: string, value: string): string =>
  blockHtml.replace(
    new RegExp(`(<dt>${label}</dt><dd>)([\\s\\S]*?)(</dd>)`),
    (_, open: string, __: string, close: string) => `${open}${escapeHtml(value)}${close}`
  );

export const replaceMoleculeFieldValues = (html: string, smilesValues: string[]): string => {
  let index = 0;
  return html.replace(/<section class="chemd-block chemd-block--molecule"[\s\S]*?<\/section>/g, (blockHtml) => {
    const nextSmiles = smilesValues[index];
    index += 1;
    if (!nextSmiles) {
      return blockHtml;
    }

    return replaceFieldValue(blockHtml, "SMILES", nextSmiles);
  });
};

export const replaceReactionFieldValues = (
  html: string,
  entries: Array<Pick<HydratedReactionEntry, "reactants" | "products" | "conditions">>
): string => {
  let index = 0;
  return html.replace(/<section class="chemd-block chemd-block--reaction"[\s\S]*?<\/section>/g, (blockHtml) => {
    const nextEntry = entries[index];
    index += 1;
    if (!nextEntry) {
      return blockHtml;
    }

    let nextHtml = replaceFieldValue(blockHtml, "Reactants", nextEntry.reactants.join(" | "));
    nextHtml = replaceFieldValue(nextHtml, "Products", nextEntry.products.join(" | "));
    nextHtml = replaceFieldValue(nextHtml, "Conditions", nextEntry.conditions.join(" | "));
    return nextHtml;
  });
};

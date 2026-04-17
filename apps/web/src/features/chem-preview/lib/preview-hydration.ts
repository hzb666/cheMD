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

interface DraftCachePayload {
  found?: boolean;
  draft?: {
    type?: unknown;
    smiles?: unknown;
    molfile?: unknown;
    reactants?: unknown;
    products?: unknown;
    conditions?: unknown;
  };
}

const DRAFT_REQUEST_TIMEOUT_MS = 5000;

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (match) => HTML_ESCAPE_MAP[match]);
const SECTION_ATTR_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g;

const readSectionAttributes = (sectionTag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const match of sectionTag.matchAll(SECTION_ATTR_PATTERN)) {
    attributes[match[1]] = match[2] ?? "";
  }
  return attributes;
};

const readSectionAttribute = (sectionTag: string, attributeName: string): string =>
  readSectionAttributes(sectionTag)[attributeName] ?? "";

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const withTransparentRenderOptions = (renderOptions?: RenderOptions): RenderOptions | undefined => {
  if (!renderOptions) {
    return undefined;
  }

  return {
    ...renderOptions,
    structure: {
      ...renderOptions.structure,
      backgroundColor: "#00000000"
    },
    export: {
      ...renderOptions.export,
      transparentBackground: true
    }
  };
};

const fetchWithTimeout = async (
  fetchImpl: typeof fetch,
  input: string,
  timeoutMs: number
): Promise<Response | undefined> => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, { signal: controller.signal });
  } catch {
    return undefined;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

const readDraftCachePayload = async (response: Response): Promise<DraftCachePayload | null> =>
  (await response.json().catch(() => null)) as DraftCachePayload | null;

const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const readStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

const readOptionalStringList = (value: unknown): string[] | null =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : null;

const fallbackReactionEntry = (
  entry: HydratedReactionEntry
): Pick<HydratedReactionEntry, "reactants" | "products" | "conditions"> => ({
  reactants: entry.reactants,
  products: entry.products,
  conditions: entry.conditions
});

const resolveMoleculeDraft = (
  entry: HydratedMoleculeEntry,
  payload: DraftCachePayload | null
): { smiles: string; molfile?: string } => ({
  smiles: readNonEmptyString(payload?.draft?.smiles) ?? entry.smiles,
  molfile: readNonEmptyString(payload?.draft?.molfile)
});

const resolveReactionDraft = (
  entry: HydratedReactionEntry,
  payload: DraftCachePayload | null
): Pick<HydratedReactionEntry, "reactants" | "products" | "conditions"> => {
  if (!payload?.found || payload.draft?.type !== "reaction") {
    return fallbackReactionEntry(entry);
  }

  const reactants = readOptionalStringList(payload.draft.reactants);
  const products = readOptionalStringList(payload.draft.products);
  if (!reactants || !products) {
    return fallbackReactionEntry(entry);
  }

  return {
    reactants,
    products,
    conditions: readStringList(payload.draft.conditions)
  };
};

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
  renderOptions: withTransparentRenderOptions(renderOptions)
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
  renderOptions: withTransparentRenderOptions(renderOptions)
});

export const parseMoleculeEntries = (html: string): Array<{ blockId: string; smiles: string }> => {
  const entries: Array<{ blockId: string; smiles: string }> = [];
  const blockPattern = /(<section class="chemd-block chemd-block--molecule"[^>]*>)([\s\S]*?)<\/section>/g;
  for (const match of html.matchAll(blockPattern)) {
    const sectionTag = match[1] || "";
    const blockHtml = match[2] || "";
    const dataSmiles = decodeHtmlEntities(readSectionAttribute(sectionTag, "data-smiles")).trim();
    const legacyFieldMatch = blockHtml.match(/<dt>SMILES<\/dt><dd>([^<]*)<\/dd>/i);
    entries.push({
      blockId: readSectionAttribute(sectionTag, "data-node-id").trim(),
      smiles: dataSmiles || (legacyFieldMatch?.[1] || "").trim()
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
    const response = await fetchWithTimeout(
      fetchImpl,
      `/api/chem/draft?${params.toString()}`,
      DRAFT_REQUEST_TIMEOUT_MS
    );
    if (!response?.ok) {
      return { smiles: entry.smiles };
    }

    const payload = await readDraftCachePayload(response);
    if (!payload?.found) {
      return { smiles: entry.smiles };
    }

    // Preview hydration 优先使用编辑器缓存里的结构，保证图形和刚保存的 draft 同步。
    return resolveMoleculeDraft(entry, payload);
  } catch {
    return { smiles: entry.smiles };
  }
};

const splitListText = (value: string): string[] =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const parseJsonStringArray = (value: string): string[] => {
  if (!value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeHtmlEntities(value)) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
};

export const parseReactionEntries = (html: string): Array<HydratedReactionEntry> => {
  const entries: Array<HydratedReactionEntry> = [];
  const blockPattern =
    /(<section class="chemd-block chemd-block--reaction"[^>]*>)([\s\S]*?)<\/section>/g;
  const readField = (blockHtml: string, label: string): string[] => {
    const fieldPattern = new RegExp(`<dt>${label}<\\/dt><dd>([^<]*)<\\/dd>`, "i");
    const match = blockHtml.match(fieldPattern);
    return splitListText(match?.[1] ?? "");
  };

  for (const match of html.matchAll(blockPattern)) {
    const sectionTag = match[1] || "";
    const blockHtml = match[2] || "";
    const dataReactants = parseJsonStringArray(readSectionAttribute(sectionTag, "data-reactants"));
    const dataProducts = parseJsonStringArray(readSectionAttribute(sectionTag, "data-products"));
    const dataConditions = parseJsonStringArray(readSectionAttribute(sectionTag, "data-conditions"));
    entries.push({
      blockId: readSectionAttribute(sectionTag, "data-node-id").trim(),
      reactants: dataReactants.length > 0 ? dataReactants : readField(blockHtml, "Reactants"),
      products: dataProducts.length > 0 ? dataProducts : readField(blockHtml, "Products"),
      conditions: dataConditions.length > 0 ? dataConditions : readField(blockHtml, "Conditions")
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
    const response = await fetchWithTimeout(
      fetchImpl,
      `/api/chem/draft?${params.toString()}`,
      DRAFT_REQUEST_TIMEOUT_MS
    );
    if (!response?.ok) {
      return fallbackReactionEntry(entry);
    }

    // Reaction hydration 需要 reactants/products 同时可用，避免把半截缓存写回 preview。
    return resolveReactionDraft(entry, await readDraftCachePayload(response));
  } catch {
    return fallbackReactionEntry(entry);
  }
};

export const replaceMoleculeGraphics = (html: string, svgs: string[]): string => {
  let index = 0;
  return html.replace(
    /(<section class="chemd-block chemd-block--molecule"[\s\S]*?<div class="chemd-graphic"[^>]*>)([\s\S]*?)(<\/div>)/g,
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
    /(<section class="chemd-block chemd-block--reaction"[\s\S]*?<div class="chemd-graphic"[^>]*>)([\s\S]*?)(<\/div>)/g,
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

const replaceSectionAttribute = (blockHtml: string, attributeName: string, value: string): string =>
  blockHtml.replace(
    /<section class="chemd-block chemd-block--[a-z-]+"[^>]*>/,
    (sectionTag) => {
      const encodedValue = escapeHtml(value);
      if (new RegExp(`${attributeName}="[^"]*"`).test(sectionTag)) {
        return sectionTag.replace(new RegExp(`${attributeName}="[^"]*"`), `${attributeName}="${encodedValue}"`);
      }
      return sectionTag.replace(/>$/, ` ${attributeName}="${encodedValue}">`);
    }
  );

export const replaceMoleculeFieldValues = (html: string, smilesValues: string[]): string => {
  let index = 0;
  return html.replace(/<section class="chemd-block chemd-block--molecule"[\s\S]*?<\/section>/g, (blockHtml) => {
    const nextSmiles = smilesValues[index];
    index += 1;
    if (!nextSmiles) {
      return blockHtml;
    }

    return replaceSectionAttribute(blockHtml, "data-smiles", nextSmiles);
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

    let nextHtml = replaceSectionAttribute(blockHtml, "data-reactants", JSON.stringify(nextEntry.reactants));
    nextHtml = replaceSectionAttribute(nextHtml, "data-products", JSON.stringify(nextEntry.products));
    nextHtml = replaceSectionAttribute(nextHtml, "data-conditions", JSON.stringify(nextEntry.conditions));
    return nextHtml;
  });
};

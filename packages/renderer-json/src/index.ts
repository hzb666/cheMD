import {
  classifyReactionConditions,
  classifyTlcAnalysis,
  type ChemdDocument,
  type ChemdNode,
  type InlineChemToken,
  type InlineCodeToken,
  type MarkdownLinkToken,
  type MarkdownNode,
  type ReferenceToken,
  type StructuredNode
} from "@chemd/core";

interface SerializedNodeEntry {
  type: string;
  value: unknown;
}

const ARRAY_ITEM_NAME_BY_KEY: Record<string, string> = {
  diagnostics: "diagnostic",
  tags: "tag",
  references: "reference",
  inlineChem: "inlineChem",
  inlineCode: "inlineCode",
  links: "link",
  reactants: "reactant",
  products: "product",
  conditions: "condition",
  params: "param",
  lanes: "lane",
  spots: "spot",
  mess_regions: "mess_region",
  normalized: "item"
};

const ARRAY_ITEM_NAME_BY_PATH: Record<string, string> = {
  "document.body.*.normalized_conditions.reagents.normalized": "reagent"
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePathSegment = (segment: string): string =>
  /^\d{2}_/.test(segment) ? "*" : segment;

const resolveArrayItemName = (path: string[]): string => {
  const normalizedPath = path.map((segment) => normalizePathSegment(segment)).join(".");
  const exactMatch = ARRAY_ITEM_NAME_BY_PATH[normalizedPath];
  if (exactMatch) {
    return exactMatch;
  }

  const key = path[path.length - 1];
  return ARRAY_ITEM_NAME_BY_KEY[key] ?? "item";
};

const objectifyArrays = (value: unknown, path: string[] = []): unknown => {
  if (Array.isArray(value)) {
    const itemName = resolveArrayItemName(path);
    const keyWidth = Math.max(2, String(value.length).length);

    return Object.fromEntries(
      value.map((item, index) => [
        `${String(index + 1).padStart(keyWidth, "0")}_${itemName}`,
        objectifyArrays(item, path)
      ])
    );
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        objectifyArrays(nestedValue, [...path, key])
      ])
    );
  }

  return value;
};

const stripTokenLocation = <
  T extends ReferenceToken | InlineChemToken | InlineCodeToken | MarkdownLinkToken
>(
  token: T
): Omit<T, "start" | "end" | "startLine" | "startColumn" | "endLine" | "endColumn"> => {
  const {
    start: _start,
    end: _end,
    startLine: _startLine,
    startColumn: _startColumn,
    endLine: _endLine,
    endColumn: _endColumn,
    ...rest
  } = token;

  return rest;
};

const serializeMarkdownNode = (node: MarkdownNode): SerializedNodeEntry => {
  const { type: _type, ...rest } = node;

  return {
    type: "markdown",
    value: {
      ...rest,
      references: node.references.map((token) => stripTokenLocation(token)),
      inlineChem: node.inlineChem.map((token) => stripTokenLocation(token)),
      inlineCode: node.inlineCode.map((token) => stripTokenLocation(token)),
      links: node.links.map((token) => stripTokenLocation(token))
    }
  };
};

const serializeStructuredNode = (
  node: Exclude<StructuredNode, { type: "col" }>
): SerializedNodeEntry => {
  const { type, ...rest } = node;

  if (node.type === "reaction") {
    return {
      type,
      value: {
        ...rest,
        normalized_conditions: classifyReactionConditions(node)
      }
    };
  }

  if (node.type === "analysis") {
    return {
      type,
      value: {
        ...rest,
        ...(node.type_name?.toLowerCase() === "tlc"
          ? {
              normalized_tlc: classifyTlcAnalysis(node)
            }
          : {})
      }
    };
  }

  if (node.type === "template") {
    return {
      type,
      value: {
        ...rest,
        body: serializeBody(node.body)
      }
    };
  }

  return {
    type,
    value: rest
  };
};

const serializeNode = (node: ChemdNode): SerializedNodeEntry[] => {
  if (node.type === "markdown") {
    return [serializeMarkdownNode(node)];
  }

  if (node.type === "col") {
    return node.children.flatMap((child) => serializeNode(child));
  }

  return [serializeStructuredNode(node)];
};

const serializeBody = (nodes: ChemdNode[]): Record<string, unknown> => {
  const entries = nodes.flatMap((node) => serializeNode(node));
  const keyWidth = Math.max(2, String(entries.length).length);

  return Object.fromEntries(
    entries.map((entry, index) => [
      `${String(index + 1).padStart(keyWidth, "0")}_${entry.type}`,
      entry.value
    ])
  );
};

export const renderJson = (document: ChemdDocument): string =>
  JSON.stringify(
    objectifyArrays({
      document: {
        meta: document.meta,
        body: serializeBody(document.children)
      },
      diagnostics: document.diagnostics
    }),
    null,
    2
  );

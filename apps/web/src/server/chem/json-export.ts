import {
  classifyReactionConditions,
  type ChemdDocument,
  type ChemdNode,
  type ColNode,
  classifyTlcAnalysis,
  type InlineChemToken,
  type InlineCodeToken,
  type MarkdownLinkToken,
  type MarkdownNode,
  type MoleculeNode,
  type ReactionNode,
  type ReferenceToken,
  type StructuredNode,
  type TemplateNode
} from "@chemd/core";
import { compileChemd } from "@chemd/compiler";

import { resolveChemicalNotation, resolveChemicalNotationList } from "./cas-resolver";

interface JsonExportOptions {
  fetchImpl?: typeof fetch;
}

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

const resolveChemStringSafely = async (
  value: string,
  options: JsonExportOptions
): Promise<string> => {
  try {
    // 单个 CAS 解析失败时回退原值，避免整份 JSON 导出中断。
    return await resolveChemicalNotation(value, options);
  } catch {
    return value.trim();
  }
};

const resolveChemStringListSafely = async (
  values: string[] | undefined,
  options: JsonExportOptions
): Promise<string[] | undefined> => {
  if (!values || values.length === 0) {
    return values;
  }

  try {
    return await resolveChemicalNotationList(values, options);
  } catch {
    // 批量解析失败时降级逐项解析，最差回退 trim 后原值。
    return Promise.all(values.map((value) => resolveChemStringSafely(value, options)));
  }
};

const normalizeMoleculeNodeForJson = async (
  node: MoleculeNode,
  options: JsonExportOptions
): Promise<MoleculeNode> => ({
  ...node,
  smiles:
    typeof node.smiles === "string" && node.smiles.trim().length > 0
      ? await resolveChemStringSafely(node.smiles, options)
      : node.smiles
});

const normalizeReactionNodeForJson = async (
  node: ReactionNode,
  options: JsonExportOptions
): Promise<ReactionNode> => {
  const [reactants, products] = await Promise.all([
    resolveChemStringListSafely(node.reactants, options),
    resolveChemStringListSafely(node.products, options)
  ]);

  return {
    ...node,
    reactants,
    products
  };
};

const normalizeStructuredNodeForJson = async (
  node: StructuredNode,
  options: JsonExportOptions
): Promise<StructuredNode> => {
  if (node.type === "molecule") {
    return normalizeMoleculeNodeForJson(node, options);
  }

  if (node.type === "reaction") {
    return normalizeReactionNodeForJson(node, options);
  }

  if (node.type === "template") {
    return {
      ...node,
      body: await Promise.all(node.body.map((child) => normalizeNodeForJson(child, options)))
    } satisfies TemplateNode;
  }

  if (node.type === "col") {
    return {
      ...node,
      children: await Promise.all(node.children.map((child) => normalizeNodeForJson(child, options)))
    } satisfies ColNode;
  }

  return node;
};

const normalizeNodeForJson = async (
  node: ChemdNode,
  options: JsonExportOptions
): Promise<ChemdNode> =>
  node.type === "markdown" ? node : normalizeStructuredNodeForJson(node, options);

export const normalizeDocumentForJson = async (
  document: ChemdDocument,
  options: JsonExportOptions = {}
): Promise<ChemdDocument> => ({
  ...document,
  children: await Promise.all(document.children.map((child) => normalizeNodeForJson(child, options)))
});

const serializeReactionNodeForJson = (node: ReactionNode): unknown => {
  const { type: _type, ...rest } = node;

  return {
    ...rest,
    // 导出补齐 normalized_conditions，固定消费端字段契约。
    normalized_conditions: classifyReactionConditions(node)
  };
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

const serializeMarkdownNodeForJson = (node: MarkdownNode): SerializedNodeEntry => {
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
      value: serializeReactionNodeForJson(node)
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
    return [serializeMarkdownNodeForJson(node)];
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

export const exportNormalizedJson = async (
  source: string,
  options: JsonExportOptions = {}
): Promise<string> => {
  const compileResult = compileChemd(source);
  const document = await normalizeDocumentForJson(compileResult.document, options);
  return JSON.stringify(
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
};

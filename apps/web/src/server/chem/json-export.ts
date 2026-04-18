import type {
  ChemdDocument,
  ChemdNode,
  ColNode,
  MoleculeNode,
  ReactionNode,
  StructuredNode,
  TemplateNode
} from "@chemd/core";
import { compileChemd, renderCompiledJson } from "@chemd/compiler";

import { resolveChemicalNotation, resolveChemicalNotationList } from "./cas-resolver";

interface JsonExportOptions {
  fetchImpl?: typeof fetch;
}

type JsonTypedGraph = ReturnType<typeof compileChemd>["typedSemanticGraph"];
type JsonTypedNode = JsonTypedGraph["nodes"][number];
type JsonReactionNode = Extract<JsonTypedNode, { kind: "reaction" }>;
type JsonReactionValue = JsonReactionNode["reactants"][number];

interface NormalizedNodeFields {
  smiles?: string;
  reactants?: string[];
  products?: string[];
}

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
): Promise<MoleculeNode> => {
  const sourceNotation =
    typeof node.smiles === "string" && node.smiles.trim().length > 0
      ? node.smiles
      : node.cas;

  return {
    ...node,
    smiles:
      typeof sourceNotation === "string" && sourceNotation.trim().length > 0
        ? await resolveChemStringSafely(sourceNotation, options)
        : node.smiles
  };
};

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

const collectNormalizedFields = (
  nodes: ChemdNode[],
  output = new Map<string, NormalizedNodeFields>()
): Map<string, NormalizedNodeFields> => {
  for (const node of nodes) {
    if (node.type === "molecule" && node.id) {
      output.set(node.id, { smiles: node.smiles });
    } else if (node.type === "reaction" && node.id) {
      output.set(node.id, { reactants: node.reactants, products: node.products });
    } else if (node.type === "template") {
      collectNormalizedFields(node.body, output);
    } else if (node.type === "col") {
      collectNormalizedFields(node.children, output);
    }
  }

  return output;
};

const updateLiteralValues = (
  values: JsonReactionValue[],
  normalizedValues: string[] | undefined
) =>
  Array.isArray(values)
    ? values.map((value, index) =>
        value?.kind === "literal" && normalizedValues?.[index]
          ? { ...value, raw: normalizedValues[index] }
          : value
      )
    : values;

const normalizeTypedNodeForJson = (
  node: JsonTypedNode,
  normalizedById: Map<string, NormalizedNodeFields>
): JsonTypedNode => {
  const normalized = normalizedById.get(node.nodeId);
  if (!normalized) {
    return node;
  }

  if (node.kind === "molecule") {
    return { ...node, smiles: normalized.smiles };
  }

  if (node.kind === "reaction") {
    return {
      ...node,
      reactants: updateLiteralValues(node.reactants, normalized.reactants),
      products: updateLiteralValues(node.products, normalized.products)
    };
  }

  return node;
};

const normalizeTypedGraphForJson = (
  typedGraph: JsonTypedGraph,
  document: ChemdDocument
): JsonTypedGraph => {
  // JSON export resolves CAS aliases after compile, so keep literal typedGraph values in sync.
  const normalizedById = collectNormalizedFields(document.children);

  return {
    ...typedGraph,
    nodes: typedGraph.nodes.map((node) => normalizeTypedNodeForJson(node, normalizedById))
  };
};

export const normalizeDocumentForJson = async (
  document: ChemdDocument,
  options: JsonExportOptions = {}
): Promise<ChemdDocument> => ({
  ...document,
  children: await Promise.all(document.children.map((child) => normalizeNodeForJson(child, options)))
});

export const exportNormalizedJson = async (
  source: string,
  options: JsonExportOptions = {}
): Promise<string> => {
  const compileResult = compileChemd(source, { strictChemdKind: true });
  const document = await normalizeDocumentForJson(compileResult.document, options);
  const typedGraph = normalizeTypedGraphForJson(compileResult.typedSemanticGraph, document);

  return renderCompiledJson(document, typedGraph);
};

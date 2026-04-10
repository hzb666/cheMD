import {
  classifyReactionConditions,
  type ChemdDocument,
  type ChemdNode,
  type ColNode,
  type MoleculeNode,
  type ReactionNode,
  type StructuredNode,
  type TemplateNode
} from "@chemd/core";
import { compileChemd } from "@chemd/compiler";

import { resolveChemicalNotation, resolveChemicalNotationList } from "./cas-resolver";

interface JsonExportOptions {
  fetchImpl?: typeof fetch;
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

const serializeReactionNodeForJson = (node: ReactionNode): unknown => ({
  ...node,
  // 导出补齐 normalized_conditions，固定消费端字段契约。
  normalized_conditions: classifyReactionConditions(node)
});

const serializeStructuredNode = (node: StructuredNode): unknown => {
  if (node.type === "reaction") {
    return serializeReactionNodeForJson(node);
  }

  if (node.type === "template") {
    return {
      ...node,
      body: node.body.map(serializeNode)
    };
  }

  if (node.type === "col") {
    return {
      ...node,
      children: node.children.map(serializeNode)
    };
  }

  return node;
};

const serializeNode = (node: ChemdNode): unknown =>
  node.type === "markdown" ? node : serializeStructuredNode(node);

export const exportNormalizedJson = async (
  source: string,
  options: JsonExportOptions = {}
): Promise<string> => {
  const compileResult = compileChemd(source);
  const document = await normalizeDocumentForJson(compileResult.document, options);
  return JSON.stringify(
    {
      document: {
        meta: document.meta,
        children: document.children.map(serializeNode)
      },
      diagnostics: document.diagnostics
    },
    null,
    2
  );
};

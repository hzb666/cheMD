import type {
  ChemdDeclaration,
  ChemdProgramDocument,
  ChemdStringValue,
  ChemdValue
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
type FieldDeclaration = Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>;

interface NormalizedNodeFields {
  smiles?: string;
  reactants?: Array<string | undefined>;
  products?: Array<string | undefined>;
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

const hasFields = (declaration: ChemdDeclaration): declaration is FieldDeclaration =>
  "fields" in declaration;

const readStringValue = (value: ChemdValue | undefined): string | undefined => {
  if (value?.type === "string") {
    return value.value;
  }
  if (value?.type === "identifier") {
    return value.name;
  }
  return undefined;
};

const createStringValue = (
  value: string,
  sourceValue: ChemdValue | undefined
): ChemdStringValue => ({
  ...(sourceValue?.sourceSpan ? { sourceSpan: sourceValue.sourceSpan } : {}),
  type: "string",
  raw: JSON.stringify(value),
  value
});

const withField = <T extends FieldDeclaration>(
  declaration: T,
  field: string,
  value: ChemdValue
): T => ({
  ...declaration,
  fields: {
    ...declaration.fields,
    [field]: value
  }
});

const readLiteralFieldItems = (
  value: ChemdValue | undefined
): Array<{ index: number; value: string }> => {
  if (!value) {
    return [];
  }
  if (value.type === "list") {
    return value.items.flatMap((item, index) => {
      const text = readStringValue(item);
      return text ? [{ index, value: text }] : [];
    });
  }
  const text = readStringValue(value);
  return text ? [{ index: 0, value: text }] : [];
};

const replaceLiteralFieldItems = (
  value: ChemdValue,
  normalizedByIndex: Map<number, string>
): ChemdValue => {
  if (value.type === "list") {
    return {
      ...value,
      items: value.items.map((item, index) =>
        normalizedByIndex.has(index)
          ? createStringValue(normalizedByIndex.get(index) as string, item)
          : item
      )
    };
  }
  return normalizedByIndex.has(0)
    ? createStringValue(normalizedByIndex.get(0) as string, value)
    : value;
};

const normalizeMoleculeDeclarationForJson = async (
  declaration: FieldDeclaration,
  options: JsonExportOptions
): Promise<FieldDeclaration> => {
  const sourceNotation =
    readStringValue(declaration.fields.smiles)?.trim()
    || readStringValue(declaration.fields.cas)?.trim();

  if (!sourceNotation) {
    return declaration;
  }

  const normalized = await resolveChemStringSafely(sourceNotation, options);
  return withField(
    declaration,
    "smiles",
    createStringValue(normalized, declaration.fields.smiles ?? declaration.fields.cas)
  );
};

const normalizeLiteralChemField = async (
  declaration: FieldDeclaration,
  field: "reactants" | "products",
  options: JsonExportOptions
): Promise<{
  declaration: FieldDeclaration;
  normalizedValues?: Array<string | undefined>;
}> => {
  const fieldValue = declaration.fields[field];
  const literalItems = readLiteralFieldItems(fieldValue);
  if (!fieldValue || literalItems.length === 0) {
    return { declaration };
  }

  const normalized = await resolveChemStringListSafely(
    literalItems.map((item) => item.value),
    options
  );
  const normalizedByIndex = new Map<number, string>();
  literalItems.forEach((item, itemIndex) => {
    const normalizedValue = normalized?.[itemIndex];
    if (normalizedValue) {
      normalizedByIndex.set(item.index, normalizedValue);
    }
  });

  const normalizedValues = fieldValue.type === "list"
    ? fieldValue.items.map((_, index) => normalizedByIndex.get(index))
    : [normalizedByIndex.get(0)];

  return {
    declaration: withField(declaration, field, replaceLiteralFieldItems(fieldValue, normalizedByIndex)),
    normalizedValues
  };
};

const normalizeReactionDeclarationForJson = async (
  declaration: FieldDeclaration,
  options: JsonExportOptions
): Promise<{ declaration: FieldDeclaration; normalized: NormalizedNodeFields }> => {
  const reactants = await normalizeLiteralChemField(declaration, "reactants", options);
  const products = await normalizeLiteralChemField(reactants.declaration, "products", options);

  return {
    declaration: products.declaration,
    normalized: {
      reactants: reactants.normalizedValues,
      products: products.normalizedValues
    }
  };
};

const normalizeDeclarationForJson = async (
  declaration: ChemdDeclaration,
  options: JsonExportOptions
): Promise<{ declaration: ChemdDeclaration; normalized?: NormalizedNodeFields }> => {
  if (!hasFields(declaration)) {
    return { declaration };
  }

  if (declaration.kind === "molecule") {
    const normalizedDeclaration = await normalizeMoleculeDeclarationForJson(declaration, options);
    return {
      declaration: normalizedDeclaration,
      normalized: {
        smiles: readStringValue(normalizedDeclaration.fields.smiles)
      }
    };
  }

  if (declaration.kind === "reaction") {
    return normalizeReactionDeclarationForJson(declaration, options);
  }

  return { declaration };
};

const collectNormalizedFields = (
  normalizedDeclarations: Array<{
    declaration: ChemdDeclaration;
    normalized?: NormalizedNodeFields;
  }>
): Map<string, NormalizedNodeFields> => {
  const output = new Map<string, NormalizedNodeFields>();
  for (const item of normalizedDeclarations) {
    if (item.normalized) {
      output.set(item.declaration.id, item.normalized);
    }
  }
  return output;
};

const updateLiteralValues = (
  values: JsonReactionValue[],
  normalizedValues: Array<string | undefined> | undefined
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
  normalizedById: Map<string, NormalizedNodeFields>
): JsonTypedGraph => {
  // JSON export resolves CAS aliases after compile, so keep literal typedGraph values in sync.
  return {
    ...typedGraph,
    nodes: typedGraph.nodes.map((node) => normalizeTypedNodeForJson(node, normalizedById))
  };
};

export const normalizeProgramForJson = async (
  program: ChemdProgramDocument,
  options: JsonExportOptions = {}
): Promise<{
  program: ChemdProgramDocument;
  normalizedById: Map<string, NormalizedNodeFields>;
}> => {
  const normalizedDeclarations = await Promise.all(
    program.declarations.map((declaration) => normalizeDeclarationForJson(declaration, options))
  );
  return {
    program: {
      ...program,
      declarations: normalizedDeclarations.map((item) => item.declaration)
    },
    normalizedById: collectNormalizedFields(normalizedDeclarations)
  };
};

export const exportNormalizedJson = async (
  source: string,
  options: JsonExportOptions = {}
): Promise<string> => {
  const compileResult = compileChemd(source);
  const { program, normalizedById } = await normalizeProgramForJson(compileResult.program, options);
  const typedGraph = normalizeTypedGraphForJson(compileResult.typedSemanticGraph, normalizedById);

  return renderCompiledJson(program, typedGraph);
};

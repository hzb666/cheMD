import {
  type AnalysisNode,
  type ChemdNode,
  type ColNode,
  type Diagnostic,
  type MoleculeNode,
  type ReactionNode,
  type ResultNode,
  type SampleNode,
  type StructuredNode,
  type UseNode
} from "@chemd/core";
import {
  collectImplicitChemdValue,
  parseKeyValueLines,
  pickFirstStringArray,
  pickFirstStringValue
} from "./parse-body-shared";

const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const SUPPORTED_BLOCK_TYPES = new Set(["chemd", "result", "analysis", "sample", "use", "col"]);

const parseColColumns = (
  blockType: string,
  headerArg: string | undefined,
  diagnostics: Diagnostic[]
): number => {
  const trimmed = headerArg?.trim() ?? "";
  const fallback = 1;

  if (blockType !== "col") {
    return fallback;
  }

  const matched = trimmed.match(/^(\d+)$/);
  const columns = matched ? Number.parseInt(matched[1], 10) : Number.NaN;
  if (!Number.isFinite(columns) || columns < 1) {
    diagnostics.push({
      code: "W_INVALID_COL_COLUMNS",
      severity: "warning",
      message: `Invalid column count on col block: ${trimmed || "(empty)"}, fallback to 1`
    });
    return fallback;
  }

  return columns;
};

const parseUseBlock = (
  template: string,
  fields: Record<string, string | string[]>
): UseNode => ({
  type: "use",
  template,
  values: Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(" | ") : value])
  )
});

const parseColBlock = (
  blockType: string,
  headerArg: string | undefined,
  bodyChildren: ChemdNode[] | undefined,
  diagnostics: Diagnostic[]
): ColNode => {
  const columns = parseColColumns(blockType, headerArg, diagnostics);
  const children = bodyChildren ?? [];

  if (children.length !== columns) {
    diagnostics.push({
      code: "W_COL_COUNT_MISMATCH",
      severity: "warning",
      message: `Invalid col child count: expected ${columns}, got ${children.length}`
    });
  }

  return {
    type: "col",
    columns,
    children
  };
};

const readStructuredBlockId = (
  headerArg: string | undefined,
  diagnostics: Diagnostic[]
): string | undefined => {
  const id = headerArg?.trim().startsWith("#") ? headerArg.trim().slice(1) : undefined;

  if (id && !ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "E_INVALID_ID",
      severity: "error",
      message: `Invalid block id: ${id}`,
      nodeId: id
    });
  }

  return id;
};

const parseChemdBlock = (
  id: string | undefined,
  lines: string[],
  diagnostics: Diagnostic[],
  fields: Record<string, string | string[]>
): MoleculeNode | ReactionNode => {
  const reactants = pickFirstStringArray(fields, ["reac", "reactant", "reactants"]) ?? [];
  const products = pickFirstStringArray(fields, ["prod", "product", "products"]) ?? [];
  const conditions = Array.isArray(fields.conditions) ? fields.conditions : [];
  const hasReactionFields =
    reactants.length > 0
    || products.length > 0
    || "reac" in fields
    || "prod" in fields
    || "reactant" in fields
    || "product" in fields
    || "reactants" in fields
    || "products" in fields;

  // `chemd` 保留双态入口：有反应字段就解释为 reaction，否则解释为 molecule。
  if (hasReactionFields) {
    return {
      type: "reaction",
      id,
      reactants,
      products,
      conditions,
      name: pickFirstStringValue(fields, ["name"]),
      reagents: pickFirstStringValue(fields, ["reagents"]),
      catalyst: pickFirstStringValue(fields, ["catalyst"]),
      solvent: pickFirstStringValue(fields, ["solvent"]),
      temperature: pickFirstStringValue(fields, ["temperature"]),
      time: pickFirstStringValue(fields, ["time"]),
      pressure: pickFirstStringValue(fields, ["pressure"]),
      atmosphere: pickFirstStringValue(fields, ["atmosphere"]),
      yield: pickFirstStringValue(fields, ["yield"]),
      conversion: pickFirstStringValue(fields, ["conversion"]),
      selectivity: pickFirstStringValue(fields, ["selectivity"]),
      caption: pickFirstStringValue(fields, ["caption"])
    };
  }

  return {
    type: "molecule",
    id,
    smiles: pickFirstStringValue(fields, ["smiles", "cas"])
      ?? collectImplicitChemdValue(lines, diagnostics),
    name: pickFirstStringValue(fields, ["name"]),
    role: pickFirstStringValue(fields, ["role"]),
    caption: pickFirstStringValue(fields, ["caption"]),
    formula: pickFirstStringValue(fields, ["formula"]),
    amount: pickFirstStringValue(fields, ["amount"]),
    equivalents: pickFirstStringValue(fields, ["equivalents"])
  };
};

const parseLeafBlock = (
  blockType: string,
  id: string | undefined,
  fields: Record<string, string | string[]>
): ResultNode | AnalysisNode | SampleNode | undefined => {
  switch (blockType) {
    case "result":
      return { type: "result", id, ...fields } as ResultNode;
    case "analysis": {
      const { type: analysisType, ...rest } = fields;
      return {
        type: "analysis",
        id,
        type_name: typeof analysisType === "string" ? analysisType : undefined,
        ...rest
      } as AnalysisNode;
    }
    case "sample":
      return { type: "sample", id, ...fields } as SampleNode;
    default:
      return undefined;
  }
};

export const parseStructuredBlock = (
  blockType: string,
  headerArg: string | undefined,
  lines: string[],
  diagnostics: Diagnostic[],
  bodyChildren?: ChemdNode[]
): StructuredNode | undefined => {
  if (!SUPPORTED_BLOCK_TYPES.has(blockType)) {
    diagnostics.push({
      code: "W_UNKNOWN_BLOCK",
      severity: "warning",
      message: `Unknown block type: ${blockType}`
    });
    return undefined;
  }

  const fields = parseKeyValueLines(blockType, lines, diagnostics);

  if (blockType === "use") {
    return parseUseBlock(headerArg?.trim() ?? "", fields);
  }

  if (blockType === "col") {
    return parseColBlock(blockType, headerArg, bodyChildren, diagnostics);
  }

  const id = readStructuredBlockId(headerArg, diagnostics);
  if (blockType === "chemd") {
    return parseChemdBlock(id, lines, diagnostics, fields);
  }

  return parseLeafBlock(blockType, id, fields);
};

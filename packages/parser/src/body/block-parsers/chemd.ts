import type { ChemdSemanticKind, MoleculeNode, ReactionNode, SyntaxOrigin } from "@chemd/core";

import { collectImplicitChemdValue, pickFirstStringArray, pickFirstStringValue } from "../parse-body-shared";
import { parseAllowedFields, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const CHEMD_FIELDS = new Set([
  "kind",
  "smiles",
  "cas",
  "name",
  "role",
  "caption",
  "formula",
  "amount",
  "equivalents",
  "reactants",
  "products",
  "reactant",
  "product",
  "reac",
  "prod",
  "conditions",
  "reagents",
  "catalyst",
  "solvent",
  "temperature",
  "time",
  "pressure",
  "atmosphere",
  "yield",
  "conversion",
  "selectivity"
]);

const CHEMD_KINDS = new Set<ChemdSemanticKind>(["molecule", "reaction"]);

interface ParsedChemdMetadata {
  id?: string;
  syntaxOrigin: SyntaxOrigin;
  declaredKind?: ChemdSemanticKind;
}

interface DeclaredKindResult {
  declaredKind?: ChemdSemanticKind;
  hasKindField: boolean;
  isValid: boolean;
}

const hasReactionShape = (fields: Record<string, string | string[]>): boolean => {
  const reactants = pickFirstStringArray(fields, ["reac", "reactant", "reactants"]) ?? [];
  const products = pickFirstStringArray(fields, ["prod", "product", "products"]) ?? [];

  return reactants.length > 0
    || products.length > 0
    || "reac" in fields
    || "prod" in fields
    || "reactant" in fields
    || "product" in fields
    || "reactants" in fields
    || "products" in fields;
};

const readDeclaredKind = (
  id: string | undefined,
  fields: Record<string, string | string[]>,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"]
): DeclaredKindResult => {
  const kind = pickFirstStringValue(fields, ["kind"]);

  if (!kind) {
    const hasKindField = "kind" in fields;

    if (!hasKindField) {
      return { hasKindField: false, isValid: true };
    }

    diagnostics.push({
      code: "E_CHEMD_KIND_CONFLICT",
      severity: "error",
      message: "Invalid chemd kind: (empty)",
      nodeId: id,
      sourceLayer: "parser",
      sourceNodeType: "chemd",
      sourceNodeId: id,
      facts: { kind: "" }
    });

    return { hasKindField: true, isValid: false };
  }

  if (CHEMD_KINDS.has(kind as ChemdSemanticKind)) {
    return { declaredKind: kind as ChemdSemanticKind, hasKindField: true, isValid: true };
  }

  diagnostics.push({
    code: "E_CHEMD_KIND_CONFLICT",
    severity: "error",
    message: `Invalid chemd kind: ${kind}`,
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "chemd",
    sourceNodeId: id,
    facts: { kind }
  });

  return { hasKindField: true, isValid: false };
};

const reportKindConflict = (
  id: string | undefined,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"],
  message = "Explicit chemd kind conflicts with reaction-shaped fields"
) => {
  diagnostics.push({
    code: "E_CHEMD_KIND_CONFLICT",
    severity: "error",
    message,
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "chemd",
    sourceNodeId: id
  });
};

const createReactionNode = (
  metadata: ParsedChemdMetadata,
  fields: Record<string, string | string[]>,
): ReactionNode => ({
  type: "reaction",
  id: metadata.id,
  syntaxOrigin: metadata.syntaxOrigin,
  declaredKind: metadata.declaredKind,
  reactants: pickFirstStringArray(fields, ["reac", "reactant", "reactants"]) ?? [],
  products: pickFirstStringArray(fields, ["prod", "product", "products"]) ?? [],
  conditions: Array.isArray(fields.conditions) ? fields.conditions : [],
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
});

const createMoleculeNode = (
  metadata: ParsedChemdMetadata,
  lines: string[],
  fields: Record<string, string | string[]>,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"]
): MoleculeNode => ({
  type: "molecule",
  id: metadata.id,
  syntaxOrigin: metadata.syntaxOrigin,
  declaredKind: metadata.declaredKind,
  smiles: pickFirstStringValue(fields, ["smiles"]) ?? collectImplicitChemdValue(lines, diagnostics),
  cas: pickFirstStringValue(fields, ["cas"]),
  name: pickFirstStringValue(fields, ["name"]),
  role: pickFirstStringValue(fields, ["role"]),
  caption: pickFirstStringValue(fields, ["caption"]),
  formula: pickFirstStringValue(fields, ["formula"]),
  amount: pickFirstStringValue(fields, ["amount"]),
  equivalents: pickFirstStringValue(fields, ["equivalents"])
});

const reportMissingKind = (
  id: string | undefined,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"]
) => {
  const quickFixes = id
    ? [{
        title: "Insert an explicit kind field in this chemd block",
        kind: "insert_chemd_kind" as const,
        patch: {
          source_node_type: "chemd",
          source_node_id: id
        }
      }]
    : [];

  diagnostics.push({
    code: "W_CHEMD_KIND_AMBIGUOUS",
    severity: "warning",
    message: "Chemd block should declare kind: molecule or kind: reaction",
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "chemd",
    sourceNodeId: id,
    ...(quickFixes.length > 0 ? { quickFixes } : {})
  });
};

const reportInferredKind = (
  id: string | undefined,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"],
  inferredKind: ChemdSemanticKind
) => {
  const quickFixes = id
    ? [{
        title: `Insert kind: ${inferredKind} in this chemd block`,
        kind: "insert_chemd_kind" as const,
        patch: {
          source_node_type: "chemd",
          source_node_id: id,
          kind: inferredKind
        }
      }]
    : [];

  diagnostics.push({
    code: "W_CHEMD_KIND_INFERRED",
    severity: "warning",
    message: `Chemd kind inferred as ${inferredKind}; declare kind explicitly.`,
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "chemd",
    sourceNodeId: id,
    facts: { inferred_kind: inferredKind },
    ...(quickFixes.length > 0 ? { quickFixes } : {})
  });
};

export const parseChemdBlock: BlockParser = ({ headerArg, lines, diagnostics, options }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "chemd", CHEMD_FIELDS);
  const kindResult = readDeclaredKind(id, fields, diagnostics);
  const declaredKind = kindResult.declaredKind;
  const reactionShape = hasReactionShape(fields);

  if (!kindResult.isValid) {
    return undefined;
  }

  if (!declaredKind && !kindResult.hasKindField && options?.strictChemdKind) {
    reportMissingKind(id, diagnostics);
  }

  if (declaredKind === "reaction") {
    if (!reactionShape) {
      reportKindConflict(
        id,
        diagnostics,
        "Explicit reaction chemd kind requires reactants or products fields"
      );
    }
    return createReactionNode({ id, syntaxOrigin: "chemd", declaredKind }, fields);
  }

  if (declaredKind === "molecule") {
    if (reactionShape) {
      reportKindConflict(id, diagnostics);
    }
    return createMoleculeNode({ id, syntaxOrigin: "chemd", declaredKind }, lines, fields, diagnostics);
  }

  if (!options?.strictChemdKind) {
    reportInferredKind(id, diagnostics, reactionShape ? "reaction" : "molecule");
  }
  return reactionShape
    ? createReactionNode({ id, syntaxOrigin: "chemd" }, fields)
    : createMoleculeNode({ id, syntaxOrigin: "chemd" }, lines, fields, diagnostics);
};

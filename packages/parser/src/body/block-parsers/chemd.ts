import {
  getAllowedBlockFieldSet,
  getBlockListFieldSet,
  normalizeChemdKind,
  type ChemdSemanticKind,
  type ChemistryFeatureRef,
  type FieldSourceSpans,
  type MoleculeNode,
  type ReactionNode,
  type SyntaxOrigin
} from "@chemd/core";

import {
  collectImplicitChemdValue,
  parseKeyValueLine,
  pickFirstStringArray,
  pickFirstStringValue
} from "../parse-body-shared";
import {
  parseAllowedFields,
  parseAllowedFieldSpans,
  readChemistryFeatureRefs,
  readStructuredBlockId
} from "./common";
import type { BlockParser } from "./types";

const CHEMD_FIELDS = getAllowedBlockFieldSet("chemd");
const CHEMD_LIST_FIELDS = getBlockListFieldSet("chemd");

interface ParsedChemdMetadata {
  id?: string;
  syntaxOrigin: SyntaxOrigin;
  declaredKind?: ChemdSemanticKind;
  fieldSpans?: FieldSourceSpans;
  chemistryFeatureRefs?: ChemistryFeatureRef[];
}

interface DeclaredKindResult {
  declaredKind?: ChemdSemanticKind;
  hasKindField: boolean;
  isValid: boolean;
}

const hasReactionShape = (fields: Record<string, string | string[]>): boolean => {
  const reactants = pickFirstStringArray(fields, ["reactant"]) ?? [];
  const products = pickFirstStringArray(fields, ["product"]) ?? [];

  return reactants.length > 0
    || products.length > 0
    || "reactant" in fields
    || "product" in fields;
};

const hasMoleculeShape = (fields: Record<string, string | string[]>): boolean =>
  ["smiles", "cas", "inchi", "inchikey", "canonical_smiles", "formula", "mw", "role"].some((fieldName) =>
    fieldName in fields
  );

const inferChemdKind = (fields: Record<string, string | string[]>): ChemdSemanticKind | undefined => {
  const reactionShape = hasReactionShape(fields);
  const moleculeShape = hasMoleculeShape(fields);

  if (reactionShape === moleculeShape) {
    return undefined;
  }

  return reactionShape ? "reaction" : "molecule";
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

  const normalizedKind = normalizeChemdKind(kind);
  if (normalizedKind) {
    return { declaredKind: normalizedKind, hasKindField: true, isValid: true };
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
  fieldSpans: metadata.fieldSpans,
  route: pickFirstStringValue(fields, ["route"]),
  prev: pickFirstStringArray(fields, ["prev"]),
  reactants: pickFirstStringArray(fields, ["reactant"]) ?? [],
  products: pickFirstStringArray(fields, ["product"]) ?? [],
  equation: pickFirstStringValue(fields, ["equation"]),
  rxn_smiles: pickFirstStringValue(fields, ["rxn_smiles"]),
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
  caption: pickFirstStringValue(fields, ["caption"]),
  chemistryFeatureRefs: metadata.chemistryFeatureRefs
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
  fieldSpans: metadata.fieldSpans,
  smiles: pickFirstStringValue(fields, ["smiles"]) ?? collectImplicitChemdValue(lines, diagnostics),
  cas: pickFirstStringValue(fields, ["cas"]),
  inchi: pickFirstStringValue(fields, ["inchi"]),
  inchikey: pickFirstStringValue(fields, ["inchikey"]),
  canonical_smiles: pickFirstStringValue(fields, ["canonical_smiles"]),
  name: pickFirstStringValue(fields, ["name"]),
  role: pickFirstStringValue(fields, ["role"]),
  caption: pickFirstStringValue(fields, ["caption"]),
  formula: pickFirstStringValue(fields, ["formula"]),
  mw: pickFirstStringValue(fields, ["mw"]),
  amount: pickFirstStringValue(fields, ["amount"]),
  equivalents: pickFirstStringValue(fields, ["equivalents"]),
  chemistryFeatureRefs: metadata.chemistryFeatureRefs
});

const STRUCTURED_PARTICIPANT_PATTERN = /(?:^|\|)\s*(?:[-+]?\d+(?:\.\d+)?\s*[a-zA-Z%°℃]|(?:amount|equiv|equivalents|limiting|loading|volume|mass)\s*=)/i;

const reportStructuredPluralParticipant = (
  id: string | undefined,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"],
  field: string,
  rawValue: string
) => {
  diagnostics.push({
    code: "E_REACTION_PARTICIPANT_SYNTAX",
    severity: "error",
    message: `${field} only accepts a simple reference/literal list; use repeated reactant/product fields for amount, equiv or limiting.`,
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "chemd",
    sourceNodeId: id,
    sourceField: field,
    facts: { field, raw_value: rawValue }
  });
};

const validateParticipantListSurface = (
  id: string | undefined,
  lines: string[],
  diagnostics: Parameters<BlockParser>[0]["diagnostics"]
) => {
  for (const line of lines) {
    const parsed = parseKeyValueLine(line.trim());
    if (!parsed || !["reactants", "products"].includes(parsed.key)) {
      continue;
    }

    if (STRUCTURED_PARTICIPANT_PATTERN.test(parsed.rawValue)) {
      reportStructuredPluralParticipant(id, diagnostics, parsed.key, parsed.rawValue);
    }
  }
};

const reportAmbiguousKind = (
  id: string | undefined,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"]
) => {
  const quickFixes = id
    ? (["molecule", "reaction"] as const).map((kind) => ({
        title: `Insert kind: ${kind} in this chemd block`,
        kind: "insert_chemd_kind" as const,
        patch: {
          source_node_type: "chemd",
          source_node_id: id,
          kind
        }
      }))
    : [];

  diagnostics.push({
    code: "W_CHEMD_KIND_AMBIGUOUS",
    severity: "error",
    message: "Chemd block kind cannot be inferred; declare kind: molecule or kind: reaction",
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "chemd",
    sourceNodeId: id,
    ...(quickFixes.length > 0 ? { quickFixes } : {})
  });
};

export const parseChemdBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "chemd", CHEMD_FIELDS, {
    listFields: CHEMD_LIST_FIELDS,
    sourceNodeId: id
  });
  validateParticipantListSurface(id, lines, diagnostics);
  const fieldSpans = parseAllowedFieldSpans(lines, CHEMD_FIELDS, "chemd");
  const kindResult = readDeclaredKind(id, fields, diagnostics);
  const declaredKind = kindResult.declaredKind;
  const reactionShape = hasReactionShape(fields);
  const chemistryFeatureRefs = readChemistryFeatureRefs(
    fields.chemistry_features,
    reactionShape ? "reaction" : "molecule"
  );

  if (!kindResult.isValid) {
    return undefined;
  }

  if (declaredKind === "reaction") {
    if (!reactionShape) {
      reportKindConflict(
        id,
        diagnostics,
        "Explicit reaction chemd kind requires reactants or products fields"
      );
    }
    return createReactionNode({ id, syntaxOrigin: "chemd", declaredKind, fieldSpans, chemistryFeatureRefs }, fields);
  }

  if (declaredKind === "molecule") {
    if (reactionShape) {
      reportKindConflict(id, diagnostics);
    }
    return createMoleculeNode(
      { id, syntaxOrigin: "chemd", declaredKind, fieldSpans, chemistryFeatureRefs },
      lines,
      fields,
      diagnostics
    );
  }

  const inferredKind = inferChemdKind(fields);
  if (!inferredKind) {
    reportAmbiguousKind(id, diagnostics);
    return undefined;
  }
  return inferredKind === "reaction"
    ? createReactionNode({ id, syntaxOrigin: "chemd", fieldSpans, chemistryFeatureRefs }, fields)
    : createMoleculeNode(
      { id, syntaxOrigin: "chemd", fieldSpans, chemistryFeatureRefs },
      lines,
      fields,
      diagnostics
    );
};

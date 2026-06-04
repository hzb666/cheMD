import type {
  ChemdQuantityValue,
  ChemdValue
} from "@chemd/core";

import { fieldValue } from "./program-validation";
import {
  sourceForDeclaration,
  valueToReferenceList,
  valueToReferenceOrLiteral,
  valueToStringList,
  valueToText,
  type ProgramFieldDeclaration,
  type ProgramSymbolTable
} from "./program-utils";
import type {
  QuantityType,
  TypedSemanticNode
} from "./types";

type ProgramNodeBase = {
  nodeId: string;
  sourceNodeType: ProgramFieldDeclaration["kind"];
  sourceMetadata: ReturnType<typeof sourceForDeclaration>;
  declaredKind: string;
};

export const buildTypedFieldNode = (
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => {
  const base = {
    nodeId: declaration.id,
    sourceNodeType: declaration.kind,
    sourceMetadata: sourceForDeclaration(declaration),
    declaredKind: declaration.kind
  };
  if (declaration.kind === "molecule") {
    return {
      ...base,
      kind: "molecule",
      name: textField(declaration, "name"),
      smiles: textField(declaration, "smiles"),
      role: textField(declaration, "role"),
      formula: textField(declaration, "formula")
    };
  }
  if (declaration.kind === "reaction_template") return buildReactionTemplateNode(base, declaration);
  if (declaration.kind === "reaction") return buildReactionNode(base, declaration, symbols);
  if (declaration.kind === "result") return buildResultNode(base, declaration, symbols);
  if (declaration.kind === "analysis") return buildAnalysisNode(base, declaration, symbols);
  if (declaration.kind === "sample") return buildSampleNode(base, declaration, symbols);
  if (declaration.kind === "artifact") return buildArtifactNode(base, declaration, symbols);
  if (declaration.kind === "observation") return buildObservationNode(base, declaration);
  if (declaration.kind === "trace") return buildTraceNode(base, declaration, symbols);
  if (declaration.kind === "condition_screen") return buildConditionScreenNode(base, declaration, symbols);
  if (declaration.kind === "material") {
    return {
      ...base,
      kind: "material",
      molecule: refField(declaration, "molecule", symbols),
      supplier: textField(declaration, "supplier"),
      lot: textField(declaration, "lot"),
      notes: textField(declaration, "notes")
    };
  }
  return {
    ...base,
    kind: "batch",
    source: refField(declaration, "source", symbols),
    molecule: refField(declaration, "molecule", symbols),
    notes: textField(declaration, "notes")
  };
};

const buildReactionNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => ({
  ...base,
  kind: "reaction",
  route: textField(declaration, "route"),
  rxn_smiles: textField(declaration, "rxn_smiles"),
  template: refField(declaration, "template", symbols),
  prev: refsField(declaration, "prev", symbols),
  next: [],
  reactants: refsField(declaration, "reactants", symbols),
  products: refsField(declaration, "products", symbols),
  participants: [],
  normalizedConditions: {},
  solvent: textField(declaration, "solvent"),
  catalyst: textField(declaration, "catalyst"),
  reagents: textField(declaration, "reagents"),
  temperature: quantityField(declaration, "temperature"),
  time: quantityField(declaration, "time"),
  pressure: quantityField(declaration, "pressure")
});

const buildReactionTemplateNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration
): TypedSemanticNode => ({
  ...base,
  kind: "reaction_template",
  name: textField(declaration, "name"),
  family: textField(declaration, "family"),
  roles: valueToStringList(fieldValue(declaration, "role")),
  notes: textField(declaration, "notes")
});

const buildResultNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => ({
  ...base,
  kind: "result",
  status: textField(declaration, "status") as "success" | "partial" | "failed" | "unknown" | undefined,
  reaction: refField(declaration, "reaction", symbols) ?? targetRef(declaration, symbols),
  product: refField(declaration, "product", symbols),
  yield: quantityField(declaration, "yield"),
  conversion: quantityField(declaration, "conversion"),
  selectivity: quantityField(declaration, "selectivity"),
  purity: quantityField(declaration, "purity"),
  notes: textField(declaration, "notes")
});

const buildAnalysisNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => {
  const analysisType = textField(declaration, "type");
  return {
    ...base,
    kind: "analysis",
    analysisType: analysisType
      ? { kind: "known", raw: analysisType, value: analysisType }
      : undefined,
    normalizedAnalysis: null,
    normalizedTlc: null,
    ref: refField(declaration, "ref", symbols) ?? targetRef(declaration, symbols),
    artifacts: refsField(declaration, "artifact", symbols),
    instrument: textField(declaration, "instrument"),
    method: textField(declaration, "method"),
    data: textField(declaration, "data"),
    notes: textField(declaration, "notes")
  };
};

const buildSampleNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => ({
  ...base,
  kind: "sample",
  name: textField(declaration, "name"),
  derivedFrom: refField(declaration, "derived_from", symbols),
  batchOf: refField(declaration, "batch", symbols),
  purity: quantityField(declaration, "purity"),
  notes: textField(declaration, "notes")
});

const buildArtifactNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => ({
  ...base,
  kind: "artifact",
  artifactKind: textField(declaration, "kind"),
  ref: refField(declaration, "ref", symbols),
  path: textField(declaration, "path"),
  checksum: textField(declaration, "checksum"),
  notes: textField(declaration, "notes")
});

const buildObservationNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration
): TypedSemanticNode => ({
  ...base,
  kind: "observation_narrative",
  rawText: textField(declaration, "notes") ?? ""
});

const buildTraceNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => ({
  ...base,
  kind: "trace",
  plan: refField(declaration, "plan", symbols) ?? targetRef(declaration, symbols),
  mode: textField(declaration, "mode"),
  eventCount: 0
});

const buildConditionScreenNode = (
  base: ProgramNodeBase,
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
): TypedSemanticNode => ({
  ...base,
  kind: "condition_screen",
  reaction: refField(declaration, "reaction", symbols) ?? targetRef(declaration, symbols),
  standard: refField(declaration, "standard", symbols),
  factors: valueToStringList(fieldValue(declaration, "factor")),
  outcomes: valueToStringList(fieldValue(declaration, "outcome")),
  notes: textField(declaration, "notes")
});

const textField = (declaration: ProgramFieldDeclaration, field: string): string | undefined =>
  valueToText(fieldValue(declaration, field));

const refField = (
  declaration: ProgramFieldDeclaration,
  field: string,
  symbols: ProgramSymbolTable
) => valueToReferenceOrLiteral(fieldValue(declaration, field), symbols);

const refsField = (
  declaration: ProgramFieldDeclaration,
  field: string,
  symbols: ProgramSymbolTable
) => valueToReferenceList(fieldValue(declaration, field), symbols);

const targetRef = (
  declaration: ProgramFieldDeclaration,
  symbols: ProgramSymbolTable
) => "target" in declaration
  ? valueToReferenceOrLiteral(declaration.target, symbols)
  : undefined;

const quantityField = (declaration: ProgramFieldDeclaration, field: string): QuantityType | undefined => {
  const value = fieldValue(declaration, field);
  return value?.type === "quantity" || value?.type === "percent"
    ? toQuantityType(value, declaration.id, field)
    : undefined;
};

const toQuantityType = (
  value: ChemdQuantityValue | Extract<ChemdValue, { type: "percent" }>,
  nodeId: string,
  field: string
): QuantityType => ({
  kind: "quantity",
  quantityClass: value.type === "percent"
    ? "percent"
    : (value.quantityClass as QuantityType["quantityClass"] | undefined) ?? "amount",
  raw: value.raw,
  valueKind: "scalar",
  value: value.value,
  unit: value.type === "percent" ? "%" : value.unit,
  sourceNodeId: nodeId,
  sourceField: field,
  sourceSpan: value.sourceSpan
});

export const collectDeclarationQuantities = (
  declaration: ProgramFieldDeclaration
): QuantityType[] =>
  Object.entries(declaration.fields)
    .flatMap(([field, value]) => collectQuantities(value, declaration.id, field));

export const collectQuantities = (
  value: ChemdValue,
  nodeId: string,
  field: string
): QuantityType[] => {
  if (value.type === "quantity" || value.type === "percent") {
    return [toQuantityType(value, nodeId, field)];
  }
  if (value.type === "list") return value.items.flatMap((item) => collectQuantities(item, nodeId, field));
  if (value.type === "record") return value.fields.flatMap((item) => collectQuantities(item.value, nodeId, item.key));
  if (value.type === "call") return value.args.flatMap((item) => collectQuantities(item.value, nodeId, item.name));
  if (value.type === "patch") return collectQuantities(value.value, nodeId, field);
  return [];
};

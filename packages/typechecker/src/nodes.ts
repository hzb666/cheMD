import type {
  AnalysisNode,
  MoleculeNode,
  ObservationNode,
  ProcedureNode,
  ReactionNode,
  ResultNode,
  SampleNode
} from "@chemd/core";
import {
  classifyReactionConditions,
  classifyTlcAnalysis
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import {
  normalizeAnalysisType,
  normalizeAtmosphere,
  normalizeStatus,
  parseQuantity
} from "./normalize";
import { resolveDerivedField } from "./expressions";
import { resolveOptionalReference, resolveReferenceList } from "./reference-rules";
import { resolveResultRelationships, resolveSampleRelationships } from "./relationships";
import type {
  ObjectNode,
  QuantityClass,
  QuantityType,
  TypedAnalysisNode,
  TypedMoleculeNode,
  TypedObservationNarrativeNode,
  TypedProcedureNarrativeNode,
  TypedReactionNode,
  TypedResultNode,
  TypedSampleNode,
  TypedSemanticNode
} from "./types";

export interface BuildNodeContext {
  objectIndex: Map<string, ObjectNode>;
}

export interface BuiltTypedNode {
  node: TypedSemanticNode;
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

interface ReadQuantityInput {
  raw: string | undefined;
  quantityClass: QuantityClass;
  sourceNodeType: string;
  sourceNodeId?: string;
  field: string;
  objectIndex: Map<string, ObjectNode>;
}

const readQuantity = (input: ReadQuantityInput): { quantity?: QuantityType; diagnostics: V03Diagnostic[] } => {
  const derived = resolveDerivedField(input.raw, input);
  if (derived.diagnostic) {
    return {
      quantity: createRawQuantity(input),
      diagnostics: [derived.diagnostic]
    };
  }

  const parsed = parseQuantity(derived.value, input.quantityClass, {
    sourceNodeType: input.sourceNodeType,
    sourceNodeId: input.sourceNodeId,
    field: input.field
  });
  const quantity = parsed.quantity && derived.provenance
    ? { ...parsed.quantity, provenance: derived.provenance }
    : parsed.quantity;

  return {
    ...(quantity ? { quantity } : {}),
    diagnostics: parsed.diagnostic ? [parsed.diagnostic] : []
  };
};

const createRawQuantity = (input: ReadQuantityInput): QuantityType | undefined =>
  input.raw
    ? {
        kind: "quantity",
        quantityClass: input.quantityClass,
        raw: input.raw.trim(),
        sourceNodeId: input.sourceNodeId,
        sourceField: input.field
      }
    : undefined;

const collectQuantity = (
  output: BuiltTypedNode,
  key: string,
  quantityClass: QuantityClass,
  raw: string | undefined,
  objectIndex: Map<string, ObjectNode>
): QuantityType | undefined => {
  const parsed = readQuantity({
    raw,
    quantityClass,
    sourceNodeType: output.node.sourceNodeType,
    sourceNodeId: output.node.nodeId,
    field: key,
    objectIndex
  });

  if (parsed.quantity) {
    output.quantities.push(parsed.quantity);
  }

  output.diagnostics.push(...parsed.diagnostics);

  return parsed.quantity;
};

const createBase = (kind: TypedSemanticNode["kind"], node: ObjectNode): BuiltTypedNode => ({
  node: {
    kind,
    nodeId: node.id ?? `${node.type}:anonymous`,
    sourceNodeType: node.type,
    ...("syntaxOrigin" in node && node.syntaxOrigin ? { syntaxOrigin: node.syntaxOrigin } : {}),
    ...("declaredKind" in node && node.declaredKind ? { declaredKind: node.declaredKind } : {})
  } as TypedSemanticNode,
  quantities: [],
  diagnostics: []
});

export const buildMoleculeNode = (
  node: MoleculeNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("molecule", node);
  const amount = collectQuantity(output, "amount", "amount", node.amount, context.objectIndex);
  const equivalents = collectQuantity(
    output,
    "equivalents",
    "equivalent",
    node.equivalents,
    context.objectIndex
  );

  output.node = {
    ...output.node,
    smiles: node.smiles,
    cas: node.cas,
    name: node.name,
    role: node.role,
    formula: node.formula,
    ...(amount ? { amount } : {}),
    ...(equivalents ? { equivalents } : {})
  } as TypedMoleculeNode;

  return output;
};

export const buildReactionNode = (
  node: ReactionNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("reaction", node);
  const temperature = collectQuantity(output, "temperature", "temperature", node.temperature, context.objectIndex);
  const time = collectQuantity(output, "time", "time", node.time, context.objectIndex);
  const pressure = collectQuantity(output, "pressure", "pressure", node.pressure, context.objectIndex);
  const atmosphere = normalizeAtmosphere(node.atmosphere);
  const reactants = resolveReferenceList(node.reactants ?? [], context.objectIndex, {
    sourceNodeType: "reaction",
    sourceNodeId: node.id,
    field: "reactants",
    expectedTargetKind: "molecule"
  });
  const products = resolveReferenceList(node.products ?? [], context.objectIndex, {
    sourceNodeType: "reaction",
    sourceNodeId: node.id,
    field: "products",
    expectedTargetKind: "molecule"
  });

  output.diagnostics.push(...reactants.diagnostics, ...products.diagnostics);

  output.node = {
    ...output.node,
    reactants: reactants.values,
    products: products.values,
    normalizedConditions: classifyReactionConditions(node),
    solvent: node.solvent,
    catalyst: node.catalyst,
    reagents: node.reagents,
    ...(atmosphere ? { atmosphere } : {}),
    ...(temperature ? { temperature } : {}),
    ...(time ? { time } : {}),
    ...(pressure ? { pressure } : {})
  } as TypedReactionNode;

  return output;
};

export const buildResultNode = (
  node: ResultNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("result", node);
  const normalizedStatus = normalizeStatus(node.status, {
    sourceNodeType: "result",
    sourceNodeId: node.id
  });
  const yieldPercent = collectQuantity(output, "yield", "percent", node.yield, context.objectIndex);
  const conversion = collectQuantity(output, "conversion", "percent", node.conversion, context.objectIndex);
  const selectivity = collectQuantity(output, "selectivity", "percent", node.selectivity, context.objectIndex);
  const purity = collectQuantity(output, "purity", "percent", node.purity, context.objectIndex);
  const relationships = resolveResultRelationships(node, context.objectIndex);
  const isolatedMass = collectQuantity(
    output,
    "isolated_mass",
    "mass",
    node.isolated_mass,
    context.objectIndex
  );

  if (normalizedStatus.diagnostic) {
    output.diagnostics.push(normalizedStatus.diagnostic);
  }
  output.diagnostics.push(...relationships.diagnostics);

  output.node = {
    ...output.node,
    status: normalizedStatus.status,
    ...(relationships.reaction ? { reaction: relationships.reaction } : {}),
    ...(relationships.product ? { product: relationships.product } : {}),
    ...(yieldPercent ? { yield: yieldPercent } : {}),
    ...(conversion ? { conversion } : {}),
    ...(selectivity ? { selectivity } : {}),
    ...(purity ? { purity } : {}),
    ...(isolatedMass ? { isolatedMass } : {}),
    notes: node.notes
  } as TypedResultNode;

  return output;
};

export const buildAnalysisNode = (
  node: AnalysisNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("analysis", node);
  const analysisType = normalizeAnalysisType(node.type_name);
  const reference = resolveOptionalReference(node.ref, context.objectIndex, {
    sourceNodeType: "analysis",
    sourceNodeId: node.id,
    field: "ref"
  });

  output.diagnostics.push(...reference.diagnostics);
  output.node = {
    ...output.node,
    ...(analysisType ? { analysisType } : {}),
    normalizedTlc: classifyTlcAnalysis(node) ?? null,
    ...(reference.value ? { ref: reference.value } : {}),
    result: node.result,
    instrument: node.instrument,
    method: node.method,
    data: node.data,
    notes: node.notes
  } as TypedAnalysisNode;

  return output;
};

export const buildProcedureNode = (
  node: ProcedureNode,
  structureHint: "ordered_list" | "paragraph" | "mixed" | "explicit_steps"
): BuiltTypedNode => ({
  ...createBase("procedure_narrative", node),
  node: {
    ...createBase("procedure_narrative", node).node,
    rawText: node.body ?? "",
    structureHint
  } as TypedProcedureNarrativeNode
});

export const buildObservationNode = (node: ObservationNode): BuiltTypedNode => ({
  ...createBase("observation_narrative", node),
  node: {
    ...createBase("observation_narrative", node).node,
    rawText: node.body ?? "",
    ...(node.ref ? { stageHint: node.ref } : {})
  } as TypedObservationNarrativeNode
});

export const buildSampleNode = (
  node: SampleNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("sample", node);
  const purity = collectQuantity(output, "purity", "percent", node.purity, context.objectIndex);
  const relationships = resolveSampleRelationships(node, context.objectIndex);

  output.diagnostics.push(...relationships.diagnostics);

  output.node = {
    ...output.node,
    name: node.name,
    sampleCode: node.sample_id,
    ...(relationships.ref ? { ref: relationships.ref } : {}),
    ...(purity ? { purity } : {}),
    supplier: node.supplier,
    notes: node.notes
  } as TypedSampleNode;

  return output;
};

import type {
  AnalysisNode,
  MoleculeNode,
  ObservationNode,
  ProcedureNode,
  ReactionNode,
  ResultNode,
  SampleNode
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { parseQuantity, normalizeStatus } from "./normalize";
import { toReferenceOrLiteral } from "./references";
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

const readQuantity = (
  raw: string | undefined,
  quantityClass: QuantityClass,
  sourceNodeType: string,
  sourceNodeId: string | undefined,
  field: string
): { quantity?: QuantityType; diagnostic?: V03Diagnostic } =>
  parseQuantity(raw, quantityClass, {
    sourceNodeType,
    sourceNodeId,
    field
  });

const collectQuantity = (
  output: BuiltTypedNode,
  key: string,
  quantityClass: QuantityClass,
  raw: string | undefined
): QuantityType | undefined => {
  const parsed = readQuantity(raw, quantityClass, output.node.sourceNodeType, output.node.nodeId, key);

  if (parsed.quantity) {
    output.quantities.push(parsed.quantity);
  }

  if (parsed.diagnostic) {
    output.diagnostics.push(parsed.diagnostic);
  }

  return parsed.quantity;
};

const createBase = (kind: TypedSemanticNode["kind"], node: ObjectNode): BuiltTypedNode => ({
  node: {
    kind,
    nodeId: node.id ?? `${node.type}:anonymous`,
    sourceNodeType: node.type
  } as TypedSemanticNode,
  quantities: [],
  diagnostics: []
});

export const buildMoleculeNode = (node: MoleculeNode): BuiltTypedNode => {
  const output = createBase("molecule", node);
  const amount = collectQuantity(output, "amount", "amount", node.amount);
  const equivalents = collectQuantity(output, "equivalents", "equivalent", node.equivalents);

  output.node = {
    ...output.node,
    smiles: node.smiles,
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
  const temperature = collectQuantity(output, "temperature", "temperature", node.temperature);
  const time = collectQuantity(output, "time", "time", node.time);
  const pressure = collectQuantity(output, "pressure", "pressure", node.pressure);

  output.node = {
    ...output.node,
    reactants: (node.reactants ?? []).map((raw) => toReferenceOrLiteral(raw, context.objectIndex)),
    products: (node.products ?? []).map((raw) => toReferenceOrLiteral(raw, context.objectIndex)),
    solvent: node.solvent,
    catalyst: node.catalyst,
    reagents: node.reagents,
    atmosphere: node.atmosphere,
    ...(temperature ? { temperature } : {}),
    ...(time ? { time } : {}),
    ...(pressure ? { pressure } : {})
  } as TypedReactionNode;

  return output;
};

export const buildResultNode = (node: ResultNode): BuiltTypedNode => {
  const output = createBase("result", node);
  const normalizedStatus = normalizeStatus(node.status, {
    sourceNodeType: "result",
    sourceNodeId: node.id
  });
  const yieldPercent = collectQuantity(output, "yield", "percent", node.yield);
  const conversion = collectQuantity(output, "conversion", "percent", node.conversion);
  const selectivity = collectQuantity(output, "selectivity", "percent", node.selectivity);
  const purity = collectQuantity(output, "purity", "percent", node.purity);
  const isolatedMass = collectQuantity(output, "isolated_mass", "mass", node.isolated_mass);

  if (normalizedStatus.diagnostic) {
    output.diagnostics.push(normalizedStatus.diagnostic);
  }

  output.node = {
    ...output.node,
    status: normalizedStatus.status,
    ...(yieldPercent ? { yield: yieldPercent } : {}),
    ...(conversion ? { conversion } : {}),
    ...(selectivity ? { selectivity } : {}),
    ...(purity ? { purity } : {}),
    ...(isolatedMass ? { isolatedMass } : {}),
    notes: node.notes
  } as TypedResultNode;

  return output;
};

export const buildAnalysisNode = (node: AnalysisNode): BuiltTypedNode => ({
  ...createBase("analysis", node),
  node: {
    ...createBase("analysis", node).node,
    analysisType: node.type_name,
    ref: node.ref,
    result: node.result,
    instrument: node.instrument,
    method: node.method,
    data: node.data,
    notes: node.notes
  } as TypedAnalysisNode
});

export const buildProcedureNode = (
  node: ProcedureNode,
  structureHint: "ordered_list" | "paragraph" | "mixed"
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

export const buildSampleNode = (node: SampleNode): BuiltTypedNode => {
  const output = createBase("sample", node);
  const purity = collectQuantity(output, "purity", "percent", node.purity);

  output.node = {
    ...output.node,
    name: node.name,
    sampleCode: node.sample_id,
    ...(purity ? { purity } : {}),
    supplier: node.supplier,
    notes: node.notes
  } as TypedSampleNode;

  return output;
};

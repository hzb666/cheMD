import type {
  AnalysisNode,
  ArtifactNode,
  BatchNode,
  ConditionVariesNode,
  MaterialNode,
  MoleculeNode,
  ObservationNode,
  ProcedureNode,
  ReactionNode,
  ResultNode,
  SampleNode,
  SourceSpan
} from "@chemd/core";
import {
  classifyReactionConditions,
  classifyTlcAnalysis,
  getQuantityUnit
} from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

import {
  normalizeAnalysisType,
  normalizeAtmosphere,
  normalizeStatus,
  parseQuantity
} from "./normalize";
import { resolveDerivedField } from "./expressions";
import { resolveReactionPrevReferences } from "./reaction-routes";
import { resolveOptionalReference, resolveReferenceList } from "./reference-rules";
import { resolveResultRelationships, resolveSampleRelationships } from "./relationships";
import type {
  ObjectNode,
  QuantityClass,
  QuantityType,
  ReferenceOrLiteral,
  ExternalTargetIndex,
  TypedAnalysisNode,
  TypedArtifactNode,
  TypedConditionVariesNode,
  TypedBatchNode,
  TypedMaterialNode,
  TypedReactionParticipant,
  TypedMoleculeNode,
  TypedObservationNarrativeNode,
  TypedProcedureNarrativeNode,
  TypedReactionNode,
  TypedResultNode,
  TypedSampleNode,
  TypedSemanticNode
} from "./types";

export interface BuildNodeContext {
  documentId: string;
  objectIndex: Map<string, ObjectNode>;
  externalTargetIndex: ExternalTargetIndex;
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
  sourceSpan?: SourceSpan;
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
    field: input.field,
    sourceSpan: input.sourceSpan
  });
  const quantity = parsed.quantity && derived.provenance
    ? { ...parsed.quantity, provenance: derived.provenance }
    : parsed.quantity;

  return {
    ...(quantity ? { quantity } : {}),
    diagnostics: parsed.diagnostics ?? (parsed.diagnostic ? [parsed.diagnostic] : [])
  };
};

const createRawQuantity = (input: ReadQuantityInput): QuantityType | undefined =>
  input.raw
    ? {
        kind: "quantity",
        quantityClass: input.quantityClass,
        raw: input.raw.trim(),
        sourceNodeId: input.sourceNodeId,
        sourceField: input.field,
        sourceSpan: input.sourceSpan
      }
    : undefined;

const collectQuantity = (
  output: BuiltTypedNode,
  key: string,
  quantityClass: QuantityClass,
  raw: string | undefined,
  objectIndex: Map<string, ObjectNode>,
  sourceSpan?: SourceSpan
): QuantityType | undefined => {
  const parsed = readQuantity({
    raw,
    quantityClass,
    sourceNodeType: output.node.sourceNodeType,
    sourceNodeId: output.node.nodeId,
    field: key,
    objectIndex,
    sourceSpan
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

const normalizeRefId = (value: string): string => value.trim().replace(/^@/, "");

const createTypedDiagnostic = (
  code: string,
  message: string,
  node: ObjectNode,
  field: string,
  facts: Record<string, unknown> = {}
): V03Diagnostic =>
  createV03Diagnostic({
    code,
    severity: "error",
    message,
    sourceLayer: "typechecker",
    sourceNodeType: node.type,
    sourceNodeId: node.id,
    sourceField: field,
    facts: { field, ...facts }
  });

const hasMoleculeIdentity = (node: MoleculeNode): boolean =>
  Boolean(node.name || node.smiles || node.cas || node.inchi || node.inchikey || node.canonical_smiles || node.formula || node.mw);

const isAllowedBatchSource = (value: ReferenceOrLiteral | undefined): boolean =>
  !value
  || value.kind !== "reference"
  || !value.resolved
  || ["reaction", "result", "sample", "batch"].includes(value.targetKind);

const readParticipantHead = (raw: string): string =>
  raw.split("|")[0]?.trim() ?? raw.trim();

const parseBooleanLiteral = (value: string): boolean | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return undefined;
};

const readBareQuantityClass = (raw: string): QuantityClass | undefined => {
  const match = raw.trim().match(/^-?\d+(?:\.\d+)?\s*(°\s*C|℃|[a-zA-Z]+(?:\s*\/\s*[a-zA-Z%]+|\s*%)?|%)$/);
  const unit = match?.[1];
  if (!unit) {
    return undefined;
  }

  return (["amount", "equivalent", "mass", "volume"] as const).find((quantityClass) =>
    Boolean(getQuantityUnit(quantityClass, unit))
  );
};

const participantQuantityField = (key: string): { field: keyof TypedReactionParticipant; quantityClass: QuantityClass } | undefined => {
  switch (key.trim().toLowerCase()) {
    case "amount":
      return { field: "amount", quantityClass: "amount" };
    case "equiv":
    case "equivalent":
    case "equivalents":
      return { field: "equivalents", quantityClass: "equivalent" };
    case "mass":
      return { field: "mass", quantityClass: "mass" };
    case "volume":
      return { field: "volume", quantityClass: "volume" };
    default:
      return undefined;
  }
};

interface BuildParticipantsResult {
  participants: TypedReactionParticipant[];
  references: ReferenceOrLiteral[];
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

const parseParticipantSegment = (
  participant: TypedReactionParticipant,
  segment: string,
  node: ReactionNode,
  objectIndex: Map<string, ObjectNode>
): { quantities: QuantityType[]; diagnostics: V03Diagnostic[] } => {
  const diagnostics: V03Diagnostic[] = [];
  const quantities: QuantityType[] = [];
  const [rawKey, ...rawValueParts] = segment.split("=");
  const key = rawValueParts.length > 0 ? rawKey.trim() : undefined;
  const value = rawValueParts.join("=").trim();

  if (key?.toLowerCase() === "limiting") {
    const limiting = parseBooleanLiteral(value);
    if (limiting === undefined) {
      diagnostics.push(createTypedDiagnostic(
        "E_REACTION_PARTICIPANT_SYNTAX",
        `Invalid limiting value on participant ${participant.id}: ${value}`,
        node,
        participant.role,
        { participant_id: participant.id, raw_value: segment }
      ));
    } else {
      participant.limiting = limiting;
    }
    return { quantities, diagnostics };
  }

  const quantityTarget = key
    ? participantQuantityField(key)
    : readBareQuantityClass(segment)
      ? {
          field: readBareQuantityClass(segment) === "equivalent" ? "equivalents" : readBareQuantityClass(segment) as keyof TypedReactionParticipant,
          quantityClass: readBareQuantityClass(segment) as QuantityClass
        }
      : undefined;

  if (!quantityTarget) {
    diagnostics.push(createTypedDiagnostic(
      "E_REACTION_PARTICIPANT_SYNTAX",
      `Unable to classify participant segment: ${segment}`,
      node,
      participant.role,
      { participant_id: participant.id, raw_value: segment }
    ));
    return { quantities, diagnostics };
  }

  const parsed = readQuantity({
    raw: key ? value : segment,
    quantityClass: quantityTarget.quantityClass,
    sourceNodeType: "reaction",
    sourceNodeId: node.id,
    field: `${participant.role}.${quantityTarget.field}`,
    objectIndex,
    sourceSpan: node.fieldSpans?.[participant.role]
  });
  if (parsed.quantity) {
    (participant as unknown as Record<string, QuantityType>)[quantityTarget.field] = parsed.quantity;
    quantities.push(parsed.quantity);
  }
  diagnostics.push(...parsed.diagnostics);
  return { quantities, diagnostics };
};

const buildReactionParticipants = (
  role: "reactant" | "product",
  rawValues: string[],
  node: ReactionNode,
  context: BuildNodeContext
): BuildParticipantsResult => {
  const participants: TypedReactionParticipant[] = [];
  const references: ReferenceOrLiteral[] = [];
  const quantities: QuantityType[] = [];
  const diagnostics: V03Diagnostic[] = [];

  rawValues.forEach((raw, index) => {
    const id = `${node.id ?? "reaction"}.${role}.${index + 1}`;
    const [head, ...segments] = raw.split("|").map((segment) => segment.trim()).filter(Boolean);
    const reference = resolveReferenceList([head ?? raw], context.objectIndex, {
      sourceNodeType: "reaction",
      sourceNodeId: node.id,
      field: role,
      expectedTargetKind: undefined
    }, context.externalTargetIndex);
    const participant: TypedReactionParticipant = {
      id,
      role,
      raw,
      reference: reference.values[0]
    };
    const resolved = reference.values[0];

    for (const segment of segments) {
      const parsedSegment = parseParticipantSegment(participant, segment, node, context.objectIndex);
      quantities.push(...parsedSegment.quantities);
      diagnostics.push(...parsedSegment.diagnostics);
    }

    references.push(reference.values[0]);
    if (
      resolved?.kind === "reference"
      && (!resolved.resolved || !["molecule", "material", "batch"].includes(resolved.targetKind))
    ) {
      diagnostics.push(createTypedDiagnostic(
        "E_TYPED_REFERENCE_MISMATCH",
        `Reaction ${role} must reference molecule, material, or batch: ${resolved.refId}`,
        node,
        role,
        {
          participant_id: id,
          ref_id: resolved.refId,
          expected_target_kind: "molecule|material|batch",
          actual_target_kind: resolved.targetKind,
          resolved: resolved.resolved
        }
      ));
    }
    participants.push(participant);
  });

  return { participants, references, quantities, diagnostics };
};

const validateStoichiometry = (
  node: ReactionNode,
  participants: TypedReactionParticipant[]
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  const reactants = participants.filter((participant) => participant.role === "reactant");
  const products = participants.filter((participant) => participant.role === "product");
  const limiting = reactants.filter((participant) => participant.limiting === true);
  const hasStoichiometry = reactants.some((participant) =>
    participant.amount || participant.equivalents || participant.mass || participant.volume || participant.limiting
  );

  if (reactants.length === 0) {
    diagnostics.push(createTypedDiagnostic("E_REACTION_PARTICIPANT_MISSING", "Reaction requires at least one reactant.", node, "reactant"));
  }
  if (products.length === 0) {
    diagnostics.push(createTypedDiagnostic("E_REACTION_PARTICIPANT_MISSING", "Reaction requires at least one product.", node, "product"));
  }
  if (limiting.length > 1) {
    diagnostics.push(createTypedDiagnostic(
      "E_STOICHIOMETRY_LIMITING",
      "Reaction allows at most one limiting=true reactant.",
      node,
      "reactant",
      { limiting_participant_ids: limiting.map((participant) => participant.id) }
    ));
  }

  for (const product of products) {
    if (product.amount || product.equivalents || product.mass || product.volume) {
      diagnostics.push(createTypedDiagnostic(
        "E_REACTION_PARTICIPANT_PRODUCT_QUANTITY",
        "Product participant must not contain expected amount, isolated mass, or yield.",
        node,
        "product",
        { participant_id: product.id }
      ));
    }
  }

  if (!hasStoichiometry) {
    return diagnostics;
  }

  if (limiting.length === 0) {
    diagnostics.push(createTypedDiagnostic(
      "E_STOICHIOMETRY_LIMITING",
      "Stoichiometry with amount/equiv requires one limiting=true reactant.",
      node,
      "reactant"
    ));
  }

  for (const participant of reactants) {
    if (participant.limiting === true && (!participant.amount || !participant.equivalents)) {
      diagnostics.push(createTypedDiagnostic(
        "E_STOICHIOMETRY_QUANTITY_MISSING",
        "limiting=true reactant must provide both amount and equiv.",
        node,
        "reactant",
        { participant_id: participant.id }
      ));
    }
    if (participant.limiting !== true && !participant.amount && !participant.equivalents) {
      diagnostics.push(createTypedDiagnostic(
        "E_STOICHIOMETRY_QUANTITY_MISSING",
        "Stoichiometric reactant must provide amount or equiv.",
        node,
        "reactant",
        { participant_id: participant.id }
      ));
    }
  }

  return diagnostics;
};

export const buildMoleculeNode = (
  node: MoleculeNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("molecule", node);
  const amount = collectQuantity(output, "amount", "amount", node.amount, context.objectIndex, node.fieldSpans?.amount);
  const equivalents = collectQuantity(
    output,
    "equivalents",
    "equivalent",
    node.equivalents,
    context.objectIndex,
    node.fieldSpans?.equivalents
  );
  const identityWarning = !hasMoleculeIdentity(node)
    ? createTypedDiagnostic(
        "E_MOLECULE_IDENTITY_MISSING",
        "Molecule requires at least one identity field such as smiles, cas, inchi, inchikey, formula, or mw.",
        node,
        "identity"
      )
    : undefined;
  const legacyAmountDiagnostic = node.amount || node.equivalents
    ? createTypedDiagnostic(
        "E_MOLECULE_REACTION_QUANTITY",
        "Molecule amount/equivalents are not standard reaction usage; move usage to reaction participant fields.",
        node,
        node.amount ? "amount" : "equivalents"
      )
    : undefined;

  output.diagnostics.push(
    ...[identityWarning, legacyAmountDiagnostic].filter((item): item is V03Diagnostic => Boolean(item))
  );

  output.node = {
    ...output.node,
    smiles: node.smiles,
    cas: node.cas,
    inchi: node.inchi,
    inchikey: node.inchikey,
    canonicalSmiles: node.canonical_smiles,
    name: node.name,
    role: node.role,
    formula: node.formula,
    mw: node.mw,
    ...(amount ? { amount } : {}),
    ...(equivalents ? { equivalents } : {})
  } as TypedMoleculeNode;

  return output;
};

export const buildMaterialNode = (
  node: MaterialNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("material", node);
  const molecule = resolveOptionalReference(node.molecule, context.objectIndex, {
    sourceNodeType: "material",
    sourceNodeId: node.id,
    field: "molecule",
    expectedTargetKind: "molecule"
  }, context.externalTargetIndex);
  const purity = collectQuantity(output, "purity", "percent", node.purity, context.objectIndex, node.fieldSpans?.purity);

  output.diagnostics.push(...molecule.diagnostics);
  output.node = {
    ...output.node,
    ...(molecule.value ? { molecule: molecule.value } : {}),
    supplier: node.supplier,
    lot: node.lot,
    ...(purity ? { purity } : {}),
    density: node.density,
    storage: node.storage,
    notes: node.notes
  } as TypedMaterialNode;

  return output;
};

export const buildBatchNode = (
  node: BatchNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("batch", node);
  const source = resolveOptionalReference(node.source, context.objectIndex, {
    sourceNodeType: "batch",
    sourceNodeId: node.id,
    field: "source"
  }, context.externalTargetIndex);
  const molecule = resolveOptionalReference(node.molecule, context.objectIndex, {
    sourceNodeType: "batch",
    sourceNodeId: node.id,
    field: "molecule",
    expectedTargetKind: "molecule"
  }, context.externalTargetIndex);
  const artifacts = resolveReferenceList(node.artifacts ?? [], context.objectIndex, {
    sourceNodeType: "batch",
    sourceNodeId: node.id,
    field: "artifacts",
    expectedTargetKind: "artifact"
  }, context.externalTargetIndex);
  const mass = collectQuantity(output, "mass", "mass", node.mass, context.objectIndex, node.fieldSpans?.mass);
  const purity = collectQuantity(output, "purity", "percent", node.purity, context.objectIndex, node.fieldSpans?.purity);

  output.diagnostics.push(...source.diagnostics, ...molecule.diagnostics, ...artifacts.diagnostics);
  if (!isAllowedBatchSource(source.value)) {
    output.diagnostics.push(createTypedDiagnostic(
      "E_TYPED_REFERENCE_MISMATCH",
      "Batch source must reference reaction, result, sample, or batch.",
      node,
      "source",
      { actual_target_kind: source.value?.kind === "reference" ? source.value.targetKind : "literal" }
    ));
  }

  output.node = {
    ...output.node,
    ...(source.value ? { source: source.value } : {}),
    ...(molecule.value ? { molecule: molecule.value } : {}),
    state: node.state,
    ...(mass ? { mass } : {}),
    ...(purity ? { purity } : {}),
    ...(artifacts.values.length > 0 ? { artifacts: artifacts.values } : {}),
    notes: node.notes
  } as TypedBatchNode;

  return output;
};

export const buildReactionNode = (
  node: ReactionNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("reaction", node);
  const temperature = collectQuantity(output, "temperature", "temperature", node.temperature, context.objectIndex, node.fieldSpans?.temperature);
  const time = collectQuantity(output, "time", "time", node.time, context.objectIndex, node.fieldSpans?.time);
  const pressure = collectQuantity(output, "pressure", "pressure", node.pressure, context.objectIndex, node.fieldSpans?.pressure);
  const atmosphere = normalizeAtmosphere(node.atmosphere);
  const reactants = buildReactionParticipants("reactant", node.reactants ?? [], node, context);
  const products = buildReactionParticipants("product", node.products ?? [], node, context);
  const participants = [...reactants.participants, ...products.participants];
  const hasStoichiometryFacts = participants.some((participant) =>
    participant.role === "reactant"
    && (participant.amount || participant.equivalents || participant.mass || participant.volume || participant.limiting)
  );
  const stoichiometryDiagnostics = validateStoichiometry(node, participants);
  const prev = resolveReactionPrevReferences({
    documentId: context.documentId,
    objectIndex: context.objectIndex,
    externalTargetIndex: context.externalTargetIndex,
    rawValues: node.prev ?? [],
    sourceNodeId: node.id
  });

  output.quantities.push(...reactants.quantities, ...products.quantities);
  output.diagnostics.push(
    ...reactants.diagnostics,
    ...products.diagnostics,
    ...stoichiometryDiagnostics,
    ...prev.diagnostics
  );

  output.node = {
    ...output.node,
    route: node.route,
    prev: prev.values,
    next: [],
    reactants: reactants.references,
    products: products.references,
    participants,
    stoichiometry: {
      limitingParticipantId: participants.find((participant) => participant.limiting === true)?.id,
      consistencyStatus: stoichiometryDiagnostics.some((diagnostic) => diagnostic.severity === "error")
        ? "error"
        : hasStoichiometryFacts ? "ok" : "unknown"
    },
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
  const yieldPercent = collectQuantity(output, "yield", "percent", node.yield, context.objectIndex, node.fieldSpans?.yield);
  const conversion = collectQuantity(output, "conversion", "percent", node.conversion, context.objectIndex, node.fieldSpans?.conversion);
  const selectivity = collectQuantity(output, "selectivity", "percent", node.selectivity, context.objectIndex, node.fieldSpans?.selectivity);
  const purity = collectQuantity(output, "purity", "percent", node.purity, context.objectIndex, node.fieldSpans?.purity);
  const relationships = resolveResultRelationships(node, context.objectIndex, context.externalTargetIndex);
  const isolatedMass = collectQuantity(
    output,
    "isolated_mass",
    "mass",
    node.isolated_mass,
    context.objectIndex,
    node.fieldSpans?.isolated_mass
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
  }, context.externalTargetIndex);

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
  const purity = collectQuantity(output, "purity", "percent", node.purity, context.objectIndex, node.fieldSpans?.purity);
  const relationships = resolveSampleRelationships(node, context.objectIndex, context.externalTargetIndex);
  const artifacts = resolveReferenceList(node.artifacts ?? [], context.objectIndex, {
    sourceNodeType: "sample",
    sourceNodeId: node.id,
    field: "artifacts",
    expectedTargetKind: "artifact"
  }, context.externalTargetIndex);

  output.diagnostics.push(...relationships.diagnostics, ...artifacts.diagnostics);

  output.node = {
    ...output.node,
    name: node.name,
    sampleCode: node.sample_id,
    ...(relationships.ref ? { ref: relationships.ref } : {}),
    ...(relationships.derivedFrom ? { derivedFrom: relationships.derivedFrom } : {}),
    ...(relationships.aliquotOf ? { aliquotOf: relationships.aliquotOf } : {}),
    ...(relationships.batchOf ? { batchOf: relationships.batchOf } : {}),
    ...(artifacts.values.length > 0 ? { artifacts: artifacts.values } : {}),
    ...(purity ? { purity } : {}),
    supplier: node.supplier,
    notes: node.notes
  } as TypedSampleNode;

  return output;
};

export const buildArtifactNode = (
  node: ArtifactNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("artifact", node);
  const reference = resolveOptionalReference(node.ref, context.objectIndex, {
    sourceNodeType: "artifact",
    sourceNodeId: node.id,
    field: "ref"
  }, context.externalTargetIndex);

  output.diagnostics.push(...reference.diagnostics);
  output.node = {
    ...output.node,
    artifactKind: node.kind,
    ...(reference.value ? { ref: reference.value } : {}),
    path: node.path,
    checksum: node.checksum,
    instrument: node.instrument,
    notes: node.notes
  } as TypedArtifactNode;

  return output;
};

export const buildConditionVariesNode = (
  node: ConditionVariesNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("condition_varies", node);
  const reaction = resolveOptionalReference(node.reaction, context.objectIndex, {
    sourceNodeType: "condition_varies",
    sourceNodeId: node.id,
    field: "reaction",
    expectedTargetKind: "reaction"
  }, context.externalTargetIndex);
  const standard = resolveOptionalReference(node.standard, context.objectIndex, {
    sourceNodeType: "condition_varies",
    sourceNodeId: node.id,
    field: "standard",
    expectedTargetKind: "reaction"
  }, context.externalTargetIndex);
  const attemptDiagnostics = (node.attempts ?? []).flatMap((attempt) => [
    ...resolveOptionalReference(attempt.reaction, context.objectIndex, {
      sourceNodeType: "condition_varies",
      sourceNodeId: node.id,
      field: `${attempt.id}.reaction`,
      expectedTargetKind: "reaction"
    }, context.externalTargetIndex).diagnostics,
    ...resolveOptionalReference(attempt.result, context.objectIndex, {
      sourceNodeType: "condition_varies",
      sourceNodeId: node.id,
      field: `${attempt.id}.result`,
      expectedTargetKind: "result"
    }, context.externalTargetIndex).diagnostics
  ]);

  output.diagnostics.push(...reaction.diagnostics, ...standard.diagnostics, ...attemptDiagnostics);
  output.node = {
    ...output.node,
    ...(reaction.value ? { reaction: reaction.value } : {}),
    ...(standard.value ? { standard: standard.value } : {}),
    condition: node.condition,
    varyFields: node.varyFields,
    changes: node.changes,
    attempts: node.attempts,
    notes: node.notes
  } as TypedConditionVariesNode;

  return output;
};

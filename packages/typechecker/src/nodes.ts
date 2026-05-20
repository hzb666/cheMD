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
  SourceSpan,
  TraceNode
} from "@chemd/core";
import {
  classifyReactionConditions,
  classifyTlcAnalysis,
  getQuantityUnit,
  normalizeAnalysis
} from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import {
  validateInChI,
  validateInChIKey,
  validateRxnSmilesSurface,
  validateSmilesSurface,
  type InteropDiagnostic
} from "@chemd/interoperability";

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
  TypedSemanticNode,
  TypedTraceNode
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

const createInteropDiagnostic = (
  diagnostic: InteropDiagnostic,
  node: ObjectNode,
  fallbackField: string
): V03Diagnostic =>
  createV03Diagnostic({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    sourceLayer: "typechecker",
    sourceNodeType: node.type,
    sourceNodeId: node.id,
    sourceField: diagnostic.field ?? fallbackField,
    facts: {
      field: diagnostic.field ?? fallbackField,
      interop_source: "interoperability",
      ...(diagnostic.facts ?? {})
    }
  });

const hasMoleculeIdentity = (node: MoleculeNode): boolean =>
  Boolean(node.name || node.smiles || node.cas || node.inchi || node.inchikey || node.canonical_smiles || node.formula || node.mw);

const getMoleculeSmiles = (
  node: MoleculeNode | undefined
): string | undefined =>
  node?.canonical_smiles?.trim() || node?.smiles?.trim() || undefined;

const resolveObjectReference = (
  value: string | ReferenceOrLiteral | undefined,
  objectIndex: Map<string, ObjectNode>
): ObjectNode | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return objectIndex.get(normalizeRefId(value));
  }

  return value.kind === "reference" && value.resolved
    ? objectIndex.get(value.refId)
    : undefined;
};

const resolveParticipantSmiles = (
  participant: TypedReactionParticipant,
  objectIndex: Map<string, ObjectNode>
): string | undefined => {
  const target = resolveObjectReference(participant.reference, objectIndex);
  if (!target) {
    return undefined;
  }

  if (target.type === "molecule") {
    return getMoleculeSmiles(target);
  }

  if (target.type === "material") {
    const molecule = resolveObjectReference(target.molecule, objectIndex);
    return molecule?.type === "molecule" ? getMoleculeSmiles(molecule) : undefined;
  }

  if (target.type === "batch") {
    const molecule = resolveObjectReference(target.molecule, objectIndex);
    return molecule?.type === "molecule" ? getMoleculeSmiles(molecule) : undefined;
  }

  return undefined;
};

const splitRxnSmilesComponents = (
  rxnSmiles: string
): { reactants: string[]; products: string[] } | undefined => {
  const [reactantSide, productSide, extra] = rxnSmiles.trim().split(">>");
  if (extra !== undefined || !reactantSide || !productSide) {
    return undefined;
  }

  const splitSide = (side: string): string[] =>
    side.split(".").map((component) => component.trim()).filter(Boolean);

  const reactants = splitSide(reactantSide);
  const products = splitSide(productSide);

  return reactants.length > 0 && products.length > 0
    ? { reactants, products }
    : undefined;
};

const sortComponents = (values: string[]): string[] => [...values].sort((left, right) => left.localeCompare(right));

const sameComponents = (
  left: string[],
  right: string[]
): boolean => {
  const leftSorted = sortComponents(left);
  const rightSorted = sortComponents(right);
  return leftSorted.length === rightSorted.length
    && leftSorted.every((value, index) => value === rightSorted[index]);
};

const validateRxnSmilesParticipants = (
  node: ReactionNode,
  participants: TypedReactionParticipant[],
  objectIndex: Map<string, ObjectNode>
): V03Diagnostic[] => {
  if (!node.rxn_smiles) {
    return [];
  }

  const parsed = splitRxnSmilesComponents(node.rxn_smiles);
  if (!parsed) {
    return [];
  }

  return (["reactant", "product"] as const).flatMap((role) => {
    const roleParticipants = participants.filter((participant) => participant.role === role);
    if (roleParticipants.length === 0) {
      return [];
    }

    const identities = roleParticipants.map((participant) => ({
      participant,
      smiles: resolveParticipantSmiles(participant, objectIndex)
    }));
    const missing = identities.filter((identity) => !identity.smiles);
    if (missing.length > 0) {
      return [createTypedDiagnostic(
        "E_INTEROP_RXN_SMILES_UNVERIFIED",
        `RXN SMILES ${role} side cannot be verified against all participants.`,
        node,
        "rxn_smiles",
        {
          role,
          participant_ids: missing.map((identity) => identity.participant.id)
        }
      )];
    }

    const participantComponents = identities.map((identity) => identity.smiles as string);
    const rxnComponents = role === "reactant" ? parsed.reactants : parsed.products;
    return sameComponents(participantComponents, rxnComponents)
      ? []
      : [createTypedDiagnostic(
          "E_INTEROP_RXN_SMILES_PARTICIPANT_CONFLICT",
          `RXN SMILES ${role} side conflicts with reaction participants.`,
          node,
          "rxn_smiles",
          {
            role,
            rxn_smiles_components: sortComponents(rxnComponents),
            participant_components: sortComponents(participantComponents)
          }
        )];
  });
};

const inferRxnSmilesFromParticipants = (
  participants: TypedReactionParticipant[],
  objectIndex: Map<string, ObjectNode>
): string | undefined => {
  const buildSide = (role: "reactant" | "product"): string[] | undefined => {
    const roleParticipants = participants.filter((participant) => participant.role === role);
    if (roleParticipants.length === 0) {
      return undefined;
    }

    const smiles = roleParticipants.map((participant) => resolveParticipantSmiles(participant, objectIndex));
    return smiles.every((value): value is string => typeof value === "string" && value.length > 0 && !value.includes("."))
      ? smiles
      : undefined;
  };

  const reactants = buildSide("reactant");
  const products = buildSide("product");
  return reactants && products ? `${reactants.join(".")}>>${products.join(".")}` : undefined;
};

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
    ...[identityWarning, legacyAmountDiagnostic].filter((item): item is V03Diagnostic => Boolean(item)),
    ...(node.smiles ? validateSmilesSurface(node.smiles).map((item) => createInteropDiagnostic(item, node, "smiles")) : []),
    ...(node.inchi ? validateInChI(node.inchi).map((item) => createInteropDiagnostic(item, node, "inchi")) : []),
    ...(node.inchikey
      ? validateInChIKey(node.inchikey).map((item) => createInteropDiagnostic(item, node, "inchikey"))
      : [])
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
  const rxnSmilesDiagnostics = node.rxn_smiles
    ? validateRxnSmilesSurface(node.rxn_smiles).map((item) => createInteropDiagnostic(item, node, "rxn_smiles"))
    : [];
  const inferredRxnSmiles = inferRxnSmilesFromParticipants(participants, context.objectIndex);

  output.quantities.push(...reactants.quantities, ...products.quantities);
  output.diagnostics.push(
    ...reactants.diagnostics,
    ...products.diagnostics,
    ...stoichiometryDiagnostics,
    ...prev.diagnostics,
    ...rxnSmilesDiagnostics,
    ...(rxnSmilesDiagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? []
      : validateRxnSmilesParticipants(node, participants, context.objectIndex))
  );

  output.node = {
    ...output.node,
    route: node.route,
    rxn_smiles: node.rxn_smiles ?? inferredRxnSmiles,
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

const hasLegacyTlcLaneFields = (node: AnalysisNode): boolean =>
  Object.keys(node).some((key) => /^p\d+$/.test(key));

const hasTlcLaneInput = (node: AnalysisNode): boolean =>
  Boolean(node.tlcLanes?.length) || hasLegacyTlcLaneFields(node);

const analysisKindValue = (node: AnalysisNode): string | undefined =>
  normalizeAnalysisType(node.type_name)?.value;

const createAnalysisDiagnostic = (
  code: string,
  message: string,
  node: AnalysisNode,
  field: string,
  facts: Record<string, unknown> = {}
): V03Diagnostic =>
  createTypedDiagnostic(code, message, node, field, facts);

const validateTlcAnalysis = (node: AnalysisNode, output: BuiltTypedNode): void => {
  const normalizedTlc = classifyTlcAnalysis(node);
  for (const lane of normalizedTlc?.lanes ?? []) {
    if (lane.lane_role === "custom" && !lane.lane_label_raw.startsWith("@")) {
      output.diagnostics.push(createAnalysisDiagnostic(
        "E_TLC_LABEL_UNKNOWN",
        `TLC lane label must be a built-in role or object reference: ${lane.lane_label_raw}`,
        node,
        "lane",
        { lane_label: lane.lane_label_raw }
      ));
    }

    for (const spot of lane.spots) {
      if (spot.label_raw && !spot.role && !spot.ref) {
        output.diagnostics.push(createAnalysisDiagnostic(
          "E_TLC_LABEL_UNKNOWN",
          `TLC spot label must be a built-in role or object reference: ${spot.label_raw}`,
          node,
          "spot",
          { spot_label: spot.label_raw }
        ));
      }
      if (spot.is_reference && !spot.source_spot_id) {
        output.diagnostics.push(createAnalysisDiagnostic(
          spot.role === "unknown" ? "E_TLC_UNKNOWN_REFERENCE" : "E_TLC_SPOT_REFERENCE",
          `TLC spot reference could not be resolved uniquely: ${spot.label_raw ?? spot.ref ?? spot.raw}`,
          node,
          "spot",
          { spot_label: spot.label_raw, ref: spot.ref, role: spot.role }
        ));
      }
      if (!spot.is_reference && spot.rf !== undefined && !spot.role && !spot.ref && (lane.lane_role === "reaction_mixture" || lane.lane_role === "custom")) {
        output.diagnostics.push(createAnalysisDiagnostic(
          "E_TLC_SPOT_LABEL_REQUIRED",
          "TLC spot on a mixed or custom lane requires an explicit role or object reference.",
          node,
          "spot",
          { lane_label: lane.lane_label_raw, raw: spot.raw }
        ));
      }
    }
  }
};

const validateParsedAnalysis = (node: AnalysisNode, output: BuiltTypedNode): void => {
  const kind = analysisKindValue(node);
  const hasLane = hasTlcLaneInput(node);
  const hasPeak = Boolean(node.peaks?.length);
  const hasIon = Boolean(node.ions?.length);

  if (!kind) {
    return;
  }

  if (kind === "tlc") {
    if (hasPeak || hasIon || node.spectrum) {
      output.diagnostics.push(createAnalysisDiagnostic(
        "E_ANALYSIS_FIELD_FOR_TYPE",
        "TLC analysis cannot contain spectrum, peak, or ion fields.",
        node,
        "type",
        { analysis_type: kind }
      ));
    }
    validateTlcAnalysis(node, output);
    return;
  }

  if (hasLane) {
    output.diagnostics.push(createAnalysisDiagnostic(
      "E_ANALYSIS_FIELD_FOR_TYPE",
      `Analysis type ${kind} cannot contain TLC lane fields.`,
      node,
      "lane",
      { analysis_type: kind }
    ));
  }

  const normalized = normalizeAnalysis(node);
  if (kind === "nmr") {
    if (hasIon) {
      output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_FIELD_FOR_TYPE", "NMR analysis cannot contain ion fields.", node, "ion"));
    }
    const nmr = normalized?.kind === "nmr" ? normalized : undefined;
    for (const peak of nmr?.peaks ?? []) {
      if (peak.shift === undefined && peak.minShift === undefined) {
        output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_PEAK_SYNTAX", `NMR peak lacks a chemical shift: ${peak.raw}`, node, "peak", { raw: peak.raw }));
      }
    }
    if (nmr?.spectrum?.frequency && node.frequency && normalizeRefId(node.frequency) !== nmr.spectrum.frequency.raw) {
      output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_SPECTRUM_CONFLICT", "NMR spectrum frequency conflicts with explicit frequency field.", node, "frequency"));
    }
    if (nmr?.spectrum?.solvent && node.solvent && normalizeRefId(node.solvent) !== nmr.spectrum.solvent) {
      output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_SPECTRUM_CONFLICT", "NMR spectrum solvent conflicts with explicit solvent field.", node, "solvent"));
    }
    return;
  }

  if (["hplc", "uplc", "gc"].includes(kind) && hasIon) {
    output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_FIELD_FOR_TYPE", `${kind} analysis cannot contain ion fields.`, node, "ion"));
  }
  if (["hplc", "uplc", "gc", "gcms", "lcms"].includes(kind)) {
    const chrom = normalized && "peaks" in normalized ? normalized.peaks : [];
    for (const peak of chrom) {
      if (!("retentionTime" in peak) || !peak.retentionTime) {
        output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_PEAK_SYNTAX", `Chromatography peak lacks retention time: ${peak.raw}`, node, "peak", { raw: peak.raw }));
      }
    }
  }
  if (kind === "lcms" && hasPeak && !hasIon) {
    output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_ION_REQUIRED", "LCMS analysis with peaks must include ion fields.", node, "ion"));
  }
  if (["gcms", "lcms", "ms", "hrms"].includes(kind)) {
    const ions = normalized && "ions" in normalized ? normalized.ions : [];
    for (const ion of ions) {
      if (ion.mz === undefined) {
        output.diagnostics.push(createAnalysisDiagnostic("E_ANALYSIS_ION_SYNTAX", `MS ion lacks m/z: ${ion.raw}`, node, "ion", { raw: ion.raw }));
      }
    }
  }
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
  const artifacts = resolveReferenceList(node.artifacts ?? [], context.objectIndex, {
    sourceNodeType: "analysis",
    sourceNodeId: node.id,
    field: "artifact",
    expectedTargetKind: "artifact"
  }, context.externalTargetIndex);
  const normalizedAnalysis = normalizeAnalysis(node);

  output.diagnostics.push(...reference.diagnostics, ...artifacts.diagnostics);
  validateParsedAnalysis(node, output);
  output.node = {
    ...output.node,
    ...(analysisType ? { analysisType } : {}),
    normalizedAnalysis: normalizedAnalysis ?? null,
    normalizedTlc: normalizedAnalysis?.kind === "tlc" ? normalizedAnalysis.tlc : classifyTlcAnalysis(node) ?? null,
    ...(reference.value ? { ref: reference.value } : {}),
    ...(artifacts.values.length > 0 ? { artifacts: artifacts.values } : {}),
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

export const buildTraceNode = (
  node: TraceNode,
  context: BuildNodeContext
): BuiltTypedNode => {
  const output = createBase("trace", node);
  const plan = resolveOptionalReference(node.plan, context.objectIndex, {
    sourceNodeType: "trace",
    sourceNodeId: node.id,
    field: "plan",
    expectedTargetKind: "procedure"
  }, context.externalTargetIndex);

  output.diagnostics.push(...plan.diagnostics);
  output.node = {
    ...output.node,
    ...(plan.value ? { plan: plan.value } : {}),
    mode: node.mode,
    eventCount: node.events?.length ?? 0
  } as TypedTraceNode;

  return output;
};

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

const resultOutcomeValue = (node: ObjectNode | undefined, field: string): string | undefined => {
  if (!node || node.type !== "result") {
    return undefined;
  }

  const result = node as ResultNode;
  switch (field) {
    case "yield":
      return result.yield;
    case "conversion":
      return result.conversion;
    case "selectivity":
      return result.selectivity;
    case "purity":
      return result.purity;
    default:
      return undefined;
  }
};

const normalizeComparableValue = (value: string | undefined): string | undefined =>
  value?.trim().replace(/\s+/g, " ");

const findResultForReaction = (
  reactionRef: string | undefined,
  objectIndex: Map<string, ObjectNode>
): ResultNode | undefined => {
  if (!reactionRef) {
    return undefined;
  }

  const reactionId = normalizeRefId(reactionRef);
  const results = [...new Set(objectIndex.values())].filter((candidate): candidate is ResultNode =>
    candidate.type === "result" && normalizeRefId(candidate.reaction ?? candidate.ref ?? "") === reactionId
  );
  return results.length === 1 ? results[0] : undefined;
};

const validateConditionOutcomes = (
  node: ConditionVariesNode,
  context: BuildNodeContext
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  const standardResult = findResultForReaction(node.standard, context.objectIndex);

  for (const outcome of node.outcomes ?? []) {
    const inferred = resultOutcomeValue(standardResult, outcome.field);
    if (
      inferred
      && outcome.baseline
      && normalizeComparableValue(inferred) !== normalizeComparableValue(outcome.baseline)
    ) {
      diagnostics.push(createTypedDiagnostic(
        "E_CONDITION_BASELINE_CONFLICT",
        `Outcome baseline conflicts with standard result field ${outcome.field}.`,
        node,
        "outcome",
        { outcome: outcome.field, baseline: outcome.baseline, inferred }
      ));
    }
  }

  for (const attempt of node.attempts ?? []) {
    for (const outcome of node.outcomes ?? []) {
      if (!attempt.outcomes || attempt.outcomes[outcome.field] === undefined) {
        diagnostics.push(createTypedDiagnostic(
          "E_CONDITION_OUTCOME_MISSING",
          `Attempt ${attempt.id} is missing outcome ${outcome.field}.`,
          node,
          outcome.field,
          { attempt_id: attempt.id, outcome: outcome.field }
        ));
      }
    }

    const resultId = attempt.result ? normalizeRefId(attempt.result) : undefined;
    const resultNode = resultId ? context.objectIndex.get(resultId) : undefined;
    for (const [field, value] of Object.entries(attempt.outcomes ?? {})) {
      const resultValue = resultOutcomeValue(resultNode, field);
      if (resultValue && normalizeComparableValue(resultValue) !== normalizeComparableValue(value)) {
        diagnostics.push(createTypedDiagnostic(
          "E_CONDITION_OUTCOME_CONFLICT",
          `Attempt outcome conflicts with linked result field ${field}.`,
          node,
          `${attempt.id}.${field}`,
          { attempt_id: attempt.id, outcome: field, value, result_value: resultValue }
        ));
      }
    }
  }

  return diagnostics;
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

  output.diagnostics.push(
    ...reaction.diagnostics,
    ...standard.diagnostics,
    ...attemptDiagnostics,
    ...validateConditionOutcomes(node, context)
  );
  output.node = {
    ...output.node,
    ...(reaction.value ? { reaction: reaction.value } : {}),
    ...(standard.value ? { standard: standard.value } : {}),
    factors: node.factors,
    outcomes: node.outcomes,
    condition: node.condition,
    varyFields: node.varyFields,
    changes: node.changes,
    attempts: node.attempts,
    notes: node.notes
  } as TypedConditionVariesNode;

  return output;
};

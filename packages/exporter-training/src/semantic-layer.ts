import type {
  AnalysisNode,
  ArtifactNode,
  BatchNode,
  ChemdDocument,
  ChemdNode,
  ConditionVariesNode,
  MarkdownNode,
  MaterialNode,
  MoleculeNode,
  NormalizedAnalysis,
  ReactionNode,
  ResultNode,
  SampleNode
} from "@chemd/core";
import {
  buildEntityIdFromReference,
  stripReferencePrefix,
  type ReferenceTargetKind
} from "@chemd/core";

import type {
  ExportedAnalysisV1,
  ExportedArtifactV1,
  ExportedBatchV1,
  ExportedConditionVariationAttemptV1,
  ExportedConditionVaryV1,
  ExportedMaterialV1,
  ExportedMarkdownBlockV1,
  ExportedMoleculeV1,
  ExportedReactionV1,
  ExportedRelationV1,
  ExportedResultV1,
  ExportedSampleV1,
  NumericWithUnit,
  ParsedMeasurementV1,
  ReactionParticipantV1,
  SemanticLayerV1
} from "./types";
import { collectExportableNodes } from "./traversal";
import type {
  QuantityType,
  ReferenceOrLiteral,
  TypedAnalysisNode,
  TypedArtifactNode,
  TypedBatchNode,
  TypedConditionVariesNode,
  TypedMaterialNode,
  TypedMoleculeNode,
  TypedReactionParticipant,
  TypedReactionNode,
  TypedResultNode,
  TypedSampleNode,
  TypedSemanticGraph
} from "@chemd/typechecker";

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const compactText = (...parts: Array<string | undefined>): string | undefined => {
  const text = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");

  return text || undefined;
};

const buildEntityId = (
  prefix: "mol" | "mat" | "bat" | "rxn" | "res" | "ana" | "sam" | "art" | "cv" | "cva" | "md",
  documentId: string,
  originalId: string | undefined,
  nodeIndex: number
): string => `${prefix}::${documentId}::${originalId ?? nodeIndex}`;

type PrimaryNodeType = "molecule" | "reaction" | "result" | "analysis" | "sample";
type ExportedObjectEntity =
  | ExportedMoleculeV1
  | ExportedMaterialV1
  | ExportedBatchV1
  | ExportedReactionV1
  | ExportedResultV1
  | ExportedAnalysisV1
  | ExportedSampleV1
  | ExportedArtifactV1
  | ExportedConditionVaryV1
  | ExportedConditionVariationAttemptV1;

type RelationType = ExportedRelationV1["relation_type"];
type ResolvedEntityTarget = Pick<ExportedObjectEntity, "entity_id" | "original_id" | "source_node_type">;
type LinkTarget = ExportedObjectEntity | ResolvedEntityTarget;
type EntityIndex = Map<string, ExportedObjectEntity>;

const SOURCE_NODE_TYPE_BY_TARGET_KIND: Partial<Record<ReferenceTargetKind, ResolvedEntityTarget["source_node_type"]>> = {
  molecule: "molecule",
  material: "material",
  batch: "batch",
  reaction: "reaction",
  result: "result",
  analysis: "analysis",
  sample: "sample",
  artifact: "artifact",
  condition_varies: "condition_varies",
  condition_variation_attempt: "condition_variation_attempt"
};

const PRIMARY_FIELD_BY_TYPE: Record<PrimaryNodeType, string> = {
  molecule: "primary_molecule",
  reaction: "primary_reaction",
  result: "primary_result",
  analysis: "primary_analysis",
  sample: "primary_sample"
};

const getOriginalId = (node: ChemdNode): string | undefined => {
  if ("id" in node && typeof node.id === "string" && node.id) {
    return node.id;
  }

  return undefined;
};

const isPrimaryEntity = (document: ChemdDocument, node: ChemdNode): boolean => {
  const originalId = getOriginalId(node);
  if (!originalId) {
    return false;
  }

  if (!["molecule", "reaction", "result", "analysis", "sample"].includes(node.type)) {
    return false;
  }

  const field = PRIMARY_FIELD_BY_TYPE[node.type as PrimaryNodeType];
  return document.meta[field] === originalId;
};

const asNodeArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const readNodeStringField = (node: ChemdNode, field: string): string | undefined => {
  if (!(field in node)) {
    return undefined;
  }

  const value = (node as unknown as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
};

const createEntityBase = (
  sourceNodeType: string,
  node: ChemdNode
): Pick<ExportedReactionV1, "source_block_type" | "syntax_origin" | "declared_kind" | "field_source_spans"> => ({
  source_block_type: readNodeStringField(node, "syntaxOrigin") ?? sourceNodeType,
  syntax_origin: readNodeStringField(node, "syntaxOrigin"),
  declared_kind: readNodeStringField(node, "declaredKind"),
  field_source_spans: "fieldSpans" in node ? node.fieldSpans : undefined
});

const indexTypedNodes = (
  typedGraph: TypedSemanticGraph | undefined
): Map<string, TypedSemanticGraph["nodes"][number]> =>
  new Map(typedGraph?.nodes.map((node) => [node.nodeId, node]) ?? []);

const toNumericWithUnit = (quantity: QuantityType | undefined): NumericWithUnit | null | undefined => {
  if (!quantity) {
    return undefined;
  }

  const value = typeof quantity.canonicalValue === "number" ? quantity.canonicalValue : quantity.value;
  const unit = quantity.canonicalUnit ?? quantity.unit;

  if (typeof value !== "number" || !unit) {
    return null;
  }

  return {
    raw: quantity.raw,
    value,
    unit,
    ...(typeof quantity.minValue === "number" ? { min_value: quantity.minValue } : {}),
    ...(typeof quantity.maxValue === "number" ? { max_value: quantity.maxValue } : {}),
    ...(typeof quantity.uncertainty === "number" ? { uncertainty: quantity.uncertainty } : {}),
    ...(quantity.unit && quantity.unit !== unit ? { original_unit: quantity.unit } : {}),
    ...(quantity.comparator ? { comparator: quantity.comparator } : {}),
    ...(quantity.valueKind ? { value_kind: quantity.valueKind } : {}),
    ...(quantity.normalizedText ? { normalized_text: quantity.normalizedText } : {})
  };
};

const toNumericValue = (quantity: QuantityType | undefined): number | null | undefined => {
  if (!quantity) {
    return undefined;
  }

  const value = typeof quantity.canonicalValue === "number" ? quantity.canonicalValue : quantity.value;
  return typeof value === "number" ? value : null;
};

const readChemistryFeatureIds = (
  node: { chemistryFeatureRefs?: Array<{ featureId: string }> }
): string[] | undefined => {
  const ids = node.chemistryFeatureRefs?.map((feature) => feature.featureId).filter(Boolean) ?? [];
  return ids.length > 0 ? ids : undefined;
};

const readPercentText = (value: string | undefined): number | null | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const buildMolecule = (
  documentId: string,
  node: MoleculeNode,
  nodeIndex: number,
  isPrimary: boolean,
  typedMolecule: TypedMoleculeNode | undefined
): ExportedMoleculeV1 => ({
  entity_id: buildEntityId("mol", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "molecule",
  ...createEntityBase("molecule", node),
  ...(isPrimary ? { is_primary: true } : {}),
  name: node.name,
  role: node.role,
  caption: node.caption,
  smiles: node.smiles,
  cas: node.cas,
  inchi: node.inchi,
  inchikey: node.inchikey,
  canonical_smiles: node.canonical_smiles,
  formula: node.formula,
  mw: node.mw,
  amount_raw: node.amount,
  amount_value: toNumericWithUnit(typedMolecule?.amount),
  equivalents_raw: node.equivalents,
  equivalents_value: toNumericValue(typedMolecule?.equivalents),
  chemistry_feature_ref_ids: readChemistryFeatureIds(node),
  text_for_embedding: compactText(
    node.name,
    node.smiles,
    node.canonical_smiles,
    node.cas,
    node.inchi,
    node.inchikey,
    node.role,
    node.formula,
    node.mw,
    node.caption
  )
});

const buildMaterial = (
  documentId: string,
  node: MaterialNode,
  nodeIndex: number,
  typedMaterial: TypedMaterialNode | undefined
): ExportedMaterialV1 => ({
  entity_id: buildEntityId("mat", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "material",
  ...createEntityBase("material", node),
  molecule_ref_raw: node.molecule,
  supplier: node.supplier,
  lot: node.lot,
  purity_raw: node.purity,
  density: node.density,
  storage: node.storage,
  notes: node.notes,
  purity_percent: toNumericValue(typedMaterial?.purity),
  chemistry_feature_ref_ids: readChemistryFeatureIds(node),
  text_for_embedding: compactText(node.molecule, node.supplier, node.lot, node.purity, node.storage, node.notes)
});

const buildBatch = (
  documentId: string,
  node: BatchNode,
  nodeIndex: number,
  typedBatch: TypedBatchNode | undefined
): ExportedBatchV1 => ({
  entity_id: buildEntityId("bat", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "batch",
  ...createEntityBase("batch", node),
  source_ref_raw: node.source,
  molecule_ref_raw: node.molecule,
  state: node.state,
  mass_raw: node.mass,
  purity_raw: node.purity,
  artifact_refs_raw: node.artifacts,
  mass: toNumericWithUnit(typedBatch?.mass),
  purity_percent: toNumericValue(typedBatch?.purity),
  notes: node.notes,
  chemistry_feature_ref_ids: readChemistryFeatureIds(node),
  text_for_embedding: compactText(node.source, node.molecule, node.state, node.mass, node.purity, node.notes)
});

const createParticipant = (
  role: "reactant" | "product",
  raw: string,
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedParticipant?: TypedReactionParticipant
): ReactionParticipantV1 => {
  const reference = typedParticipant?.reference;
  const head = reference?.kind === "reference" ? `@${reference.refId}` : raw.split("|")[0]?.trim() ?? raw;
  if (reference?.kind !== "reference" && !head.startsWith("@")) {
    return {
      role,
      participant_id: typedParticipant?.id,
      raw,
      reference_status: "literal",
      amount: toNumericWithUnit(typedParticipant?.amount),
      mass: toNumericWithUnit(typedParticipant?.mass),
      volume: toNumericWithUnit(typedParticipant?.volume),
      equivalents: toNumericValue(typedParticipant?.equivalents),
      limiting: typedParticipant?.limiting
    };
  }

  const candidateId = reference?.kind === "reference" ? reference.refId : head.slice(1).trim();
  const target = entityByOriginalId.get(candidateId);

  if (target) {
    return {
      role,
      participant_id: typedParticipant?.id,
      raw,
      reference_status: "resolved",
      target_kind: target.source_node_type,
      target_entity_id: target.entity_id,
      target_original_id: target.original_id,
      ...("name" in target ? { name: target.name } : {}),
      ...("smiles" in target ? { smiles: target.smiles } : {}),
      ...("canonical_smiles" in target ? { canonical_smiles: target.canonical_smiles } : {}),
      amount: toNumericWithUnit(typedParticipant?.amount),
      mass: toNumericWithUnit(typedParticipant?.mass),
      volume: toNumericWithUnit(typedParticipant?.volume),
      equivalents: toNumericValue(typedParticipant?.equivalents),
      limiting: typedParticipant?.limiting
    };
  }

  const externalTarget = isResolvedReference(reference)
    ? buildExternalReferencedEntity(reference.targetKind, reference.refId)
    : undefined;

  return externalTarget && ["molecule", "material", "batch"].includes(externalTarget.source_node_type)
    ? {
        role,
        participant_id: typedParticipant?.id,
        raw,
        reference_status: "resolved",
        target_kind: externalTarget.source_node_type,
        target_entity_id: externalTarget.entity_id,
        target_original_id: externalTarget.original_id,
        amount: toNumericWithUnit(typedParticipant?.amount),
        mass: toNumericWithUnit(typedParticipant?.mass),
        volume: toNumericWithUnit(typedParticipant?.volume),
        equivalents: toNumericValue(typedParticipant?.equivalents),
        limiting: typedParticipant?.limiting
      }
    : {
        role,
        participant_id: typedParticipant?.id,
        raw,
        reference_status: "unresolved",
        amount: toNumericWithUnit(typedParticipant?.amount),
        mass: toNumericWithUnit(typedParticipant?.mass),
        volume: toNumericWithUnit(typedParticipant?.volume),
        equivalents: toNumericValue(typedParticipant?.equivalents),
        limiting: typedParticipant?.limiting
      };
};

const buildParsedMeasurements = (
  normalized: NormalizedAnalysis | null | undefined
): ParsedMeasurementV1[] | undefined => {
  if (!normalized) {
    return undefined;
  }

  const measurements: ParsedMeasurementV1[] = [];
  if (normalized.kind === "tlc") {
    for (const lane of normalized.tlc.lanes) {
      for (const spot of lane.spots) {
        if (spot.rf !== undefined && spot.rf !== null) {
          measurements.push({ measurement_type: "tlc_rf", raw: spot.raw, value: spot.rf, unit: "Rf" });
        }
      }
    }
  }
  if (normalized.kind === "nmr") {
    for (const peak of normalized.peaks) {
      const value = peak.shift ?? peak.maxShift ?? peak.minShift;
      measurements.push({ measurement_type: "nmr_shift", raw: peak.raw, value: value ?? null, unit: "ppm" });
    }
  }
  if ("peaks" in normalized && normalized.kind !== "nmr") {
    for (const peak of normalized.peaks) {
      if ("retentionTime" in peak) {
        measurements.push({
          measurement_type: "retention_time",
          raw: peak.raw,
          value: peak.retentionTime?.value ?? null,
          unit: peak.retentionTime?.unit ?? null
        });
      }
      if ("areaPercent" in peak && peak.areaPercent !== undefined) {
        measurements.push({ measurement_type: "area_percent", raw: peak.raw, value: peak.areaPercent, unit: "%" });
      }
    }
  }
  if ("ions" in normalized) {
    for (const ion of normalized.ions) {
      measurements.push({ measurement_type: "mz", raw: ion.raw, value: ion.mz ?? null, unit: "m/z" });
    }
  }

  return measurements.length > 0 ? measurements : undefined;
};

interface BuildReactionInput {
  documentId: string;
  node: ReactionNode;
  nodeIndex: number;
  isPrimary: boolean;
  entityByOriginalId: Map<string, ExportedObjectEntity>;
  typedReaction?: TypedReactionNode;
}

const buildReaction = (input: BuildReactionInput): ExportedReactionV1 => {
  const { documentId, node, nodeIndex, isPrimary, entityByOriginalId, typedReaction } = input;
  const typedReactants = typedReaction?.participants.filter((participant) => participant.role === "reactant") ?? [];
  const typedProducts = typedReaction?.participants.filter((participant) => participant.role === "product") ?? [];
  const reactants = asNodeArray(node.reactants).map((raw, index) =>
    createParticipant("reactant", raw, entityByOriginalId, typedReactants[index])
  );
  const products = asNodeArray(node.products).map((raw, index) =>
    createParticipant("product", raw, entityByOriginalId, typedProducts[index])
  );
  const conditions = asNodeArray(node.conditions);
  const compactConditions = conditions.length > 0 ? conditions : undefined;

  return {
    entity_id: buildEntityId("rxn", documentId, node.id, nodeIndex),
    original_id: node.id,
    node_index: nodeIndex,
    source_node_type: "reaction",
    ...createEntityBase("reaction", node),
    ...(isPrimary ? { is_primary: true } : {}),
    route_raw: node.route,
    prev_refs_raw: node.prev,
    resolved_prev_refs_raw: typedReaction?.prev
      .filter((reference): reference is typeof reference & { kind: "reference"; refId: string } =>
        reference.kind === "reference" && reference.resolved && reference.targetKind === "reaction"
      )
      .map((reference) => reference.refId),
    next_refs_raw: typedReaction?.next.map((reference) => reference.refId),
    name: node.name,
    caption: node.caption,
    reactants,
    products,
    conditions_raw: compactConditions,
    reagents_raw: node.reagents,
    catalyst_raw: node.catalyst,
    solvent_raw: node.solvent,
    temperature_raw: node.temperature,
    time_raw: node.time,
    pressure_raw: node.pressure,
    atmosphere_raw: node.atmosphere,
    yield_raw: node.yield,
    conversion_raw: node.conversion,
    selectivity_raw: node.selectivity,
    normalized_conditions: typedReaction?.normalizedConditions ?? {},
    normalized_outcome_hints: {
      yield_percent: readPercentText(node.yield),
      conversion_percent: readPercentText(node.conversion),
      selectivity_percent: readPercentText(node.selectivity)
    },
    chemistry_feature_ref_ids: readChemistryFeatureIds(node),
    text_for_embedding: compactText(
      node.name,
      node.caption,
      compactConditions?.join(" "),
      node.solvent,
      node.catalyst,
      node.reagents,
      node.temperature,
      node.time,
      node.pressure,
      node.atmosphere,
      node.yield,
      node.conversion,
      node.selectivity
    )
  };
};

const buildResult = (
  documentId: string,
  node: ResultNode,
  nodeIndex: number,
  isPrimary: boolean,
  typedResult: TypedResultNode | undefined
): ExportedResultV1 => ({
  entity_id: buildEntityId("res", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "result",
  ...createEntityBase("result", node),
  ...(isPrimary ? { is_primary: true } : {}),
  ref_raw: node.ref,
  reaction_ref_raw: node.reaction,
  product_ref_raw: node.product,
  status_raw: node.status,
  yield_raw: node.yield,
  conversion_raw: node.conversion,
  selectivity_raw: node.selectivity,
  isolated_mass_raw: node.isolated_mass,
  product_state: node.product_state,
  purity_raw: node.purity,
  notes: node.notes,
  status_label: typedResult?.status,
  yield_percent: toNumericValue(typedResult?.yield),
  conversion_percent: toNumericValue(typedResult?.conversion),
  selectivity_percent: toNumericValue(typedResult?.selectivity),
  purity_percent: toNumericValue(typedResult?.purity),
  isolated_mass: toNumericWithUnit(typedResult?.isolatedMass),
  text_for_embedding: compactText(
    node.status,
    node.notes,
    node.yield,
    node.conversion,
    node.selectivity,
    node.purity
  )
});

const buildAnalysis = (
  documentId: string,
  node: AnalysisNode,
  nodeIndex: number,
  isPrimary: boolean,
  typedAnalysis: TypedAnalysisNode | undefined
): ExportedAnalysisV1 => ({
  entity_id: buildEntityId("ana", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "analysis",
  ...createEntityBase("analysis", node),
  ...(isPrimary ? { is_primary: true } : {}),
  analysis_type: node.type_name,
  ref_raw: node.ref,
  time_raw: node.time,
  eluent_raw: node.eluent,
  plate_raw: node.plate,
  visualization_raw: node.visualization,
  result_raw: node.result,
  instrument: node.instrument,
  solvent: node.solvent,
  frequency: node.frequency,
  method: node.method,
  data_raw: node.data,
  notes: node.notes,
  artifact_refs_raw: node.artifacts,
  normalized_analysis: typedAnalysis?.normalizedAnalysis ?? null,
  normalized_tlc: typedAnalysis?.normalizedTlc ?? null,
  parsed_measurements: buildParsedMeasurements(typedAnalysis?.normalizedAnalysis),
  text_for_embedding: compactText(node.type_name, node.instrument, node.method, node.data, node.notes)
});

const buildSample = (
  documentId: string,
  node: SampleNode,
  nodeIndex: number,
  isPrimary: boolean,
  typedSample: TypedSampleNode | undefined
): ExportedSampleV1 => ({
  entity_id: buildEntityId("sam", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "sample",
  ...createEntityBase("sample", node),
  ...(isPrimary ? { is_primary: true } : {}),
  name: node.name,
  sample_code: node.sample_id,
  batch: node.batch,
  purity_raw: node.purity,
  supplier: node.supplier,
  notes: node.notes,
  ref_raw: node.ref,
  derived_from_raw: node.derived_from,
  aliquot_of_raw: node.aliquot_of,
  batch_of_raw: node.batch_of,
  artifact_refs_raw: node.artifacts,
  purity_percent: toNumericValue(typedSample?.purity),
  chemistry_feature_ref_ids: readChemistryFeatureIds(node),
  text_for_embedding: compactText(node.name, node.batch, node.supplier, node.notes)
});

const buildArtifact = (
  documentId: string,
  node: ArtifactNode,
  nodeIndex: number,
  typedArtifact: TypedArtifactNode | undefined
): ExportedArtifactV1 => ({
  entity_id: buildEntityId("art", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "artifact",
  ...createEntityBase("artifact", node),
  artifact_kind: typedArtifact?.artifactKind ?? node.kind,
  ref_raw: node.ref,
  path: node.path,
  checksum: node.checksum,
  instrument: node.instrument,
  notes: node.notes,
  chemistry_feature_ref_ids: readChemistryFeatureIds(node),
  text_for_embedding: compactText(node.kind, node.path, node.instrument, node.notes)
});

const exportConditionDelta = (
  change: ConditionVariesNode["changes"][number]
) => ({
  field: change.field,
  raw: change.raw,
  baseline_raw: change.baseline,
  candidate_raw: change.candidate
});

const buildConditionVaries = (
  documentId: string,
  node: ConditionVariesNode,
  nodeIndex: number,
  typedConditionVaries: TypedConditionVariesNode | undefined
): ExportedConditionVaryV1 => ({
  entity_id: buildEntityId("cv", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "condition_varies",
  ...createEntityBase("condition_varies", node),
  reaction_ref_raw: node.reaction,
  standard_ref_raw: node.standard,
  factors: node.factors?.map((variable) => ({
    field: variable.field,
    raw: variable.raw,
    baseline_raw: variable.baseline
  })),
  outcomes: node.outcomes?.map((variable) => ({
    field: variable.field,
    raw: variable.raw,
    baseline_raw: variable.baseline
  })),
  condition: node.condition?.map((variable) => ({
    field: variable.field,
    raw: variable.raw,
    baseline_raw: variable.baseline
  })),
  vary_fields: node.varyFields,
  changes: node.changes.map(exportConditionDelta),
  attempt_entity_ids: node.attempts?.map((attempt) =>
    buildEntityId("cva", documentId, `${node.id ?? nodeIndex}.${attempt.id}`, nodeIndex)
  ),
  notes: typedConditionVaries?.notes ?? node.notes,
  text_for_embedding: compactText(
    node.reaction ? `reaction ${node.reaction}` : undefined,
    node.standard ? `standard ${node.standard}` : undefined,
    node.condition?.map((variable) => `${variable.field}=${variable.baseline ?? variable.raw}`).join(" "),
    node.varyFields?.length ? `varies ${node.varyFields.join(", ")}` : undefined,
    ...node.changes.map((change) => `${change.field}: ${change.raw}`),
    ...(node.attempts ?? []).map((attempt) => `${attempt.id}: ${attempt.raw}`),
    node.notes
  )
});

const buildConditionVariationAttempts = (
  documentId: string,
  node: ConditionVariesNode,
  parent: ExportedConditionVaryV1,
  nodeIndex: number
): ExportedConditionVariationAttemptV1[] =>
  (node.attempts ?? []).map((attempt) => ({
    entity_id: buildEntityId("cva", documentId, `${node.id ?? nodeIndex}.${attempt.id}`, nodeIndex),
    original_id: node.id ? `${node.id}.${attempt.id}` : attempt.id,
    node_index: nodeIndex,
    source_node_type: "condition_variation_attempt",
    ...createEntityBase("condition_varies", node),
    parent_condition_variation_id: parent.entity_id,
    attempt_id: attempt.id,
    mode: attempt.mode ?? "partial",
    reaction_ref_raw: attempt.reaction,
    result_ref_raw: attempt.result,
    factors: attempt.factors,
    outcomes: attempt.outcomes,
    condition: attempt.condition.map(exportConditionDelta),
    changes: attempt.changes.map(exportConditionDelta),
    note: attempt.note,
    text_for_embedding: compactText(
      `attempt ${attempt.id}`,
      attempt.reaction ? `reaction ${attempt.reaction}` : undefined,
      attempt.result ? `result ${attempt.result}` : undefined,
      attempt.mode ? `mode ${attempt.mode}` : undefined,
      ...attempt.condition.map((change) => `${change.field}: ${change.candidate ?? change.raw}`),
      attempt.note
    )
  }));

const buildMarkdown = (documentId: string, node: MarkdownNode, nodeIndex: number): ExportedMarkdownBlockV1 => ({
  entity_id: buildEntityId("md", documentId, undefined, nodeIndex),
  node_index: nodeIndex,
  source_node_type: "markdown",
  ...createEntityBase("markdown", node),
  raw_text: node.value,
  cleaned_text: collapseWhitespace(node.value),
  references: node.references.map((reference) => ({
    raw: reference.raw,
    kind: reference.kind,
    source: reference.source,
    field: reference.field,
    resolution_status: reference.resolution?.status,
    resolution_value: reference.resolution?.value
  })),
  inline_chem: node.inlineChem.map((token) => ({ raw: token.raw, value: token.value })),
  inline_code: node.inlineCode.map((token) => ({ raw: token.raw, value: token.value })),
  links: node.links.map((token) => ({ raw: token.raw, label: token.label, href: token.href, safe: token.safe })),
  text_for_embedding: collapseWhitespace(node.value)
});

const buildPrimaryLinks = (
  documentId: string,
  entities: Array<{ entity_id: string; source_node_type: string; is_primary?: boolean }>
): ExportedRelationV1[] =>
  entities
    .filter((entity) => entity.is_primary)
    .map((entity) => ({
      relation_id: `rel::${documentId}::document_primary::${entity.entity_id}`,
      relation_type: "document_primary",
      from_entity_id: `doc::${documentId}`,
      to_entity_id: entity.entity_id,
      role: entity.source_node_type,
      confidence: 1
    }));

const createRelation = (
  documentId: string,
  relationType: RelationType,
  fromEntityId: string,
  toEntityId: string,
  role?: string
): ExportedRelationV1 => ({
  relation_id: `rel::${documentId}::${relationType}::${fromEntityId}::${role ?? "ref"}::${toEntityId}`,
  relation_type: relationType,
  from_entity_id: fromEntityId,
  to_entity_id: toEntityId,
  ...(role ? { role } : {}),
  confidence: 1
});

const normalizeReferenceId = (value: string): string => {
  const withoutPrefix = value.trim().startsWith("@") ? value.trim().slice(1) : value.trim();
  return withoutPrefix.split(".")[0]?.trim() ?? "";
};

const buildEntityIndex = (entities: ExportedObjectEntity[]): Map<string, ExportedObjectEntity> =>
  new Map(
    entities
      .filter((entity) => entity.original_id)
      .map((entity) => [entity.original_id as string, entity])
  );

const buildEntityIdIndex = (entities: ExportedObjectEntity[]): Map<string, ExportedObjectEntity> =>
  new Map(entities.map((entity) => [entity.entity_id, entity]));

const getReferencedEntity = (
  reference: string | undefined,
  entityByOriginalId: Map<string, ExportedObjectEntity>
): ExportedObjectEntity | undefined => {
  if (!reference) {
    return undefined;
  }

  const withoutPrefix = reference.trim().startsWith("@") ? reference.trim().slice(1) : reference.trim();
  return entityByOriginalId.get(withoutPrefix) ?? entityByOriginalId.get(normalizeReferenceId(reference));
};

const buildExternalReferencedEntity = (
  targetKind: ReferenceTargetKind,
  refId: string
): ResolvedEntityTarget | undefined => {
  const entityId = buildEntityIdFromReference(targetKind, refId);
  const sourceNodeType = SOURCE_NODE_TYPE_BY_TARGET_KIND[targetKind];

  return entityId && sourceNodeType
    ? {
        entity_id: entityId,
        original_id: stripReferencePrefix(refId),
        source_node_type: sourceNodeType
      }
    : undefined;
};

const isResolvedReference = (
  reference: ReferenceOrLiteral | undefined
): reference is Extract<ReferenceOrLiteral, { kind: "reference" }> =>
  reference?.kind === "reference" && reference.resolved;

const resolveTargetFromReference = (
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  reference: ReferenceOrLiteral | undefined
): ResolvedEntityTarget | undefined => {
  if (!isResolvedReference(reference)) {
    return undefined;
  }

  return getReferencedEntity(reference.refId, entityByOriginalId)
    ?? buildExternalReferencedEntity(reference.targetKind, reference.refId);
};

const resolveTargetFromRaw = (
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  rawRef: string | undefined,
  expectedTargetKind: ReferenceTargetKind
): ResolvedEntityTarget | undefined =>
  rawRef
    ? getReferencedEntity(rawRef, entityByOriginalId)
      ?? buildExternalReferencedEntity(expectedTargetKind, rawRef)
    : undefined;

const getTargetByEntityId = (
  entityByEntityId: EntityIndex,
  entityId: string | undefined
): LinkTarget | undefined => {
  if (!entityId) {
    return undefined;
  }

  const localTarget = entityByEntityId.get(entityId);
  if (localTarget) {
    return localTarget;
  }

  const [prefix, documentId, ...rest] = entityId.split("::");
  const originalId = rest.join("::");

  if (!prefix || !documentId || !originalId) {
    return undefined;
  }

  const sourceNodeType = (() => {
    switch (prefix) {
      case "mol":
        return "molecule" as const;
      case "mat":
        return "material" as const;
      case "bat":
        return "batch" as const;
      case "rxn":
        return "reaction" as const;
      case "res":
        return "result" as const;
      case "ana":
        return "analysis" as const;
      case "sam":
        return "sample" as const;
      case "art":
        return "artifact" as const;
      case "cv":
        return "condition_varies" as const;
      case "cva":
        return "condition_variation_attempt" as const;
      default:
        return undefined;
    }
  })();

  return sourceNodeType
    ? {
        entity_id: entityId,
        original_id: `${documentId}#${originalId}`,
        source_node_type: sourceNodeType
      }
    : undefined;
};

const uniqueRelations = (relations: ExportedRelationV1[]): ExportedRelationV1[] =>
  Array.from(new Map(relations.map((relation) => [relation.relation_id, relation])).values());

const buildReactionParticipantLinks = (
  documentId: string,
  reactions: ExportedReactionV1[]
): ExportedRelationV1[] =>
  reactions.flatMap((reaction) => [
    ...reaction.reactants.flatMap((participant) =>
      participant.target_entity_id
        ? [createRelation(
            documentId,
            participant.target_kind === "material"
              ? "reaction_uses_material"
              : participant.target_kind === "batch" ? "reaction_uses_batch" : "reaction_uses_molecule",
            reaction.entity_id,
            participant.target_entity_id,
            "reactant"
          )]
        : []
    ),
    ...reaction.products.flatMap((participant) =>
      participant.target_entity_id
        ? [createRelation(
            documentId,
            participant.target_kind === "material"
              ? "reaction_produces_material"
              : participant.target_kind === "batch" ? "reaction_produces_batch" : "reaction_produces_molecule",
            reaction.entity_id,
            participant.target_entity_id,
            "product"
          )]
        : []
    )
  ]);

const buildMaterialLinks = (
  documentId: string,
  materials: ExportedMaterialV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] =>
  materials.flatMap((material) => {
    const typedMaterial = material.original_id ? typedNodes.get(material.original_id) : undefined;
    const target = typedMaterial?.kind === "material"
      ? resolveTargetFromReference(entityByOriginalId, typedMaterial.molecule)
      : resolveTargetFromRaw(entityByOriginalId, material.molecule_ref_raw, "molecule");
    return target?.source_node_type === "molecule"
      ? [createRelation(documentId, "material_is_molecule", material.entity_id, target.entity_id, "molecule")]
      : [];
  });

const getBatchSourceRelationType = (target: LinkTarget | undefined): RelationType | undefined => {
  if (target?.source_node_type === "reaction") {
    return "batch_derived_from_reaction";
  }
  if (target?.source_node_type === "result") {
    return "batch_related_to_result";
  }
  if (target?.source_node_type === "sample") {
    return "batch_derived_from_sample";
  }
  if (target?.source_node_type === "batch") {
    return "batch_derived_from_batch";
  }
  return undefined;
};

const buildBatchLinks = (
  documentId: string,
  batches: ExportedBatchV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] =>
  batches.flatMap((batch) => {
    const typedBatch = batch.original_id ? typedNodes.get(batch.original_id) : undefined;
    const sourceTarget = typedBatch?.kind === "batch"
      ? resolveTargetFromReference(entityByOriginalId, typedBatch.source)
      : getReferencedEntity(batch.source_ref_raw, entityByOriginalId);
    const moleculeTarget = typedBatch?.kind === "batch"
      ? resolveTargetFromReference(entityByOriginalId, typedBatch.molecule)
      : resolveTargetFromRaw(entityByOriginalId, batch.molecule_ref_raw, "molecule");
    const sourceRelation = getBatchSourceRelationType(sourceTarget);

    return [
      ...(sourceTarget && sourceRelation
        ? [createRelation(documentId, sourceRelation, batch.entity_id, sourceTarget.entity_id, "source")]
        : []),
      ...(moleculeTarget?.source_node_type === "molecule"
        ? [createRelation(documentId, "batch_has_molecule", batch.entity_id, moleculeTarget.entity_id, "molecule")]
        : [])
    ];
  });

const buildResultLinks = (
  documentId: string,
  results: ExportedResultV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] =>
  results.flatMap((result) => {
    const typedResult = result.original_id ? typedNodes.get(result.original_id) : undefined;
    const target = typedResult?.kind === "result"
      ? resolveTargetFromReference(entityByOriginalId, typedResult.reaction)
      : resolveTargetFromRaw(entityByOriginalId, result.reaction_ref_raw ?? result.ref_raw, "reaction");
    return target?.source_node_type === "reaction"
      ? [createRelation(documentId, "result_describes_reaction", result.entity_id, target.entity_id, "reaction")]
      : [];
  });

const resolveReactionRouteTargetId = (
  rawRef: string | undefined,
  entityByOriginalId: Map<string, ExportedObjectEntity>
): string | undefined => {
  const target = resolveTargetFromRaw(entityByOriginalId, rawRef, "reaction");
  return target?.source_node_type === "reaction" ? target.entity_id : undefined;
};

const buildReactionRouteLinks = (
  documentId: string,
  reactions: ExportedReactionV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>
): ExportedRelationV1[] =>
  reactions.flatMap((reaction) => [
    ...(reaction.resolved_prev_refs_raw ?? []).flatMap((rawRef) => {
      const targetId = resolveReactionRouteTargetId(rawRef, entityByOriginalId);
      return targetId
        ? [createRelation(documentId, "reaction_depends_on_reaction", reaction.entity_id, targetId, "prev")]
        : [];
    }),
    ...(reaction.next_refs_raw ?? []).flatMap((rawRef) => {
      const targetId = resolveReactionRouteTargetId(rawRef, entityByOriginalId);
      return targetId
        ? [createRelation(documentId, "reaction_precedes_reaction", reaction.entity_id, targetId, "next")]
        : [];
    })
  ]);

const getAnalysisRelationType = (target: LinkTarget | undefined): RelationType | undefined => {
  if (target?.source_node_type === "reaction") {
    return "analysis_targets_reaction";
  }
  if (target?.source_node_type === "result") {
    return "analysis_targets_result";
  }
  if (target?.source_node_type === "sample") {
    return "analysis_targets_sample";
  }
  if (target?.source_node_type === "condition_variation_attempt" || "attempt_id" in (target ?? {})) {
    return "analysis_targets_condition_variation_attempt";
  }
  if (target?.source_node_type === "condition_varies") {
    return "analysis_targets_condition_variation";
  }
  return undefined;
};

const buildAnalysisLinks = (
  documentId: string,
  analyses: ExportedAnalysisV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] =>
  analyses.flatMap((analysis) => {
    const typedAnalysis = analysis.original_id ? typedNodes.get(analysis.original_id) : undefined;
    const target = typedAnalysis?.kind === "analysis"
      ? resolveTargetFromReference(entityByOriginalId, typedAnalysis.ref)
      : getReferencedEntity(analysis.ref_raw, entityByOriginalId);
    const relationType = getAnalysisRelationType(target);
    return target && relationType
      ? [createRelation(documentId, relationType, analysis.entity_id, target.entity_id, "ref")]
      : [];
  });

const getSampleRelationType = (target: LinkTarget | undefined): RelationType | undefined => {
  if (target?.source_node_type === "reaction") {
    return "sample_derived_from_reaction";
  }
  if (target?.source_node_type === "result") {
    return "sample_related_to_result";
  }
  if (target?.source_node_type === "molecule") {
    return "sample_related_to_molecule";
  }
  if (target?.source_node_type === "material") {
    return "sample_from_material";
  }
  if (target?.source_node_type === "batch") {
    return "sample_from_batch";
  }
  if (target?.source_node_type === "sample") {
    return "sample_derived_from_sample";
  }
  return undefined;
};

const buildSampleLinks = (
  documentId: string,
  samples: ExportedSampleV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] =>
  samples.flatMap((sample) => {
    const typedSample = sample.original_id ? typedNodes.get(sample.original_id) : undefined;

    return [
      ...createSampleRefLink({
        documentId,
        sample,
        rawRef: sample.ref_raw,
        role: "ref",
        entityByOriginalId,
        typedReference: typedSample?.kind === "sample" ? typedSample.ref : undefined
      }),
      ...createSampleRefLink({
        documentId,
        sample,
        rawRef: sample.derived_from_raw,
        role: "derived_from",
        entityByOriginalId,
        typedReference: typedSample?.kind === "sample" ? typedSample.derivedFrom : undefined
      }),
      ...createSampleLineageLink({
        documentId,
        sample,
        rawRef: sample.aliquot_of_raw,
        relationType: "sample_aliquot_of_sample",
        role: "aliquot_of",
        expectedTargetType: "sample",
        entityByOriginalId,
        typedReference: typedSample?.kind === "sample" ? typedSample.aliquotOf : undefined
      }),
      ...createSampleLineageLink({
        documentId,
        sample,
        rawRef: sample.batch_of_raw,
        relationType: "sample_batch_of_sample",
        role: "batch_of",
        expectedTargetType: "sample",
        entityByOriginalId,
        typedReference: typedSample?.kind === "sample" ? typedSample.batchOf : undefined
      }),
      ...(sample.artifact_refs_raw ?? []).flatMap((artifactRef, index) =>
        createSampleLineageLink({
          documentId,
          sample,
          rawRef: artifactRef,
          relationType: "sample_has_artifact",
          role: "artifact",
          expectedTargetType: "artifact",
          entityByOriginalId,
          typedReference: typedSample?.kind === "sample" ? typedSample.artifacts?.[index] : undefined
        })
      )
    ];
  });

interface SampleRefLinkInput {
  documentId: string;
  sample: ExportedSampleV1;
  rawRef: string | undefined;
  role: string;
  entityByOriginalId: Map<string, ExportedObjectEntity>;
  typedReference?: ReferenceOrLiteral;
}

const createSampleRefLink = (input: SampleRefLinkInput): ExportedRelationV1[] => {
  const target = input.typedReference
    ? resolveTargetFromReference(input.entityByOriginalId, input.typedReference)
    : getReferencedEntity(input.rawRef, input.entityByOriginalId);
  const relationType = getSampleRelationType(target);
  return target && relationType
    ? [createRelation(input.documentId, relationType, input.sample.entity_id, target.entity_id, input.role)]
    : [];
};

interface SampleLineageLinkInput {
  documentId: string;
  sample: ExportedSampleV1;
  rawRef: string | undefined;
  relationType: RelationType;
  role: string;
  expectedTargetType: ResolvedEntityTarget["source_node_type"];
  entityByOriginalId: Map<string, ExportedObjectEntity>;
  typedReference?: ReferenceOrLiteral;
}

const createSampleLineageLink = (input: SampleLineageLinkInput): ExportedRelationV1[] => {
  const target = input.typedReference
    ? resolveTargetFromReference(input.entityByOriginalId, input.typedReference)
    : resolveTargetFromRaw(input.entityByOriginalId, input.rawRef, input.expectedTargetType === "artifact" ? "artifact" : "sample");
  return target?.source_node_type === input.expectedTargetType
    ? [createRelation(input.documentId, input.relationType, input.sample.entity_id, target.entity_id, input.role)]
    : [];
};

const getArtifactRelationType = (target: LinkTarget | undefined): RelationType | undefined => {
  if (target?.source_node_type === "reaction") {
    return "artifact_supports_reaction";
  }
  if (target?.source_node_type === "result") {
    return "artifact_supports_result";
  }
  if (target?.source_node_type === "analysis") {
    return "artifact_supports_analysis";
  }
  if (target?.source_node_type === "sample") {
    return "artifact_supports_sample";
  }
  return undefined;
};

const buildArtifactLinks = (
  documentId: string,
  artifacts: ExportedArtifactV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] =>
  artifacts.flatMap((artifact) => {
    const typedArtifact = artifact.original_id ? typedNodes.get(artifact.original_id) : undefined;
    const target = typedArtifact?.kind === "artifact"
      ? resolveTargetFromReference(entityByOriginalId, typedArtifact.ref)
      : getReferencedEntity(artifact.ref_raw, entityByOriginalId);
    const relationType = getArtifactRelationType(target);
    return target && relationType
      ? [createRelation(documentId, relationType, artifact.entity_id, target.entity_id, "ref")]
      : [];
  });

interface ConditionVariationLinkInput {
  documentId: string;
  conditionVariation: ExportedConditionVaryV1;
  rawRef?: string;
  relationType: RelationType;
  role: string;
  entityByOriginalId: Map<string, ExportedObjectEntity>;
  typedReference?: ReferenceOrLiteral;
}

const createConditionVariationLink = (input: ConditionVariationLinkInput): ExportedRelationV1[] => {
  const target = input.typedReference
    ? resolveTargetFromReference(input.entityByOriginalId, input.typedReference)
    : resolveTargetFromRaw(input.entityByOriginalId, input.rawRef, "reaction");
  return target?.source_node_type === "reaction"
    ? [createRelation(
        input.documentId,
        input.relationType,
        input.conditionVariation.entity_id,
        target.entity_id,
        input.role
      )]
    : [];
};

const buildConditionVariationLinks = (
  documentId: string,
  conditionVariations: ExportedConditionVaryV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] =>
  conditionVariations.flatMap((variation) => {
    const typedVariation = variation.original_id ? typedNodes.get(variation.original_id) : undefined;

    return [
      ...createConditionVariationLink({
        documentId,
        conditionVariation: variation,
        rawRef: variation.reaction_ref_raw,
        relationType: "condition_variation_targets_reaction",
        role: "reaction",
        entityByOriginalId,
        typedReference: typedVariation?.kind === "condition_varies" ? typedVariation.reaction : undefined
      }),
      ...createConditionVariationLink({
        documentId,
        conditionVariation: variation,
        rawRef: variation.standard_ref_raw,
        relationType: "condition_variation_compares_standard",
        role: "standard",
        entityByOriginalId,
        typedReference: typedVariation?.kind === "condition_varies" ? typedVariation.standard : undefined
      })
    ];
  });

const buildConditionVariationAttemptLinks = (
  documentId: string,
  attempts: ExportedConditionVariationAttemptV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  entityByEntityId: EntityIndex
): ExportedRelationV1[] =>
  attempts.flatMap((attempt) => {
    const parent = getTargetByEntityId(entityByEntityId, attempt.parent_condition_variation_id);
    const reaction = resolveTargetFromRaw(entityByOriginalId, attempt.reaction_ref_raw, "reaction");
    const result = resolveTargetFromRaw(entityByOriginalId, attempt.result_ref_raw, "result");
    const standard = getTargetByEntityId(entityByEntityId, attempt.parent_condition_variation_id);
    const standardReaction = standard?.source_node_type === "condition_varies" && "standard_ref_raw" in standard
      ? resolveTargetFromRaw(entityByOriginalId, standard.standard_ref_raw, "reaction")
      : undefined;

    return [
      ...(parent?.source_node_type === "condition_varies"
        ? [createRelation(documentId, "condition_variation_has_attempt", parent.entity_id, attempt.entity_id, "attempt")]
        : []),
      ...(reaction?.source_node_type === "reaction"
        ? [createRelation(documentId, "condition_variation_attempt_targets_reaction", attempt.entity_id, reaction.entity_id, "reaction")]
        : []),
      ...(standardReaction?.source_node_type === "reaction"
        ? [createRelation(documentId, "condition_variation_attempt_compares_standard", attempt.entity_id, standardReaction.entity_id, "standard")]
        : []),
      ...(result?.source_node_type === "result"
        ? [createRelation(documentId, "condition_variation_attempt_has_result", attempt.entity_id, result.entity_id, "result")]
        : [])
    ];
  });

const buildMarkdownMentionLinks = (
  documentId: string,
  markdownBlocks: ExportedMarkdownBlockV1[],
  entityByOriginalId: Map<string, ExportedObjectEntity>
): ExportedRelationV1[] =>
  markdownBlocks.flatMap((block) =>
    block.references.flatMap((reference) => {
      const target = reference.resolution_status === "resolved"
        ? entityByOriginalId.get(
            reference.field ? `${reference.source}.${reference.field}` : reference.source
          ) ?? entityByOriginalId.get(reference.source)
        : undefined;
      return target
        ? [createRelation(documentId, "markdown_mentions_entity", block.entity_id, target.entity_id, reference.field ?? reference.kind)]
        : [];
    })
  );

const buildSemanticLinks = (
  documentId: string,
  parts: SemanticLayerParts,
  typedNodes: TypedNodeIndex
): ExportedRelationV1[] => {
  const entities = [
    ...parts.molecules,
    ...parts.materials,
    ...parts.batches,
    ...parts.reactions,
    ...parts.results,
    ...parts.analyses,
    ...parts.samples,
    ...parts.artifacts,
    ...parts.conditionVariations,
    ...parts.conditionVariationAttempts
  ];
  const entityByOriginalId = buildEntityIndex(entities);
  const entityByEntityId = buildEntityIdIndex(entities);

  return uniqueRelations([
    ...buildPrimaryLinks(documentId, entities),
    ...buildMaterialLinks(documentId, parts.materials, entityByOriginalId, typedNodes),
    ...buildBatchLinks(documentId, parts.batches, entityByOriginalId, typedNodes),
    ...buildReactionParticipantLinks(documentId, parts.reactions),
    ...buildReactionRouteLinks(documentId, parts.reactions, entityByOriginalId),
    ...buildResultLinks(documentId, parts.results, entityByOriginalId, typedNodes),
    ...buildAnalysisLinks(documentId, parts.analyses, entityByOriginalId, typedNodes),
    ...buildSampleLinks(documentId, parts.samples, entityByOriginalId, typedNodes),
    ...buildArtifactLinks(documentId, parts.artifacts, entityByOriginalId, typedNodes),
    ...buildConditionVariationLinks(documentId, parts.conditionVariations, entityByOriginalId, typedNodes),
    ...buildConditionVariationAttemptLinks(documentId, parts.conditionVariationAttempts, entityByOriginalId, entityByEntityId),
    ...buildMarkdownMentionLinks(documentId, parts.markdownBlocks, entityByOriginalId)
  ]);
};

interface SemanticLayerParts {
  molecules: ExportedMoleculeV1[];
  materials: ExportedMaterialV1[];
  batches: ExportedBatchV1[];
  reactions: ExportedReactionV1[];
  results: ExportedResultV1[];
  analyses: ExportedAnalysisV1[];
  samples: ExportedSampleV1[];
  artifacts: ExportedArtifactV1[];
  conditionVariations: ExportedConditionVaryV1[];
  conditionVariationAttempts: ExportedConditionVariationAttemptV1[];
  markdownBlocks: ExportedMarkdownBlockV1[];
}

type TraversedNode = ReturnType<typeof collectExportableNodes>[number];
type TypedNodeIndex = Map<string, TypedSemanticGraph["nodes"][number]>;

const createSemanticLayerParts = (): SemanticLayerParts => ({
  molecules: [],
  materials: [],
  batches: [],
  reactions: [],
  results: [],
  analyses: [],
  samples: [],
  artifacts: [],
  conditionVariations: [],
  conditionVariationAttempts: [],
  markdownBlocks: []
});

const collectIdentityEntitiesAndMarkdown = (
  document: ChemdDocument,
  traversedNodes: TraversedNode[],
  parts: SemanticLayerParts,
  typedNodes: TypedNodeIndex
): void => {
  const documentId = document.meta.id;
  for (const { nodeIndex, node } of traversedNodes) {
    const isPrimary = isPrimaryEntity(document, node);

    if (node.type === "molecule") {
      parts.molecules.push(buildMolecule(
        documentId,
        node,
        nodeIndex,
        isPrimary,
        getTypedMolecule(typedNodes, node)
      ));
      continue;
    }

    if (node.type === "material") {
      parts.materials.push(buildMaterial(
        documentId,
        node,
        nodeIndex,
        getTypedMaterial(typedNodes, node)
      ));
      continue;
    }

    if (node.type === "batch") {
      parts.batches.push(buildBatch(
        documentId,
        node,
        nodeIndex,
        getTypedBatch(typedNodes, node)
      ));
      continue;
    }

    if (node.type === "markdown") {
      parts.markdownBlocks.push(buildMarkdown(documentId, node, nodeIndex));
    }
  }
};

const getTypedMolecule = (typedNodes: TypedNodeIndex, node: MoleculeNode): TypedMoleculeNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "molecule" ? typedNode : undefined;
};

const getTypedMaterial = (typedNodes: TypedNodeIndex, node: MaterialNode): TypedMaterialNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "material" ? typedNode : undefined;
};

const getTypedBatch = (typedNodes: TypedNodeIndex, node: BatchNode): TypedBatchNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "batch" ? typedNode : undefined;
};

const getTypedReaction = (typedNodes: TypedNodeIndex, node: ReactionNode): TypedReactionNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "reaction" ? typedNode : undefined;
};

const getTypedResult = (typedNodes: TypedNodeIndex, node: ResultNode): TypedResultNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "result" ? typedNode : undefined;
};

const getTypedAnalysis = (typedNodes: TypedNodeIndex, node: AnalysisNode): TypedAnalysisNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "analysis" ? typedNode : undefined;
};

const getTypedSample = (typedNodes: TypedNodeIndex, node: SampleNode): TypedSampleNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "sample" ? typedNode : undefined;
};

const getTypedArtifact = (typedNodes: TypedNodeIndex, node: ArtifactNode): TypedArtifactNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "artifact" ? typedNode : undefined;
};

const getTypedConditionVaries = (
  typedNodes: TypedNodeIndex,
  node: ConditionVariesNode
): TypedConditionVariesNode | undefined => {
  const typedNode = typedNodes.get(node.id ?? "");
  return typedNode?.kind === "condition_varies" ? typedNode : undefined;
};

const collectRelatedEntities = (
  document: ChemdDocument,
  traversedNodes: TraversedNode[],
  entityByOriginalId: Map<string, ExportedObjectEntity>,
  parts: SemanticLayerParts,
  typedNodes: TypedNodeIndex
): void => {
  const documentId = document.meta.id;
  for (const { nodeIndex, node } of traversedNodes) {
    const isPrimary = isPrimaryEntity(document, node);

    if (node.type === "reaction") {
      parts.reactions.push(buildReaction({
        documentId,
        node,
        nodeIndex,
        isPrimary,
        entityByOriginalId,
        typedReaction: getTypedReaction(typedNodes, node)
      }));
      continue;
    }

    if (node.type === "result") {
      parts.results.push(buildResult(
        documentId,
        node,
        nodeIndex,
        isPrimary,
        getTypedResult(typedNodes, node)
      ));
      continue;
    }

    if (node.type === "analysis") {
      parts.analyses.push(buildAnalysis(
        documentId,
        node,
        nodeIndex,
        isPrimary,
        getTypedAnalysis(typedNodes, node)
      ));
      continue;
    }

    if (node.type === "sample") {
      parts.samples.push(buildSample(
        documentId,
        node,
        nodeIndex,
        isPrimary,
        getTypedSample(typedNodes, node)
      ));
      continue;
    }

    if (node.type === "artifact") {
      parts.artifacts.push(buildArtifact(
        documentId,
        node,
        nodeIndex,
        getTypedArtifact(typedNodes, node)
      ));
      continue;
    }

    if (node.type === "condition_varies") {
      const parent = buildConditionVaries(
        documentId,
        node,
        nodeIndex,
        getTypedConditionVaries(typedNodes, node)
      );
      parts.conditionVariations.push(parent);
      parts.conditionVariationAttempts.push(...buildConditionVariationAttempts(documentId, node, parent, nodeIndex));
    }
  }
};

export interface BuildSemanticLayerOptions {
  typedGraph?: TypedSemanticGraph;
}

export const buildSemanticLayer = (
  document: ChemdDocument,
  options: BuildSemanticLayerOptions = {}
): SemanticLayerV1 => {
  const documentId = document.meta.id;
  const traversedNodes = collectExportableNodes(document.children);
  const parts = createSemanticLayerParts();
  const typedNodes = indexTypedNodes(options.typedGraph);

  collectIdentityEntitiesAndMarkdown(document, traversedNodes, parts, typedNodes);
  // Reaction participant 可以用 @id 指向 molecule/material/batch，索引必须先于 reaction 语义层生成。
  collectRelatedEntities(
    document,
    traversedNodes,
    buildEntityIndex([...parts.molecules, ...parts.materials, ...parts.batches]),
    parts,
    typedNodes
  );

  const {
    molecules,
    materials,
    batches,
    reactions,
    results,
    analyses,
    samples,
    artifacts,
    conditionVariations,
    conditionVariationAttempts,
    markdownBlocks
  } = parts;
  const links = buildSemanticLinks(documentId, parts, typedNodes);

  return {
    molecules,
    materials,
    batches,
    reactions,
    results,
    analyses,
    samples,
    artifacts,
    condition_variations: conditionVariations,
    condition_variation_attempts: conditionVariationAttempts,
    markdown_blocks: markdownBlocks,
    links
  };
};

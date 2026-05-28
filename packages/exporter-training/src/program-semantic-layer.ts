import type {
  AgentRunDeclaration,
  ChemdDeclaration,
  ChemdFieldDeclarationBase,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  ChemdValue,
  ProcedureDeclaration,
  ProcedureStepDeclaration
} from "@chemd/core";
import type {
  ReferenceOrLiteral,
  TypedAnalysisNode,
  TypedArtifactNode,
  TypedBatchNode,
  TypedConditionScreenNode,
  TypedMaterialNode,
  TypedMoleculeNode,
  TypedReactionNode,
  TypedResultNode,
  TypedSampleNode,
  TypedSemanticGraph
} from "@chemd/typechecker";

import type {
  ExportedAgentRunV1,
  ExportedAnalysisV1,
  ExportedArtifactV1,
  ExportedBatchV1,
  ExportedConditionScreenV1,
  ExportedDocumentationBlockV1,
  ExportedMaterialV1,
  ExportedMoleculeV1,
  ExportedProcedureStepV1,
  ExportedProcedureV1,
  ExportedReactionV1,
  ExportedRelationV1,
  ExportedResultV1,
  ExportedSampleV1,
  ExportedTraceV1,
  NumericWithUnit,
  ProgramSemanticLayerV1,
  ReactionParticipantV1
} from "./types";

type FieldDeclaration = Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>;
type ExportedDeclarationEntity =
  | ExportedMoleculeV1
  | ExportedMaterialV1
  | ExportedBatchV1
  | ExportedReactionV1
  | ExportedResultV1
  | ExportedAnalysisV1
  | ExportedSampleV1
  | ExportedArtifactV1
  | ExportedConditionScreenV1
  | ExportedProcedureV1
  | ExportedTraceV1
  | ExportedAgentRunV1;

const ENTITY_PREFIX: Partial<Record<ChemdDeclaration["kind"], string>> = {
  agent_run: "agent",
  analysis: "ana",
  artifact: "art",
  batch: "bat",
  condition_screen: "cv",
  material: "mat",
  molecule: "mol",
  procedure: "proc",
  reaction: "rxn",
  result: "res",
  sample: "sam",
  trace: "trace"
};

const hasFields = (declaration: ChemdDeclaration): declaration is FieldDeclaration =>
  "fields" in declaration;

const field = (declaration: ChemdFieldDeclarationBase, name: string): ChemdValue | undefined =>
  declaration.fields[name];

const text = (value: ChemdValue | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.type === "string") return value.value;
  if (value.type === "identifier") return value.name;
  if (value.type === "boolean") return String(value.value);
  if (value.type === "number") return typeof value.value === "number" ? String(value.value) : value.raw;
  if (value.type === "reference") return value.raw || `@${value.target}`;
  if (value.type === "list") return value.items.map(text).filter(Boolean).join(", ");
  return value.raw;
};

const textList = (value: ChemdValue | undefined): string[] => {
  if (!value) return [];
  return value.type === "list"
    ? value.items.map(text).filter((item): item is string => Boolean(item))
    : [text(value)].filter((item): item is string => Boolean(item));
};

const references = (value: ChemdValue | undefined): ChemdReferenceExpr[] => {
  if (!value) return [];
  if (value.type === "reference") return [value];
  return value.type === "list"
    ? value.items.filter((item): item is ChemdReferenceExpr => item.type === "reference")
    : [];
};

const referenceTargets = (value: ChemdValue | undefined): string[] =>
  references(value).map((item) => item.target);

const targetText = (reference: ChemdReferenceExpr | undefined): string | undefined =>
  reference ? reference.raw || `@${reference.target}` : undefined;

const compactText = (...parts: Array<string | undefined>): string | undefined => {
  const value = parts.map((part) => part?.trim() ?? "").filter(Boolean).join(" ");
  return value || undefined;
};

const entityId = (
  documentId: string,
  kind: ChemdDeclaration["kind"],
  id: string,
  index: number
): string => `${ENTITY_PREFIX[kind] ?? "decl"}::${documentId}::${id || index}`;

const common = (
  documentId: string,
  declaration: ChemdDeclaration,
  index: number,
  program: ChemdProgramDocument
) => ({
  entity_id: entityId(documentId, declaration.kind, declaration.id, index),
  original_id: declaration.id,
  node_index: index,
  source_block_type: declaration.kind,
  syntax_origin: "program_declaration",
  declared_kind: declaration.kind,
  field_source_spans: declaration.fieldSpans,
  ...(isPrimary(program, declaration.kind, declaration.id) ? { is_primary: true } : {})
});

const isPrimary = (
  program: ChemdProgramDocument,
  kind: ChemdDeclaration["kind"],
  id: string
): boolean => {
  if (kind === "molecule") return program.meta.primary?.molecule?.target === id;
  if (kind === "reaction") return program.meta.primary?.reaction?.target === id;
  if (kind === "result") return program.meta.primary?.result?.target === id;
  if (kind === "analysis") return program.meta.primary?.analysis?.target === id;
  if (kind === "sample") return program.meta.primary?.sample?.target === id;
  return false;
};

const numeric = (quantity: { raw: string; value?: number; unit?: string } | undefined): NumericWithUnit | null | undefined =>
  quantity
    ? typeof quantity.value === "number" && quantity.unit
      ? { raw: quantity.raw, value: quantity.value, unit: quantity.unit }
      : null
    : undefined;

const numericValue = (quantity: { value?: number } | undefined): number | null | undefined =>
  quantity ? (typeof quantity.value === "number" ? quantity.value : null) : undefined;

const typedById = (typedGraph: TypedSemanticGraph | undefined): Map<string, TypedSemanticGraph["nodes"][number]> =>
  new Map(typedGraph?.nodes.map((node) => [node.nodeId, node]) ?? []);

const referenceStatus = (reference: ChemdReferenceExpr | undefined, target: ExportedDeclarationEntity | undefined) =>
  reference ? (target ? "resolved" as const : "unresolved" as const) : "literal" as const;

const buildParticipant = (
  role: "reactant" | "product",
  raw: string,
  reference: ChemdReferenceExpr | undefined,
  entityByDeclarationId: Map<string, ExportedDeclarationEntity>
): ReactionParticipantV1 => {
  const target = reference ? entityByDeclarationId.get(reference.target) : undefined;
  return {
    role,
    raw,
    reference_status: referenceStatus(reference, target),
    ...(target ? {
      target_kind: target.source_node_type,
      target_entity_id: target.entity_id,
      target_original_id: target.original_id
    } : reference ? { target_original_id: reference.target } : {})
  };
};

const typed = <T extends TypedSemanticGraph["nodes"][number]>(
  nodes: Map<string, TypedSemanticGraph["nodes"][number]>,
  id: string,
  kind: T["kind"]
): T | undefined => {
  const node = nodes.get(id);
  return node?.kind === kind ? node as T : undefined;
};

const buildMolecule = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedMolecule: TypedMoleculeNode | undefined
): ExportedMoleculeV1 => ({
  ...common(program.meta.id, declaration, index, program),
  source_node_type: "molecule",
  name: text(field(declaration, "name")),
  role: text(field(declaration, "role")),
  smiles: text(field(declaration, "smiles")),
  formula: text(field(declaration, "formula")),
  amount_raw: text(field(declaration, "amount")),
  amount_value: numeric(typedMolecule?.amount),
  equivalents_raw: text(field(declaration, "equivalents")),
  equivalents_value: numericValue(typedMolecule?.equivalents),
  text_for_embedding: compactText(text(field(declaration, "name")), text(field(declaration, "smiles")), text(field(declaration, "role")))
});

const buildMaterial = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedMaterial: TypedMaterialNode | undefined
): ExportedMaterialV1 => ({
  ...common(program.meta.id, declaration, index, program),
  source_node_type: "material",
  molecule_ref_raw: text(field(declaration, "molecule")),
  supplier: text(field(declaration, "supplier")),
  lot: text(field(declaration, "lot")),
  purity_raw: text(field(declaration, "purity")),
  storage: text(field(declaration, "storage")),
  notes: text(field(declaration, "notes")),
  purity_percent: numericValue(typedMaterial?.purity),
  text_for_embedding: compactText(text(field(declaration, "molecule")), text(field(declaration, "supplier")), text(field(declaration, "notes")))
});

const buildBatch = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedBatch: TypedBatchNode | undefined
): ExportedBatchV1 => ({
  ...common(program.meta.id, declaration, index, program),
  source_node_type: "batch",
  source_ref_raw: text(field(declaration, "source")),
  molecule_ref_raw: text(field(declaration, "molecule")),
  state: text(field(declaration, "state")),
  mass_raw: text(field(declaration, "mass")),
  purity_raw: text(field(declaration, "purity")),
  notes: text(field(declaration, "notes")),
  mass: numeric(typedBatch?.mass),
  purity_percent: numericValue(typedBatch?.purity),
  text_for_embedding: compactText(text(field(declaration, "source")), text(field(declaration, "molecule")), text(field(declaration, "state")))
});

const buildReaction = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedReaction: TypedReactionNode | undefined,
  entityByDeclarationId: Map<string, ExportedDeclarationEntity>
): ExportedReactionV1 => {
  const reactants = textList(field(declaration, "reactants"));
  const products = textList(field(declaration, "products"));
  const reactantRefs = references(field(declaration, "reactants"));
  const productRefs = references(field(declaration, "products"));
  return {
    ...common(program.meta.id, declaration, index, program),
    source_node_type: "reaction",
    route_raw: text(field(declaration, "route")),
    rxn_smiles: text(field(declaration, "rxn_smiles")),
    prev_refs_raw: textList(field(declaration, "prev")),
    reactants: reactants.map((raw, itemIndex) =>
      buildParticipant("reactant", raw, reactantRefs[itemIndex], entityByDeclarationId)
    ),
    products: products.map((raw, itemIndex) =>
      buildParticipant("product", raw, productRefs[itemIndex], entityByDeclarationId)
    ),
    solvent_raw: text(field(declaration, "solvent")),
    temperature_raw: text(field(declaration, "temperature")),
    time_raw: text(field(declaration, "time")),
    pressure_raw: text(field(declaration, "pressure")),
    reagents_raw: text(field(declaration, "reagents")),
    catalyst_raw: text(field(declaration, "catalyst")),
    atmosphere_raw: text(field(declaration, "atmosphere")),
    yield_raw: text(field(declaration, "yield")),
    conversion_raw: text(field(declaration, "conversion")),
    selectivity_raw: text(field(declaration, "selectivity")),
    normalized_conditions: typedReaction?.normalizedConditions ?? {},
    normalized_outcome_hints: {},
    text_for_embedding: compactText(...reactants, ...products, text(field(declaration, "solvent")), text(field(declaration, "temperature")))
  };
};

const buildResult = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedResult: TypedResultNode | undefined
): ExportedResultV1 => {
  const target = "target" in declaration ? declaration.target : undefined;
  return {
    ...common(program.meta.id, declaration, index, program),
    source_node_type: "result",
    ref_raw: targetText(target),
    reaction_ref_raw: targetText(target) ?? text(field(declaration, "reaction")),
    product_ref_raw: text(field(declaration, "product")),
    status_raw: text(field(declaration, "status")),
    status_label: typedResult?.status,
    yield_raw: text(field(declaration, "yield")),
    conversion_raw: text(field(declaration, "conversion")),
    selectivity_raw: text(field(declaration, "selectivity")),
    purity_raw: text(field(declaration, "purity")),
    notes: text(field(declaration, "notes")),
    yield_percent: numericValue(typedResult?.yield),
    conversion_percent: numericValue(typedResult?.conversion),
    selectivity_percent: numericValue(typedResult?.selectivity),
    purity_percent: numericValue(typedResult?.purity),
    text_for_embedding: compactText(text(field(declaration, "status")), text(field(declaration, "yield")), text(field(declaration, "notes")))
  };
};

const buildAnalysis = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedAnalysis: TypedAnalysisNode | undefined
): ExportedAnalysisV1 => {
  const target = "target" in declaration ? declaration.target : undefined;
  return {
    ...common(program.meta.id, declaration, index, program),
    source_node_type: "analysis",
    analysis_type: text(field(declaration, "type")) ?? typedAnalysis?.analysisType?.value,
    ref_raw: targetText(target) ?? text(field(declaration, "ref")),
    instrument: text(field(declaration, "instrument")),
    method: text(field(declaration, "method")),
    data_raw: text(field(declaration, "data")),
    notes: text(field(declaration, "notes")),
    artifact_refs_raw: referenceTargets(field(declaration, "artifact")),
    normalized_analysis: typedAnalysis?.normalizedAnalysis ?? null,
    normalized_tlc: typedAnalysis?.normalizedTlc ?? null,
    text_for_embedding: compactText(text(field(declaration, "type")), text(field(declaration, "instrument")), text(field(declaration, "notes")))
  };
};

const buildSample = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedSample: TypedSampleNode | undefined
): ExportedSampleV1 => ({
  ...common(program.meta.id, declaration, index, program),
  source_node_type: "sample",
  name: text(field(declaration, "name")),
  sample_code: text(field(declaration, "sample_id")),
  batch: text(field(declaration, "batch")),
  purity_raw: text(field(declaration, "purity")),
  notes: text(field(declaration, "notes")),
  ref_raw: text(field(declaration, "ref")),
  derived_from_raw: text(field(declaration, "derived_from")),
  batch_of_raw: text(field(declaration, "batch")),
  artifact_refs_raw: referenceTargets(field(declaration, "artifacts")),
  purity_percent: numericValue(typedSample?.purity),
  text_for_embedding: compactText(text(field(declaration, "name")), text(field(declaration, "purity")), text(field(declaration, "notes")))
});

const buildArtifact = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedArtifact: TypedArtifactNode | undefined
): ExportedArtifactV1 => ({
  ...common(program.meta.id, declaration, index, program),
  source_node_type: "artifact",
  artifact_kind: text(field(declaration, "kind")) ?? typedArtifact?.artifactKind,
  ref_raw: text(field(declaration, "ref")),
  path: text(field(declaration, "path")),
  checksum: text(field(declaration, "checksum")),
  instrument: text(field(declaration, "instrument")),
  notes: text(field(declaration, "notes")),
  text_for_embedding: compactText(text(field(declaration, "kind")), text(field(declaration, "instrument")), text(field(declaration, "notes")))
});

const buildConditionScreen = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number,
  typedConditionScreen: TypedConditionScreenNode | undefined
): ExportedConditionScreenV1 => {
  const target = "target" in declaration ? declaration.target : undefined;
  return {
    ...common(program.meta.id, declaration, index, program),
    source_node_type: "condition_screen",
    reaction_ref_raw: targetText(target) ?? text(field(declaration, "reaction")),
    standard_ref_raw: text(field(declaration, "standard")),
    factors: typedConditionScreen?.factors ?? textList(field(declaration, "factor")),
    outcomes: typedConditionScreen?.outcomes ?? textList(field(declaration, "outcome")),
    notes: text(field(declaration, "notes")),
    text_for_embedding: compactText(text(field(declaration, "reaction")), text(field(declaration, "standard")), text(field(declaration, "notes")))
  };
};

const buildProcedureStep = (step: ProcedureStepDeclaration): ExportedProcedureStepV1 => ({
  step_id: step.id,
  family: step.family,
  args: Object.fromEntries(Object.entries(step.args).map(([key, value]) => [key, text(value) ?? value.raw])),
  input_refs_raw: step.inputs?.map((item) => item.raw || `@${item.target}`),
  output_refs_raw: step.outputs?.map((item) => item.raw || `@${item.target}`),
  depends_on: step.dependsOn,
  evidence_refs_raw: step.evidence?.map((item) => item.raw || `@${item.target}`),
  confidence: step.confidence
});

const collectProcedureSteps = (procedure: ProcedureDeclaration): ExportedProcedureStepV1[] =>
  procedure.children.flatMap((statement): ExportedProcedureStepV1[] => {
    if (statement.kind === "step") return [buildProcedureStep(statement)];
    if (statement.kind === "control") {
      return statement.children.flatMap((child) =>
        child.kind === "step" ? [buildProcedureStep(child)] : []
      );
    }
    return [];
  });

const buildProcedure = (
  program: ChemdProgramDocument,
  declaration: ProcedureDeclaration,
  index: number
): ExportedProcedureV1 => {
  const steps = collectProcedureSteps(declaration);
  return {
    ...common(program.meta.id, declaration, index, program),
    source_node_type: "procedure",
    target_ref_raw: targetText(declaration.target),
    evidence_refs_raw: declaration.evidence?.map((item) => item.raw || `@${item.target}`),
    steps,
    text_for_embedding: compactText(targetText(declaration.target), ...steps.map((step) => `${step.step_id} ${step.family}`))
  };
};

const buildTrace = (
  program: ChemdProgramDocument,
  declaration: FieldDeclaration,
  index: number
): ExportedTraceV1 => {
  const target = "target" in declaration ? declaration.target : undefined;
  return {
    ...common(program.meta.id, declaration, index, program),
    source_node_type: "trace",
    target_ref_raw: targetText(target) ?? text(field(declaration, "plan")),
    mode: text(field(declaration, "mode")),
    text_for_embedding: compactText(targetText(target), text(field(declaration, "mode")), text(field(declaration, "notes")))
  };
};

const buildAgentRun = (
  program: ChemdProgramDocument,
  declaration: AgentRunDeclaration,
  index: number
): ExportedAgentRunV1 => ({
  ...common(program.meta.id, declaration, index, program),
  source_node_type: "agent_run",
  goal: declaration.goal,
  status: declaration.status,
  target_files: declaration.targetFiles,
  evidence_refs_raw: declaration.evidence.flatMap((item) =>
    item.refs?.map((ref) => ref.raw || `@${ref.target}`) ?? []
  ),
  tool_calls: declaration.toolCalls.map((tool) => ({
    tool_call_id: tool.id,
    name: tool.name,
    status: tool.status
  })),
  patches: declaration.patches.map((patch) => ({
    patch_id: patch.id,
    status: patch.status,
    title: patch.title,
    edit_count: patch.edits.length
  })),
  decisions: declaration.decisions.map((decision) => ({
    decision_id: decision.id,
    decision: decision.decision,
    patch_id: decision.patchId,
    rationale: decision.rationale
  })),
  audit_timeline: declaration.auditTimeline.map((event) => ({
    event_id: event.id,
    event: event.event,
    at: event.at,
    actor: event.actor,
    summary: event.summary,
    related_tool_call_id: event.relatedToolCallId,
    related_patch_id: event.relatedPatchId,
    evidence_refs_raw: event.evidence?.map((ref) => ref.raw || `@${ref.target}`)
  })),
  text_for_embedding: compactText(
    declaration.goal,
    declaration.status,
    ...(declaration.targetFiles ?? []),
    ...declaration.auditTimeline.map((event) => event.summary)
  )
});

const buildDocumentationBlocks = (program: ChemdProgramDocument): ExportedDocumentationBlockV1[] =>
  program.docs
    .filter((doc) => doc.exportPolicy === "render_rag")
    .map((doc) => ({
      doc_id: doc.id,
      attachment_kind: doc.attachment.kind,
      attached_to: attachedTo(doc.attachment),
      raw_markdown: doc.markdown,
      references: doc.references.map((reference) => ({
        raw: reference.raw,
        kind: reference.kind,
        source: reference.source,
        field: reference.field,
        resolution_status: reference.resolution?.status,
        resolution_value: reference.resolution?.value
      })),
      text_for_embedding: doc.markdown.replace(/\s+/g, " ").trim(),
      fact_status: "narrative_only"
    }));

const attachedTo = (attachment: ChemdProgramDocument["docs"][number]["attachment"]): string | undefined => {
  if (attachment.kind === "declaration") return attachment.declarationId;
  if (attachment.kind === "field") return `${attachment.declarationId}.${attachment.fieldName}`;
  if (attachment.kind === "module") return attachment.moduleName;
  if (attachment.kind === "procedure_step") return `${attachment.declarationId}.${attachment.stepId}`;
  if (attachment.kind === "agent_statement") return `${attachment.runId}.${attachment.statementId}`;
  return undefined;
};

const relation = (
  documentId: string,
  relationType: ExportedRelationV1["relation_type"],
  from: ExportedDeclarationEntity,
  to: ExportedDeclarationEntity,
  role: string
): ExportedRelationV1 => ({
  relation_id: `rel::${documentId}::${relationType}::${from.entity_id}::${to.entity_id}::${role}`,
  relation_type: relationType,
  from_entity_id: from.entity_id,
  to_entity_id: to.entity_id,
  role,
  confidence: 1
});

const entityForRef = (
  value: string | undefined,
  entityByDeclarationId: Map<string, ExportedDeclarationEntity>
): ExportedDeclarationEntity | undefined => {
  if (!value) return undefined;
  return entityByDeclarationId.get(value.replace(/^@/, "").split(".")[0] ?? value);
};

const relationForParticipant = (
  role: "reactant" | "product",
  targetType: string | undefined
): ExportedRelationV1["relation_type"] => {
  if (targetType === "material") return role === "reactant" ? "reaction_uses_material" : "reaction_produces_material";
  if (targetType === "batch") return role === "reactant" ? "reaction_uses_batch" : "reaction_produces_batch";
  return role === "reactant" ? "reaction_uses_molecule" : "reaction_produces_molecule";
};

const buildLinks = (
  documentId: string,
  entities: ExportedDeclarationEntity[],
  entityByDeclarationId: Map<string, ExportedDeclarationEntity>
): ExportedRelationV1[] => {
  const links: ExportedRelationV1[] = [];
  for (const entity of entities) {
    if (entity.is_primary) {
      links.push({
        relation_id: `rel::${documentId}::document_primary::${entity.entity_id}`,
        relation_type: "document_primary",
        from_entity_id: `doc::${documentId}`,
        to_entity_id: entity.entity_id,
        role: entity.source_node_type,
        confidence: 1
      });
    }
    if (entity.source_node_type === "reaction") {
      for (const participant of [...entity.reactants, ...entity.products]) {
        const target = entityForRef(participant.target_original_id, entityByDeclarationId);
        if (target) links.push(relation(documentId, relationForParticipant(participant.role, target.source_node_type), entity, target, participant.role));
      }
    }
    if (entity.source_node_type === "result") {
      const target = entityForRef(entity.reaction_ref_raw ?? entity.ref_raw, entityByDeclarationId);
      if (target?.source_node_type === "reaction") links.push(relation(documentId, "result_describes_reaction", entity, target, "reaction"));
    }
    if (entity.source_node_type === "analysis") {
      const target = entityForRef(entity.ref_raw, entityByDeclarationId);
      if (target?.source_node_type === "reaction") links.push(relation(documentId, "analysis_targets_reaction", entity, target, "ref"));
      if (target?.source_node_type === "result") links.push(relation(documentId, "analysis_targets_result", entity, target, "ref"));
      if (target?.source_node_type === "sample") links.push(relation(documentId, "analysis_targets_sample", entity, target, "ref"));
      if (target?.source_node_type === "condition_screen") links.push(relation(documentId, "analysis_targets_condition_screen", entity, target, "ref"));
    }
    if (entity.source_node_type === "artifact") {
      const target = entityForRef(entity.ref_raw, entityByDeclarationId);
      if (target?.source_node_type === "reaction") links.push(relation(documentId, "artifact_supports_reaction", entity, target, "ref"));
      if (target?.source_node_type === "result") links.push(relation(documentId, "artifact_supports_result", entity, target, "ref"));
      if (target?.source_node_type === "analysis") links.push(relation(documentId, "artifact_supports_analysis", entity, target, "ref"));
      if (target?.source_node_type === "sample") links.push(relation(documentId, "artifact_supports_sample", entity, target, "ref"));
    }
    if (entity.source_node_type === "sample") {
      const source = entityForRef(entity.derived_from_raw, entityByDeclarationId);
      if (source?.source_node_type === "reaction") links.push(relation(documentId, "sample_derived_from_reaction", entity, source, "derived_from"));
      if (source?.source_node_type === "result") links.push(relation(documentId, "sample_related_to_result", entity, source, "derived_from"));
      if (source?.source_node_type === "molecule") links.push(relation(documentId, "sample_related_to_molecule", entity, source, "derived_from"));
      for (const raw of entity.artifact_refs_raw ?? []) {
        const artifact = entityForRef(raw, entityByDeclarationId);
        if (artifact?.source_node_type === "artifact") links.push(relation(documentId, "sample_has_artifact", entity, artifact, "artifact"));
      }
    }
    if (entity.source_node_type === "condition_screen") {
      const reaction = entityForRef(entity.reaction_ref_raw, entityByDeclarationId);
      const standard = entityForRef(entity.standard_ref_raw, entityByDeclarationId);
      if (reaction?.source_node_type === "reaction") links.push(relation(documentId, "condition_screen_targets_reaction", entity, reaction, "reaction"));
      if (standard?.source_node_type === "reaction") links.push(relation(documentId, "condition_screen_compares_standard", entity, standard, "standard"));
    }
    if (entity.source_node_type === "procedure") {
      const target = entityForRef(entity.target_ref_raw, entityByDeclarationId);
      if (target?.source_node_type === "reaction") links.push(relation(documentId, "procedure_targets_reaction", entity, target, "target"));
    }
    if (entity.source_node_type === "trace") {
      const target = entityForRef(entity.target_ref_raw, entityByDeclarationId);
      if (target) links.push(relation(documentId, "trace_targets_declaration", entity, target, "target"));
    }
    if (entity.source_node_type === "agent_run") {
      for (const raw of entity.evidence_refs_raw ?? []) {
        const target = entityForRef(raw, entityByDeclarationId);
        if (target) links.push(relation(documentId, "agent_run_references_declaration", entity, target, "evidence"));
      }
    }
  }
  return links;
};

export const buildProgramSemanticLayer = (
  program: ChemdProgramDocument,
  typedGraph?: TypedSemanticGraph
): ProgramSemanticLayerV1 => {
  const nodes = typedById(typedGraph);
  const entityByDeclarationId = new Map<string, ExportedDeclarationEntity>();

  program.declarations.forEach((declaration, index) => {
    const prefix = ENTITY_PREFIX[declaration.kind];
    if (prefix) {
      entityByDeclarationId.set(declaration.id, {
        ...common(program.meta.id, declaration, index, program),
        source_node_type: declaration.kind
      } as ExportedDeclarationEntity);
    }
  });

  const layer: ProgramSemanticLayerV1 = {
    molecules: [],
    materials: [],
    batches: [],
    reactions: [],
    results: [],
    analyses: [],
    samples: [],
    artifacts: [],
    condition_screens: [],
    condition_variations: [],
    condition_variation_attempts: [],
    procedures: [],
    traces: [],
    agent_runs: [],
    documentation_blocks: buildDocumentationBlocks(program),
    links: []
  };

  program.declarations.forEach((declaration, index) => {
    if (hasFields(declaration) && declaration.kind === "molecule") layer.molecules.push(buildMolecule(program, declaration, index, typed<TypedMoleculeNode>(nodes, declaration.id, "molecule")));
    if (hasFields(declaration) && declaration.kind === "material") layer.materials.push(buildMaterial(program, declaration, index, typed<TypedMaterialNode>(nodes, declaration.id, "material")));
    if (hasFields(declaration) && declaration.kind === "batch") layer.batches.push(buildBatch(program, declaration, index, typed<TypedBatchNode>(nodes, declaration.id, "batch")));
    if (hasFields(declaration) && declaration.kind === "reaction") layer.reactions.push(buildReaction(program, declaration, index, typed<TypedReactionNode>(nodes, declaration.id, "reaction"), entityByDeclarationId));
    if (hasFields(declaration) && declaration.kind === "result") layer.results.push(buildResult(program, declaration, index, typed<TypedResultNode>(nodes, declaration.id, "result")));
    if (hasFields(declaration) && declaration.kind === "analysis") layer.analyses.push(buildAnalysis(program, declaration, index, typed<TypedAnalysisNode>(nodes, declaration.id, "analysis")));
    if (hasFields(declaration) && declaration.kind === "sample") layer.samples.push(buildSample(program, declaration, index, typed<TypedSampleNode>(nodes, declaration.id, "sample")));
    if (hasFields(declaration) && declaration.kind === "artifact") layer.artifacts.push(buildArtifact(program, declaration, index, typed<TypedArtifactNode>(nodes, declaration.id, "artifact")));
    if (hasFields(declaration) && declaration.kind === "condition_screen") layer.condition_screens.push(buildConditionScreen(program, declaration, index, typed<TypedConditionScreenNode>(nodes, declaration.id, "condition_screen")));
    if (declaration.kind === "procedure") layer.procedures.push(buildProcedure(program, declaration, index));
    if (hasFields(declaration) && declaration.kind === "trace") layer.traces.push(buildTrace(program, declaration, index));
    if (declaration.kind === "agent_run") layer.agent_runs.push(buildAgentRun(program, declaration, index));
  });

  const entities: ExportedDeclarationEntity[] = [
    ...layer.molecules,
    ...layer.materials,
    ...layer.batches,
    ...layer.reactions,
    ...layer.results,
    ...layer.analyses,
    ...layer.samples,
    ...layer.artifacts,
    ...layer.condition_screens,
    ...layer.procedures,
    ...layer.traces,
    ...layer.agent_runs
  ];
  layer.links = buildLinks(program.meta.id, entities, new Map(entities.map((entity) => [entity.original_id ?? "", entity])));
  return layer;
};

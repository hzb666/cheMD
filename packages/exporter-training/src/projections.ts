import type {
  TrainingReactionRouteStepV1,
  ChemdRagChunkV1,
  ChemdRagExportV1,
  ChemdTrainingUnderstandingV1,
  LoraTaskHintV1,
  LoraTaskTypeV1,
  TrainingAnalysisV1,
  TrainingArtifactV1,
  TrainingCanonicalSummaryV1,
  TrainingConditionVariationAttemptV1,
  TrainingConditionVariationLogicV1,
  TrainingConditionVaryV1,
  TrainingEvidenceInterpretationKindV1,
  TrainingEvidenceInterpretationV1,
  TrainingEvidenceLinkV1,
  TrainingExpertRoutingV1,
  TrainingCausalLinkV1,
  TrainingExperimentDesignContextV1,
  TrainingExperimentVariableDeltaV1,
  TrainingFailureSignalV1,
  TrainingFieldEvidenceV1,
  TrainingInferenceConfidenceV1,
  TrainingIntentHypothesisV1,
  TrainingKnowledgeEdgeV1,
  TrainingKnowledgeNodeV1,
  TrainingLoraGenerationHintsV1,
  TrainingMaterialFlowEdgeV1,
  TrainingMaterialFlowGraphV1,
  TrainingMaterialFlowNodeTypeV1,
  TrainingMaterialFlowNodeV1,
  TrainingMaterialV1,
  TrainingMissingLogicV1,
  TrainingMoleculeV1,
  TrainingNarrativeBlockV1,
  TrainingObservationLogicPairV1,
  TrainingImplicitConditionFactV1,
  TrainingOutcomeQualityV1,
  TrainingOutcomeLogicV1,
  TrainingOptimizationStepV1,
  TrainingOptimizationTrajectoryV1,
  TrainingPrimaryEntityV1,
  TrainingProcedureLogicPairV1,
  TrainingReactionFamilyV1,
  TrainingReactionTaxonomyV1,
  TrainingReactionV1,
  TrainingResolvedReferenceV1,
  TrainingResultV1,
  TrainingSampleProfileV1,
  TrainingArtifactProfileV1,
  TrainingSampleV1,
  TrainingStepDependencyEdgeV1,
  TrainingVariableLogicV1
} from "./projection-types";
import {
  buildEntityIdFromReference,
  stripReferencePrefix
} from "@chemd/core";
import type {
  ChemdTrainingExportV2,
  ExportedAnalysisV1,
  ExportedArtifactV1,
  ExportedConditionVariationAttemptV1,
  ExportedConditionVaryV1,
  ExportedEntityBase,
  ExportedMaterialV1,
  ExportedMoleculeV1,
  ExportedReactionV1,
  ExportedRelationV1,
  ExportedResultV1,
  ExportedSampleV1
} from "./types";

type ObjectEntity =
  | ExportedMoleculeV1
  | ExportedMaterialV1
  | ExportedAnalysisV1
  | ExportedResultV1
  | ExportedSampleV1
  | ExportedReactionV1
  | ExportedArtifactV1
  | ExportedConditionVaryV1
  | ExportedConditionVariationAttemptV1;

type PrimaryRole = TrainingPrimaryEntityV1["role"];
type SourceStrippedKey =
  | "node_index"
  | "source_node_type"
  | "source_block_type"
  | "syntax_origin"
  | "declared_kind"
  | "provenance"
  | "field_source_spans"
  | "text_for_embedding";
type ProcedurePair = NonNullable<ChemdTrainingExportV2["learning_layer"]["procedure_to_steps"]>[number];
type ObservationPair = NonNullable<ChemdTrainingExportV2["learning_layer"]["observation_to_events"]>[number];
type ProcedureStep = ProcedurePair["steps"][number];
type ObservationEvent = ObservationPair["events"][number];
type FieldValue = TrainingFieldEvidenceV1["value"];
type LogicValue = string | number | boolean | null;
type ResolvedReferenceTarget = Pick<ObjectEntity, "entity_id" | "original_id"> & {
  source_node_type?: ObjectEntity["source_node_type"];
};

const ENTITY_KIND_BY_PREFIX = {
  mol: "molecule",
  rxn: "reaction",
  res: "result",
  ana: "analysis",
  sam: "sample",
  art: "artifact",
  cv: "condition_variation",
  cva: "condition_variation_attempt"
} as const;

interface FieldEvidenceInput {
  subjectEntityId: string;
  field: string;
  value: FieldValue | undefined;
  rawValue?: string;
  normalized?: boolean;
  evidenceEntityIds?: string[];
  sourceRelationIds?: string[];
  sourceSpan?: TrainingFieldEvidenceV1["source_span"];
}

interface LoraHintContext {
  record: ChemdTrainingExportV2;
  graphNodes: TrainingKnowledgeNodeV1[];
  graphEdges: TrainingKnowledgeEdgeV1[];
  fieldEvidence: TrainingFieldEvidenceV1[];
  missingLogic: TrainingMissingLogicV1[];
  resolvedReferences: TrainingResolvedReferenceV1[];
}

interface IntentBuildInput {
  contexts: TrainingExperimentDesignContextV1[];
  outcomes: TrainingOutcomeLogicV1[];
  outcomeQuality: TrainingOutcomeQualityV1[];
  failureSignals: TrainingFailureSignalV1[];
  procedurePairs: ProcedurePair[];
}

interface IntentContextInput {
  context: TrainingExperimentDesignContextV1;
  outcome?: TrainingOutcomeLogicV1;
  quality?: TrainingOutcomeQualityV1;
  failure?: TrainingFailureSignalV1;
  procedurePairs: ProcedurePair[];
}

interface CausalLinkBuildInput {
  record: ChemdTrainingExportV2;
  contexts: TrainingExperimentDesignContextV1[];
  outcomes: TrainingOutcomeLogicV1[];
  failureSignals: TrainingFailureSignalV1[];
  evidenceLinks: TrainingEvidenceLinkV1[];
  procedurePairs: ProcedurePair[];
}

interface FlowEdgeInput {
  flowEdgeId: string;
  edgeType: TrainingMaterialFlowEdgeV1["edge_type"];
  fromNodeId: string;
  toNodeId: string;
  role?: string;
  confidence: TrainingInferenceConfidenceV1;
  evidenceEntityIds: string[];
  reviewRequired?: boolean;
  warnings?: string[];
}

interface SourceRefCandidate {
  entity_id: string;
  field?: string;
  source_span?: TrainingFieldEvidenceV1["source_span"];
}

interface RelationMaterialFlowSpec {
  edgeType: TrainingMaterialFlowEdgeV1["edge_type"];
  reverse?: boolean;
}

const RAG_EXCLUSION_REASONS = new Set([
  "no_retrieval_chunks",
  "allowed_uses_missing_rag",
  "governance_blocking"
]);
const SAMPLE_LINEAGE_RELATIONS = new Set<ExportedRelationV1["relation_type"]>([
  "sample_derived_from_reaction",
  "sample_related_to_molecule",
  "sample_related_to_result",
  "sample_derived_from_sample",
  "sample_aliquot_of_sample",
  "sample_batch_of_sample",
  "sample_has_artifact"
]);
const EVIDENCE_RELATIONS = new Set<ExportedRelationV1["relation_type"]>([
  "analysis_targets_reaction",
  "analysis_targets_result",
  "analysis_targets_sample",
  "analysis_targets_condition_variation",
  "analysis_targets_condition_variation_attempt"
]);
const ARTIFACT_EVIDENCE_RELATIONS = new Set<ExportedRelationV1["relation_type"]>([
  "artifact_supports_reaction",
  "artifact_supports_result",
  "artifact_supports_analysis",
  "artifact_supports_sample"
]);
const RELATION_MATERIAL_FLOW_SPECS: Partial<Record<ExportedRelationV1["relation_type"], RelationMaterialFlowSpec>> = {
  result_describes_reaction: { edgeType: "reaction_reports_result", reverse: true },
  sample_derived_from_reaction: { edgeType: "reaction_generates_sample", reverse: true },
  sample_related_to_molecule: { edgeType: "molecule_related_to_sample", reverse: true },
  sample_related_to_result: { edgeType: "result_related_to_sample", reverse: true },
  sample_derived_from_sample: { edgeType: "sample_derives_from_sample", reverse: true },
  sample_aliquot_of_sample: { edgeType: "sample_aliquot_from_sample", reverse: true },
  sample_batch_of_sample: { edgeType: "sample_batch_from_sample", reverse: true },
  sample_has_artifact: { edgeType: "sample_has_artifact" },
  artifact_supports_reaction: { edgeType: "artifact_supports_material_claim" },
  artifact_supports_result: { edgeType: "artifact_supports_material_claim" },
  artifact_supports_analysis: { edgeType: "artifact_supports_material_claim" },
  artifact_supports_sample: { edgeType: "artifact_supports_material_claim" },
  analysis_targets_reaction: { edgeType: "analysis_supports_material_claim" },
  analysis_targets_result: { edgeType: "analysis_supports_material_claim" },
  analysis_targets_sample: { edgeType: "analysis_supports_material_claim" },
  analysis_targets_condition_variation: { edgeType: "analysis_supports_material_claim" },
  analysis_targets_condition_variation_attempt: { edgeType: "analysis_supports_material_claim" }
};
const REACTION_ROUTE_RELATIONS = new Set<ExportedRelationV1["relation_type"]>([
  "reaction_depends_on_reaction",
  "reaction_precedes_reaction"
]);
type SampleLineageReferenceField = "derived_from" | "aliquot_of" | "batch_of" | "artifacts";
const SAMPLE_LINEAGE_FIELD_RELATIONS: Record<SampleLineageReferenceField, ReadonlySet<ExportedRelationV1["relation_type"]>> = {
  derived_from: new Set([
    "sample_derived_from_reaction",
    "sample_related_to_molecule",
    "sample_related_to_result",
    "sample_derived_from_sample"
  ]),
  aliquot_of: new Set(["sample_aliquot_of_sample"]),
  batch_of: new Set(["sample_batch_of_sample"]),
  artifacts: new Set(["sample_has_artifact"])
};
const SAMPLE_LINEAGE_FIELD_ROLES: Record<SampleLineageReferenceField, string> = {
  derived_from: "derived_from",
  aliquot_of: "aliquot_of",
  batch_of: "batch_of",
  artifacts: "artifact"
};
const LOW_YIELD_THRESHOLD = 20;
const LOW_CONVERSION_THRESHOLD = 50;
const LOW_SELECTIVITY_THRESHOLD = 50;
const LOW_PURITY_THRESHOLD = 80;
const DERIVED_LOGIC_SOURCE = "derived" as const;
const POSITIVE_EVIDENCE_TERMS = [
  "clean",
  "confirmed",
  "consistent",
  "matches",
  "single spot",
  "complete",
  "product observed"
];
const NEGATIVE_EVIDENCE_TERMS = [
  "impurity",
  "impurities",
  "decomposition",
  "starting material remains",
  "incomplete",
  "multiple spots",
  "side product",
  "low conversion"
];
const REACTION_TAXONOMY_RULES: Array<{
  family: TrainingReactionFamilyV1;
  tags: string[];
  terms: string[];
  confidence: TrainingInferenceConfidenceV1;
}> = [
  {
    family: "cross_coupling",
    tags: ["cross_coupling", "organometallic_catalysis"],
    terms: ["suzuki", "heck", "sonogashira", "negishi", "stille", "kumada", "buchwald", "palladium", "pd("],
    confidence: "high"
  },
  {
    family: "oxidation",
    tags: ["redox", "oxidation"],
    terms: ["oxidation", "oxidized", "mcpba", "pcc", "dess-martin", "tempo", "oxone", "h2o2"],
    confidence: "medium"
  },
  {
    family: "reduction",
    tags: ["redox", "reduction"],
    terms: ["reduction", "reduced", "hydrogenation", "nabh4", "lialh4", "pd/c", "raney"],
    confidence: "medium"
  },
  {
    family: "protection",
    tags: ["protecting_group"],
    terms: ["protection", "protected", "boc", "tbs", "tbdms", "fmoc"],
    confidence: "medium"
  },
  {
    family: "deprotection",
    tags: ["protecting_group", "deprotection"],
    terms: ["deprotection", "deprotected", "tfa", "hcl/dioxane", "desilylation"],
    confidence: "medium"
  },
  {
    family: "amidation",
    tags: ["amide_formation", "condensation"],
    terms: ["amidation", "amide coupling", "hatu", "hbtu", "edci", "edc", "dcc"],
    confidence: "medium"
  },
  {
    family: "esterification",
    tags: ["ester_formation", "condensation"],
    terms: ["esterification", "fischer", "esterified"],
    confidence: "medium"
  },
  {
    family: "substitution",
    tags: ["substitution"],
    terms: ["substitution", "sn2", "alkylation", "nucleophilic substitution"],
    confidence: "medium"
  }
];
const FAMILY_EXPERT_LABELS: Record<TrainingReactionFamilyV1, string[]> = {
  cross_coupling: ["cross_coupling", "organometallic_catalysis"],
  oxidation: ["oxidation_chemistry", "redox_chemistry"],
  reduction: ["reduction_chemistry", "redox_chemistry"],
  protection: ["protecting_group_strategy"],
  deprotection: ["protecting_group_strategy"],
  amidation: ["amide_bond_formation"],
  esterification: ["ester_formation"],
  substitution: ["substitution_chemistry"],
  addition: ["addition_chemistry"],
  elimination: ["elimination_chemistry"],
  unknown: []
};

const compactText = (...parts: Array<string | undefined>): string | undefined => {
  const text = parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  return text || undefined;
};

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values));

const hasAnyTerm = (text: string, terms: string[]): boolean =>
  terms.some((term) => text.includes(term));

const stripSourceFields = <T extends ExportedEntityBase>(
  entity: T
): Omit<T, SourceStrippedKey> => {
  const {
    node_index: _nodeIndex,
    source_node_type: _sourceNodeType,
    source_block_type: _sourceBlockType,
    syntax_origin: _syntaxOrigin,
    declared_kind: _declaredKind,
    provenance: _provenance,
    field_source_spans: _fieldSourceSpans,
    text_for_embedding: _textForEmbedding,
    ...rest
  } = entity as T & { text_for_embedding?: string };

  return rest as Omit<T, SourceStrippedKey>;
};

const stripRagChunk = (chunk: ChemdTrainingExportV2["learning_layer"]["retrieval_chunks"][number]): ChemdRagChunkV1 => {
  const { raw_text: _rawText, ...cleanChunk } = chunk;
  return cleanChunk;
};

const stripTrainingMaterial = (material: ExportedMaterialV1): TrainingMaterialV1 => {
  const stripped = stripSourceFields(material) as Omit<ExportedMaterialV1, SourceStrippedKey>;
  const { supplier: _supplier, lot: _lot, ...cleanMaterial } = stripped;
  return cleanMaterial;
};

const stripTrainingSample = (sample: ExportedSampleV1): TrainingSampleV1 => {
  const stripped = stripSourceFields(sample) as Omit<ExportedSampleV1, SourceStrippedKey>;
  const { supplier: _supplier, ...cleanSample } = stripped;
  return cleanSample;
};

const stripTrainingArtifact = (artifact: ExportedArtifactV1): TrainingArtifactV1 => {
  const stripped = stripSourceFields(artifact) as Omit<ExportedArtifactV1, SourceStrippedKey>;
  const { path: _path, ...cleanArtifact } = stripped;
  return cleanArtifact;
};

const getRagExclusionReasons = (record: ChemdTrainingExportV2): string[] | undefined => {
  const reasons = record.quality_layer.training_quality.exclusion_reasons
    ?.filter((reason) => RAG_EXCLUSION_REASONS.has(reason));

  return reasons && reasons.length > 0 ? reasons : undefined;
};

export const buildRagExportFromTrainingRecord = (record: ChemdTrainingExportV2): ChemdRagExportV1 => {
  const ragAllowed = record.governance.allowed_uses?.includes("rag") === true
    && !record.quality_layer.governance_quality.blocking;
  const chunks = ragAllowed ? record.learning_layer.retrieval_chunks.map(stripRagChunk) : [];

  return {
    schema_version: "chemd-rag-export/v0.1",
    document: record.document,
    governance: record.governance,
    chunks,
    quality: {
      rag_eligible: ragAllowed && record.quality_layer.training_quality.rag_eligible,
      chunk_count: chunks.length,
      ...(getRagExclusionReasons(record) ? { exclusion_reasons: getRagExclusionReasons(record) } : {})
    }
  };
};

const getDocumentSummary = (record: ChemdTrainingExportV2): string | undefined =>
  record.learning_layer.retrieval_chunks.find((chunk) => chunk.chunk_type === "document_summary")?.text;

const buildEntityIndex = (record: ChemdTrainingExportV2): Map<string, ObjectEntity> => {
  const entities: ObjectEntity[] = [
    ...record.semantic_layer.molecules,
    ...record.semantic_layer.reactions,
    ...record.semantic_layer.results,
    ...record.semantic_layer.analyses,
    ...record.semantic_layer.samples,
    ...record.semantic_layer.artifacts,
    ...record.semantic_layer.condition_variations,
    ...record.semantic_layer.condition_variation_attempts
  ];

  return new Map(
    entities
      .filter((entity) => entity.original_id)
      .map((entity) => [entity.original_id as string, entity])
  );
};

const buildEntityIdIndex = (record: ChemdTrainingExportV2): Map<string, ObjectEntity> => {
  const entities: ObjectEntity[] = [
    ...record.semantic_layer.molecules,
    ...record.semantic_layer.analyses,
    ...record.semantic_layer.results,
    ...record.semantic_layer.samples,
    ...record.semantic_layer.reactions,
    ...record.semantic_layer.artifacts,
    ...record.semantic_layer.condition_variations,
    ...record.semantic_layer.condition_variation_attempts
  ];

  return new Map(entities.map((entity) => [entity.entity_id, entity]));
};

const buildNarrativeBlocks = (record: ChemdTrainingExportV2): TrainingNarrativeBlockV1[] =>
  record.semantic_layer.markdown_blocks.map((block) => ({
    entity_id: block.entity_id,
    cleaned_text: block.cleaned_text,
    references: block.references,
    inline_chem: block.inline_chem,
    inline_code: block.inline_code,
    links: block.links
  }));

const normalizeReferenceId = (value: string): string =>
  (value.trim().startsWith("@") ? value.trim().slice(1) : value.trim())
    .split(".")[0]
    ?.trim() ?? "";

const buildExternalTargetFromRawReference = (
  rawRef: string,
  targetKind: "molecule" | "reaction" | "result" | "analysis" | "sample" | "artifact" | "condition_varies" | "condition_variation_attempt"
): ResolvedReferenceTarget | undefined => {
  const entityId = buildEntityIdFromReference(targetKind, rawRef);
  const sourceNodeType = targetKind === "condition_varies"
    ? "condition_varies"
    : targetKind;

  return entityId
    ? {
        entity_id: entityId,
        original_id: stripReferencePrefix(rawRef),
        source_node_type: sourceNodeType
      }
    : undefined;
};

const buildExternalTargetFromEntityId = (
  entityId: string
): ResolvedReferenceTarget | undefined => {
  const [prefix, documentId, ...rest] = entityId.split("::");
  const nodeType = ENTITY_KIND_BY_PREFIX[prefix as keyof typeof ENTITY_KIND_BY_PREFIX];
  const originalId = rest.join("::");

  return nodeType && documentId && originalId
    ? {
        entity_id: entityId,
        original_id: `${documentId}#${originalId}`,
        source_node_type: nodeType === "condition_variation" ? "condition_varies" : nodeType
      }
    : undefined;
};

const getEntityByRawReference = (
  entityByOriginalId: Map<string, ObjectEntity>,
  value: string | undefined,
  expectedTargetKind?: "molecule" | "reaction" | "result" | "analysis" | "sample" | "artifact" | "condition_varies" | "condition_variation_attempt"
): ResolvedReferenceTarget | undefined => {
  if (!value) {
    return undefined;
  }

  const withoutPrefix = value.trim().startsWith("@") ? value.trim().slice(1) : value.trim();
  return entityByOriginalId.get(withoutPrefix)
    ?? entityByOriginalId.get(normalizeReferenceId(value))
    ?? (expectedTargetKind ? buildExternalTargetFromRawReference(value, expectedTargetKind) : undefined);
};

const getEntityByEntityId = (
  entityByEntityId: Map<string, ObjectEntity>,
  entityId: string | undefined
): ResolvedReferenceTarget | undefined =>
  entityId
    ? entityByEntityId.get(entityId) ?? buildExternalTargetFromEntityId(entityId)
    : undefined;

const findRelation = (
  record: ChemdTrainingExportV2,
  fromEntityId: string,
  relationTypes: ReadonlySet<ExportedRelationV1["relation_type"]>
): ExportedRelationV1 | undefined =>
  record.semantic_layer.links.find((relation) =>
    relation.from_entity_id === fromEntityId && relationTypes.has(relation.relation_type)
  );

const findOutgoingRelation = (
  record: ChemdTrainingExportV2,
  fromEntityId: string,
  relationTypes: ReadonlySet<ExportedRelationV1["relation_type"]>,
  role?: string
): ExportedRelationV1 | undefined =>
  record.semantic_layer.links.find((relation) =>
    relation.from_entity_id === fromEntityId
    && relationTypes.has(relation.relation_type)
    && (!role || relation.role === role)
  );

const createStructuredReference = (
  raw: string,
  source: Pick<TrainingResolvedReferenceV1, "source_entity_id" | "source_entity_type" | "source_field">,
  target: ResolvedReferenceTarget | undefined,
  relationType?: ExportedRelationV1["relation_type"]
): TrainingResolvedReferenceV1 => ({
  raw,
  ...source,
  ...(target ? { target_entity_id: target.entity_id, target_original_id: target.original_id } : {}),
  ...(relationType ? { relation_type: relationType } : {}),
  resolution_status: target ? "resolved" : "unresolved"
});

const buildMarkdownReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] =>
  record.semantic_layer.markdown_blocks.flatMap((block) =>
    block.references.map((reference) => {
      const target = entityByOriginalId.get(reference.source);

      return {
        raw: reference.raw,
        source_entity_id: block.entity_id,
        source_entity_type: "markdown",
        ...(reference.field ? { source_field: "markdown_reference", target_field: reference.field } : {}),
        ...(target ? { target_entity_id: target.entity_id, target_original_id: target.original_id } : {}),
        ...(reference.resolution_status ? { resolution_status: reference.resolution_status } : {}),
        ...(reference.resolution_value !== undefined ? { resolution_value: reference.resolution_value } : {})
      };
    })
  );

const buildReactionParticipantReferences = (record: ChemdTrainingExportV2): TrainingResolvedReferenceV1[] =>
  record.semantic_layer.reactions.flatMap((reaction) => [
    ...reaction.reactants
      .filter((participant) => participant.reference_status !== "literal")
      .map((participant) => createStructuredReference(
        participant.raw,
        {
          source_entity_id: reaction.entity_id,
          source_entity_type: "reaction",
          source_field: "reactants"
        },
        participant.target_entity_id
          ? ({
              entity_id: participant.target_entity_id,
              original_id: participant.target_original_id
            } as ObjectEntity)
          : undefined,
        participant.target_entity_id ? "reaction_uses_molecule" : undefined
      )),
    ...reaction.products
      .filter((participant) => participant.reference_status !== "literal")
      .map((participant) => createStructuredReference(
        participant.raw,
        {
          source_entity_id: reaction.entity_id,
          source_entity_type: "reaction",
          source_field: "products"
        },
        participant.target_entity_id
          ? ({
              entity_id: participant.target_entity_id,
              original_id: participant.target_original_id
            } as ObjectEntity)
          : undefined,
        participant.target_entity_id ? "reaction_produces_molecule" : undefined
      ))
  ]);

const resolveReactionRouteTarget = (
  entityByOriginalId: Map<string, ObjectEntity>,
  raw: string
): { entityId?: string; originalId?: string } => {
  const target = getEntityByRawReference(entityByOriginalId, raw, "reaction");
  if (target?.entity_id) {
    return {
      entityId: target.entity_id,
      originalId: target.original_id
    };
  }

  return {};
};

const buildReactionRouteReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  entityByEntityId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] =>
  record.semantic_layer.reactions.flatMap((reaction) =>
    [
      ...(reaction.prev_refs_raw ?? []).map((raw) =>
        buildReactionRouteReference({
          entityByEntityId,
          entityByOriginalId,
          raw,
          reaction,
          record,
          sourceField: "prev"
        })
      ),
      ...(reaction.next_refs_raw ?? []).map((raw) =>
        buildReactionRouteReference({
          entityByEntityId,
          entityByOriginalId,
          raw,
          reaction,
          record,
          sourceField: "next"
        })
      )
    ]
  );

const buildReactionRouteReference = (input: {
  entityByEntityId: Map<string, ObjectEntity>;
  entityByOriginalId: Map<string, ObjectEntity>;
  raw: string;
  reaction: ChemdTrainingExportV2["semantic_layer"]["reactions"][number];
  record: ChemdTrainingExportV2;
  sourceField: "prev" | "next";
}): TrainingResolvedReferenceV1 => {
  const target = resolveReactionRouteTarget(input.entityByOriginalId, input.raw);
  const relation = findMatchingRouteRelation(
    input.record,
    input.reaction.entity_id,
    input.sourceField,
    target.entityId
  );
  const relationTarget = getEntityByEntityId(input.entityByEntityId, relation?.to_entity_id);
  const resolvedEntityId = relationTarget?.entity_id ?? target.entityId;
  const resolvedOriginalId = relationTarget?.original_id ?? target.originalId;

  return {
    raw: input.raw,
    source_entity_id: input.reaction.entity_id,
    source_entity_type: "reaction",
    source_field: input.sourceField,
    ...(resolvedEntityId ? { target_entity_id: resolvedEntityId } : {}),
    ...(resolvedOriginalId ? { target_original_id: resolvedOriginalId } : {}),
    ...(relation ? { relation_type: relation.relation_type } : {}),
    resolution_status: relation ? "resolved" : "unresolved"
  };
};

const findMatchingRouteRelation = (
  record: ChemdTrainingExportV2,
  fromEntityId: string,
  role: "prev" | "next",
  targetEntityId: string | undefined
): ExportedRelationV1 | undefined =>
  record.semantic_layer.links.find((relation) =>
    relation.from_entity_id === fromEntityId
    && REACTION_ROUTE_RELATIONS.has(relation.relation_type)
    && relation.role === role
    && (!targetEntityId || relation.to_entity_id === targetEntityId)
  );

const buildResultReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] =>
  record.semantic_layer.results.flatMap((result) => {
    const relation = findRelation(record, result.entity_id, new Set(["result_describes_reaction"]));
    const reactionRaw = result.reaction_ref_raw ?? result.ref_raw;
    const references = reactionRaw
      ? [createStructuredReference(
          reactionRaw,
          {
            source_entity_id: result.entity_id,
            source_entity_type: "result",
            source_field: result.reaction_ref_raw ? "reaction" : "ref"
          },
          getEntityByRawReference(entityByOriginalId, reactionRaw, "reaction"),
          relation?.relation_type
        )]
      : [];

    return result.product_ref_raw
      ? [
          ...references,
          createStructuredReference(
            result.product_ref_raw,
            {
              source_entity_id: result.entity_id,
              source_entity_type: "result",
              source_field: "product"
            },
            getEntityByRawReference(entityByOriginalId, result.product_ref_raw, "molecule")
          )
        ]
      : references;
  });

const buildSingleFieldReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  entityByEntityId: Map<string, ObjectEntity>,
  entities: Array<ExportedAnalysisV1 | ExportedSampleV1>,
  sourceType: "analysis" | "sample"
): TrainingResolvedReferenceV1[] =>
  entities.flatMap((entity) => {
    if (!entity.ref_raw) {
      return [];
    }

    const relationTypes = sourceType === "analysis" ? EVIDENCE_RELATIONS : SAMPLE_LINEAGE_RELATIONS;
    const relation = findOutgoingRelation(record, entity.entity_id, relationTypes, "ref");
    const target = getEntityByRawReference(entityByOriginalId, entity.ref_raw)
      ?? getEntityByEntityId(entityByEntityId, relation?.to_entity_id);

    return [createStructuredReference(
      entity.ref_raw,
      {
        source_entity_id: entity.entity_id,
        source_entity_type: sourceType,
        source_field: "ref"
      },
      target,
      relation?.relation_type
    )];
  });

const buildSampleLineageReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  entityByEntityId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] =>
  record.semantic_layer.samples.flatMap((sample) => [
    ...([
      ["derived_from", sample.derived_from_raw],
      ["aliquot_of", sample.aliquot_of_raw],
      ["batch_of", sample.batch_of_raw]
    ] as const).flatMap(([field, raw]) =>
      createSampleLineageReference({
        record,
        entityByOriginalId,
        entityByEntityId,
        sample,
        field,
        raw
      })
    ),
    ...(sample.artifact_refs_raw ?? []).flatMap((raw) =>
      createSampleLineageReference({
        record,
        entityByOriginalId,
        entityByEntityId,
        sample,
        field: "artifacts",
        raw
      })
    )
  ]);

interface SampleLineageReferenceInput {
  record: ChemdTrainingExportV2;
  entityByOriginalId: Map<string, ObjectEntity>;
  entityByEntityId: Map<string, ObjectEntity>;
  sample: ExportedSampleV1;
  field: SampleLineageReferenceField;
  raw: string | undefined;
}

const createSampleLineageReference = (input: SampleLineageReferenceInput): TrainingResolvedReferenceV1[] => {
  if (!input.raw) {
    return [];
  }

  const relation = findOutgoingRelation(
    input.record,
    input.sample.entity_id,
    SAMPLE_LINEAGE_FIELD_RELATIONS[input.field],
    SAMPLE_LINEAGE_FIELD_ROLES[input.field]
  );
  const explicitTarget = input.field === "artifacts"
    ? getEntityByRawReference(input.entityByOriginalId, input.raw, "artifact")
    : input.field === "aliquot_of" || input.field === "batch_of"
      ? getEntityByRawReference(input.entityByOriginalId, input.raw, "sample")
      : getEntityByRawReference(input.entityByOriginalId, input.raw);
  const resolvedTarget = explicitTarget ?? getEntityByEntityId(input.entityByEntityId, relation?.to_entity_id);

  return [createStructuredReference(
    input.raw,
    {
      source_entity_id: input.sample.entity_id,
      source_entity_type: "sample",
      source_field: input.field
    },
    resolvedTarget,
    relation?.relation_type
  )];
};

const buildArtifactReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  entityByEntityId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] =>
  record.semantic_layer.artifacts.flatMap((artifact) => {
    if (!artifact.ref_raw) {
      return [];
    }

    const relation = findOutgoingRelation(record, artifact.entity_id, ARTIFACT_EVIDENCE_RELATIONS, "ref");
    const target = getEntityByRawReference(entityByOriginalId, artifact.ref_raw)
      ?? getEntityByEntityId(entityByEntityId, relation?.to_entity_id);

    return [createStructuredReference(
      artifact.ref_raw,
      {
        source_entity_id: artifact.entity_id,
        source_entity_type: "artifact",
        source_field: "ref"
      },
      target,
      relation?.relation_type
    )];
  });

interface ConditionVariationReferenceInput {
  record: ChemdTrainingExportV2;
  entityByOriginalId: Map<string, ObjectEntity>;
  entityByEntityId: Map<string, ObjectEntity>;
  variation: ExportedConditionVaryV1;
  field: "reaction" | "standard";
  raw: string | undefined;
}

const createConditionVariationReference = (input: ConditionVariationReferenceInput): TrainingResolvedReferenceV1[] => {
  if (!input.raw) {
    return [];
  }

  const relationTypeSet = new Set<ExportedRelationV1["relation_type"]>([
    input.field === "reaction"
      ? "condition_variation_targets_reaction"
      : "condition_variation_compares_standard"
  ]);
  const relation = findOutgoingRelation(input.record, input.variation.entity_id, relationTypeSet, input.field);
  const target = getEntityByRawReference(input.entityByOriginalId, input.raw, "reaction")
    ?? getEntityByEntityId(input.entityByEntityId, relation?.to_entity_id);

  return [createStructuredReference(
    input.raw,
    {
      source_entity_id: input.variation.entity_id,
      source_entity_type: "condition_varies",
      source_field: input.field
    },
    target,
    relation?.relation_type
  )];
};

const buildConditionVariationReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  entityByEntityId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] =>
  record.semantic_layer.condition_variations.flatMap((variation) => [
    ...createConditionVariationReference({
      record,
      entityByOriginalId,
      entityByEntityId,
      variation,
      field: "reaction",
      raw: variation.reaction_ref_raw
    }),
    ...createConditionVariationReference({
      record,
      entityByOriginalId,
      entityByEntityId,
      variation,
      field: "standard",
      raw: variation.standard_ref_raw
    }),
    ...record.semantic_layer.condition_variation_attempts
      .filter((attempt) => attempt.parent_condition_variation_id === variation.entity_id)
      .flatMap((attempt) => [
        ...createAttemptReference({
          record,
          entityByOriginalId,
          entityByEntityId,
          attempt,
          field: "reaction",
          raw: attempt.reaction_ref_raw
        }),
        ...createAttemptReference({
          record,
          entityByOriginalId,
          entityByEntityId,
          attempt,
          field: "result",
          raw: attempt.result_ref_raw
        })
      ])
  ]);

interface AttemptReferenceInput {
  record: ChemdTrainingExportV2;
  entityByOriginalId: Map<string, ObjectEntity>;
  entityByEntityId: Map<string, ObjectEntity>;
  attempt: ExportedConditionVariationAttemptV1;
  field: "reaction" | "result";
  raw: string | undefined;
}

const createAttemptReference = (input: AttemptReferenceInput): TrainingResolvedReferenceV1[] => {
  if (!input.raw) {
    return [];
  }

  const relationTypeSet = new Set<ExportedRelationV1["relation_type"]>([
    input.field === "reaction"
      ? "condition_variation_attempt_targets_reaction"
      : "condition_variation_attempt_has_result"
  ]);
  const relation = findOutgoingRelation(input.record, input.attempt.entity_id, relationTypeSet, input.field);
  const target = getEntityByRawReference(
    input.entityByOriginalId,
    input.raw,
    input.field === "reaction" ? "reaction" : "result"
  ) ?? getEntityByEntityId(input.entityByEntityId, relation?.to_entity_id);

  return [createStructuredReference(
    input.raw,
    {
      source_entity_id: input.attempt.entity_id,
      source_entity_type: "condition_variation_attempt",
      source_field: input.field
    },
    target,
    relation?.relation_type
  )];
};

const buildResolvedReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  entityByEntityId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] => [
  ...buildMarkdownReferences(record, entityByOriginalId),
  ...buildReactionParticipantReferences(record),
  ...buildReactionRouteReferences(record, entityByOriginalId, entityByEntityId),
  ...buildResultReferences(record, entityByOriginalId),
  ...buildSingleFieldReferences(record, entityByOriginalId, entityByEntityId, record.semantic_layer.analyses, "analysis"),
  ...buildSingleFieldReferences(record, entityByOriginalId, entityByEntityId, record.semantic_layer.samples, "sample"),
  ...buildSampleLineageReferences(record, entityByOriginalId, entityByEntityId),
  ...buildArtifactReferences(record, entityByOriginalId, entityByEntityId),
  ...buildConditionVariationReferences(record, entityByOriginalId, entityByEntityId)
];

const buildProcedureLogicPairs = (record: ChemdTrainingExportV2): TrainingProcedureLogicPairV1[] =>
  record.learning_layer.procedure_to_steps?.map((pair) => ({
    pair_id: pair.pair_id,
    ...(pair.procedure_id ? { procedure_id: pair.procedure_id } : {}),
    ...(pair.source_type ? { source_type: pair.source_type } : {}),
    source_text: pair.source_text,
    steps: pair.steps,
    ...(pair.low_confidence_step_count !== undefined
      ? { low_confidence_step_count: pair.low_confidence_step_count }
      : {})
  })) ?? [];

const buildObservationLogicPairs = (record: ChemdTrainingExportV2): TrainingObservationLogicPairV1[] =>
  record.learning_layer.observation_to_events?.map((pair) => ({
    pair_id: pair.pair_id,
    ...(pair.observation_id ? { observation_id: pair.observation_id } : {}),
    source_text: pair.source_text,
    events: pair.events
  })) ?? [];

const getPrimaryIds = (record: ChemdTrainingExportV2): Array<[PrimaryRole, string | undefined]> => [
  ["molecule", record.document.primary_molecule_id],
  ["reaction", record.document.primary_reaction_id],
  ["result", record.document.primary_result_id],
  ["analysis", record.document.primary_analysis_id],
  ["sample", record.document.primary_sample_id]
];

const buildPrimaryEntities = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingPrimaryEntityV1[] =>
  getPrimaryIds(record).flatMap(([role, originalId]) => {
    if (!originalId) {
      return [];
    }

    return [{
      role,
      original_id: originalId,
      ...(entityByOriginalId.get(originalId) ? { entity_id: entityByOriginalId.get(originalId)?.entity_id } : {})
    }];
  });

const findLinkedReactionId = (
  result: ExportedResultV1,
  relations: ExportedRelationV1[]
): string | undefined =>
  relations.find((relation) =>
    relation.relation_type === "result_describes_reaction"
    && relation.from_entity_id === result.entity_id
  )?.to_entity_id;

const findLinkedResultForReaction = (
  record: ChemdTrainingExportV2,
  reactionEntityId: string
): ExportedResultV1 | undefined =>
  record.semantic_layer.results.find((result) =>
    findLinkedReactionId(result, record.semantic_layer.links) === reactionEntityId
  );

const buildOutcomeLogic = (record: ChemdTrainingExportV2): TrainingOutcomeLogicV1[] =>
  record.semantic_layer.results.map((result) => ({
    result_entity_id: result.entity_id,
    ...(findLinkedReactionId(result, record.semantic_layer.links)
      ? { reaction_entity_id: findLinkedReactionId(result, record.semantic_layer.links) }
      : {}),
    ...(result.status_label ? { status_label: result.status_label } : {}),
    yield_percent: result.yield_percent,
    conversion_percent: result.conversion_percent,
    selectivity_percent: result.selectivity_percent,
    purity_percent: result.purity_percent
  }));

const formatParticipantList = (reaction: ExportedReactionV1, role: "reactant" | "product"): string | null => {
  const values = (role === "reactant" ? reaction.reactants : reaction.products)
    .map((participant) => participant.target_entity_id ?? participant.name ?? participant.raw)
    .filter(Boolean);

  return values.length > 0 ? values.join(" + ") : null;
};

const getReactionVariableMap = (reaction: ExportedReactionV1): Record<string, string | number | null> => ({
  reaction_name: reaction.name ?? null,
  reactants: formatParticipantList(reaction, "reactant"),
  products: formatParticipantList(reaction, "product"),
  solvent: reaction.normalized_conditions.solvent?.normalized ?? null,
  catalyst: reaction.normalized_conditions.catalyst?.normalized ?? null,
  reagents: reaction.normalized_conditions.reagents?.normalized.join(", ") ?? null,
  atmosphere: reaction.normalized_conditions.atmosphere?.normalized ?? null,
  temperature: formatNumericWithUnit(reaction.normalized_conditions.temperature) ?? null,
  time: formatNumericWithUnit(reaction.normalized_conditions.time) ?? null,
  pressure: formatNumericWithUnit(reaction.normalized_conditions.pressure) ?? null
});

const TRACKED_REACTION_FIELDS = [
  "reaction_name",
  "reactants",
  "products",
  "solvent",
  "catalyst",
  "reagents",
  "atmosphere",
  "temperature",
  "time",
  "pressure"
];

const getContextImplicitValue = (
  implicitFacts: TrainingImplicitConditionFactV1[],
  context: TrainingExperimentDesignContextV1,
  field: string
): LogicValue | undefined =>
  implicitFacts.find((fact) =>
    fact.reaction_entity_id === context.reaction_entity_id
    && fact.field === field
    && fact.evidence_entity_ids.some((entityId) => context.evidence_entity_ids.includes(entityId))
  )?.value;

const buildVariableDeltas = (
  baseline: ExportedReactionV1,
  candidate: ExportedReactionV1
): {
  changed: TrainingExperimentVariableDeltaV1[];
  controlled: string[];
} => {
  const baselineValues = getReactionVariableMap(baseline);
  const candidateValues = getReactionVariableMap(candidate);

  return Object.keys(candidateValues).reduce(
    (result, field) => {
      const baselineValue = baselineValues[field];
      const candidateValue = candidateValues[field];

      if (baselineValue === candidateValue) {
        return baselineValue === null
          ? result
          : { ...result, controlled: [...result.controlled, field] };
      }

      return {
        ...result,
        changed: [
          ...result.changed,
          {
            field,
            ...(baselineValue !== undefined ? { baseline_value: baselineValue } : {}),
            ...(candidateValue !== undefined ? { candidate_value: candidateValue } : {})
          }
        ]
      };
    },
    { changed: [] as TrainingExperimentVariableDeltaV1[], controlled: [] as string[] }
  );
};

const toExplicitDelta = (
  change: ExportedConditionVaryV1["changes"][number]
): TrainingExperimentVariableDeltaV1 => ({
  field: change.field,
  ...(change.baseline_raw ? { baseline_value: change.baseline_raw } : {}),
  ...(change.candidate_raw ? { candidate_value: change.candidate_raw } : { candidate_value: change.raw })
});

const findReactionByRawRef = (
  reactions: ExportedReactionV1[],
  rawRef: string | undefined
): ExportedReactionV1 | undefined =>
  rawRef
    ? reactions.find((reaction) => reaction.original_id === normalizeReferenceId(rawRef))
    : undefined;

const findResultByRawRef = (
  results: ExportedResultV1[],
  rawRef: string | undefined
): ExportedResultV1 | undefined =>
  rawRef
    ? results.find((result) => result.original_id === normalizeReferenceId(rawRef))
    : undefined;

const hasConditionEvidence = (context: TrainingExperimentDesignContextV1): boolean =>
  context.evidence_entity_ids.some((entityId) => entityId.startsWith("cv::"));

const buildExplicitDesignContext = (
  record: ChemdTrainingExportV2,
  variation: ExportedConditionVaryV1
): TrainingExperimentDesignContextV1[] => {
  if (record.semantic_layer.condition_variation_attempts.some((attempt) =>
    attempt.parent_condition_variation_id === variation.entity_id
  )) {
    return [];
  }

  const candidate = findReactionByRawRef(record.semantic_layer.reactions, variation.reaction_ref_raw);
  if (!candidate) {
    return [];
  }

  const standard = findReactionByRawRef(record.semantic_layer.reactions, variation.standard_ref_raw);
  const linkedResult = findLinkedResultForReaction(record, candidate.entity_id);
  const inferredDeltas = standard ? buildVariableDeltas(standard, candidate) : { controlled: [] };

  return [{
    context_id: `design::${record.document.document_id}::${candidate.entity_id}`,
    reaction_entity_id: candidate.entity_id,
    ...(linkedResult ? { linked_result_entity_id: linkedResult.entity_id } : {}),
    series_id: `series::${record.document.document_id}::${standard?.entity_id ?? variation.entity_id}`,
    variant_role: standard?.entity_id === candidate.entity_id ? "baseline" : "variant",
    ...(standard && standard.entity_id !== candidate.entity_id
      ? { baseline_reaction_entity_id: standard.entity_id }
      : {}),
    changed_variables: variation.changes.map(toExplicitDelta),
    controlled_variables: inferredDeltas.controlled,
    evidence_entity_ids: uniqueStrings([
      variation.entity_id,
      candidate.entity_id,
      ...(standard ? [standard.entity_id] : []),
      ...(linkedResult ? [linkedResult.entity_id] : [])
    ])
  }];
};

const buildExplicitAttemptDesignContext = (
  record: ChemdTrainingExportV2,
  attempt: ExportedConditionVariationAttemptV1
): TrainingExperimentDesignContextV1[] => {
  const parent = record.semantic_layer.condition_variations.find((variation) =>
    variation.entity_id === attempt.parent_condition_variation_id
  );
  const candidate = findReactionByRawRef(record.semantic_layer.reactions, attempt.reaction_ref_raw);
  if (!parent || !candidate) {
    return [];
  }

  const standard = findReactionByRawRef(record.semantic_layer.reactions, parent.standard_ref_raw);
  const explicitResult = findResultByRawRef(record.semantic_layer.results, attempt.result_ref_raw);
  const linkedResult = explicitResult ?? findLinkedResultForReaction(record, candidate.entity_id);
  const controlled = attempt.condition
    .filter((condition) => !attempt.changes.some((change) => change.field === condition.field))
    .map((condition) => condition.field);

  return [{
    context_id: `design::${record.document.document_id}::${attempt.entity_id}`,
    reaction_entity_id: candidate.entity_id,
    ...(linkedResult ? { linked_result_entity_id: linkedResult.entity_id } : {}),
    series_id: `series::${record.document.document_id}::${parent.entity_id}`,
    variant_role: standard?.entity_id === candidate.entity_id ? "baseline" : "variant",
    ...(standard && standard.entity_id !== candidate.entity_id
      ? { baseline_reaction_entity_id: standard.entity_id }
      : {}),
    changed_variables: attempt.changes.map(toExplicitDelta),
    controlled_variables: controlled,
    evidence_entity_ids: uniqueStrings([
      parent.entity_id,
      attempt.entity_id,
      candidate.entity_id,
      ...(standard ? [standard.entity_id] : []),
      ...(linkedResult ? [linkedResult.entity_id] : [])
    ])
  }];
};

const buildExplicitDesignContexts = (
  record: ChemdTrainingExportV2
): Map<string, TrainingExperimentDesignContextV1> =>
  new Map(
    record.semantic_layer.condition_variations
      .flatMap((variation) => buildExplicitDesignContext(record, variation))
      .concat(record.semantic_layer.condition_variation_attempts.flatMap((attempt) =>
        buildExplicitAttemptDesignContext(record, attempt)
      ))
      .map((context) => [context.reaction_entity_id, context])
  );

const buildExperimentDesignContexts = (record: ChemdTrainingExportV2): TrainingExperimentDesignContextV1[] => {
  const baseline = record.semantic_layer.reactions.find((reaction) => reaction.is_primary)
    ?? record.semantic_layer.reactions[0];
  const explicitContexts = buildExplicitDesignContexts(record);

  if (!baseline) {
    return [];
  }

  const seriesId = `series::${record.document.document_id}::${baseline.entity_id}`;
  return record.semantic_layer.reactions.map((reaction) => {
    const explicitContext = explicitContexts.get(reaction.entity_id);
    if (explicitContext) {
      return explicitContext;
    }

    const linkedResult = findLinkedResultForReaction(record, reaction.entity_id);
    const reactionVariables = getReactionVariableMap(reaction);
    const deltas = reaction.entity_id === baseline.entity_id
      ? {
          changed: [],
          controlled: Object.keys(reactionVariables).filter((field) => reactionVariables[field] !== null)
        }
      : buildVariableDeltas(baseline, reaction);

    return {
      context_id: `design::${record.document.document_id}::${reaction.entity_id}`,
      reaction_entity_id: reaction.entity_id,
      ...(linkedResult ? { linked_result_entity_id: linkedResult.entity_id } : {}),
      series_id: seriesId,
      variant_role: record.semantic_layer.reactions.length === 1
        ? "single_run"
        : reaction.entity_id === baseline.entity_id
          ? "baseline"
          : "variant",
      ...(reaction.entity_id !== baseline.entity_id ? { baseline_reaction_entity_id: baseline.entity_id } : {}),
      changed_variables: deltas.changed,
      controlled_variables: deltas.controlled,
      evidence_entity_ids: uniqueStrings([reaction.entity_id, ...(linkedResult ? [linkedResult.entity_id] : [])])
    };
  });
};

const getConditionVariationWarnings = (
  variation: ExportedConditionVaryV1,
  candidate: ExportedReactionV1 | undefined,
  standard: ExportedReactionV1 | undefined
): string[] => [
  ...(!candidate ? ["condition_variation_reaction_unresolved"] : []),
  ...(!standard ? ["condition_variation_standard_unresolved"] : []),
  ...(variation.changes.length === 0 ? ["condition_variation_without_changes"] : [])
];

const getAttemptWarnings = (
  attempt: ExportedConditionVariationAttemptV1,
  candidate: ExportedReactionV1 | undefined,
  result: ExportedResultV1 | undefined
): string[] => [
  ...(!candidate ? ["condition_variation_attempt_reaction_unresolved"] : []),
  ...(attempt.result_ref_raw && !result ? ["condition_variation_attempt_result_unresolved"] : []),
  ...(attempt.changes.length === 0 ? ["condition_variation_attempt_without_changes"] : [])
];

const buildAttemptConditionVariationLogic = (
  record: ChemdTrainingExportV2
): TrainingConditionVariationLogicV1[] =>
  record.semantic_layer.condition_variation_attempts.map((attempt) => {
    const parent = record.semantic_layer.condition_variations.find((variation) =>
      variation.entity_id === attempt.parent_condition_variation_id
    );
    const candidate = findReactionByRawRef(record.semantic_layer.reactions, attempt.reaction_ref_raw);
    const result = findResultByRawRef(record.semantic_layer.results, attempt.result_ref_raw);
    const standard = findReactionByRawRef(record.semantic_layer.reactions, parent?.standard_ref_raw);
    const warnings = getAttemptWarnings(attempt, candidate, result);

    return {
      variation_id: `condition-variation::${attempt.entity_id}`,
      condition_variation_entity_id: attempt.parent_condition_variation_id,
      condition_variation_attempt_entity_id: attempt.entity_id,
      attempt_id: attempt.attempt_id,
      ...(candidate ? { reaction_entity_id: candidate.entity_id } : {}),
      ...(result ? { result_entity_id: result.entity_id } : {}),
      ...(standard ? { standard_reaction_entity_id: standard.entity_id } : {}),
      condition: attempt.condition.map(toExplicitDelta),
      changed_variables: attempt.changes.map(toExplicitDelta),
      logic_source: "explicit",
      confidence: warnings.length === 0 ? "high" : "low",
      evidence_entity_ids: uniqueStrings([
        attempt.parent_condition_variation_id,
        attempt.entity_id,
        ...(candidate ? [candidate.entity_id] : []),
        ...(result ? [result.entity_id] : []),
        ...(standard ? [standard.entity_id] : [])
      ]),
      review_required: warnings.length > 0,
      warnings
    };
  });

const buildConditionVariationLogic = (
  record: ChemdTrainingExportV2
): TrainingConditionVariationLogicV1[] => {
  const legacyLogic: TrainingConditionVariationLogicV1[] = record.semantic_layer.condition_variations.flatMap((variation) => {
    if (record.semantic_layer.condition_variation_attempts.some((attempt) =>
      attempt.parent_condition_variation_id === variation.entity_id
    )) {
      return [];
    }

    const candidate = findReactionByRawRef(record.semantic_layer.reactions, variation.reaction_ref_raw);
    const standard = findReactionByRawRef(record.semantic_layer.reactions, variation.standard_ref_raw);
    const warnings = getConditionVariationWarnings(variation, candidate, standard);

    return [{
      variation_id: `condition-variation::${variation.entity_id}`,
      condition_variation_entity_id: variation.entity_id,
      ...(candidate ? { reaction_entity_id: candidate.entity_id } : {}),
      ...(standard ? { standard_reaction_entity_id: standard.entity_id } : {}),
      condition: [],
      changed_variables: variation.changes.map(toExplicitDelta),
      logic_source: "explicit",
      confidence: warnings.length === 0 ? "high" : "low",
      evidence_entity_ids: uniqueStrings([
        variation.entity_id,
        ...(candidate ? [candidate.entity_id] : []),
        ...(standard ? [standard.entity_id] : [])
      ]),
      review_required: warnings.length > 0,
      warnings
    }];
  });

  return [...legacyLogic, ...buildAttemptConditionVariationLogic(record)];
};

const buildVariationImplicitConditionFacts = (
  variation: ExportedConditionVaryV1,
  candidate: ExportedReactionV1 | undefined,
  standard: ExportedReactionV1 | undefined
): TrainingImplicitConditionFactV1[] => {
  if (!candidate || !standard) {
    return [];
  }

  const changedFields = new Set(variation.changes.map((change) => change.field));
  const authoredBaselineFields = new Set((variation.condition ?? []).map((condition) => condition.field));
  const candidateValues = getReactionVariableMap(candidate);
  const standardValues = getReactionVariableMap(standard);

  return TRACKED_REACTION_FIELDS.flatMap((field) => {
    if (changedFields.has(field) || candidateValues[field] !== null || standardValues[field] === null) {
      return [];
    }

    return [{
      fact_id: `implicit-condition::${variation.entity_id}::${candidate.entity_id}::${field}`,
      reaction_entity_id: candidate.entity_id,
      condition_variation_entity_id: variation.entity_id,
      field,
      value: standardValues[field],
      source: "condition_varies_standard_inheritance",
      confidence: authoredBaselineFields.has(field) ? "high" : "medium",
      evidence_entity_ids: uniqueStrings([variation.entity_id, candidate.entity_id, standard.entity_id]),
      review_required: !authoredBaselineFields.has(field),
      warnings: authoredBaselineFields.has(field) ? [] : ["standard_inherited_without_authored_baseline"]
    }];
  });
};

const buildAttemptImplicitConditionFacts = (
  record: ChemdTrainingExportV2,
  attempt: ExportedConditionVariationAttemptV1
): TrainingImplicitConditionFactV1[] => {
  const parent = record.semantic_layer.condition_variations.find((variation) =>
    variation.entity_id === attempt.parent_condition_variation_id
  );
  const candidate = findReactionByRawRef(record.semantic_layer.reactions, attempt.reaction_ref_raw);
  if (!parent || !candidate) {
    return [];
  }

  const changedFields = new Set(attempt.changes.map((change) => change.field));
  return attempt.condition.flatMap((condition) => {
    if (changedFields.has(condition.field)) {
      return [];
    }

    const value = condition.candidate_raw ?? condition.baseline_raw ?? condition.raw;
    if (value === undefined) {
      return [];
    }

    return [{
      fact_id: `implicit-condition::${attempt.entity_id}::${candidate.entity_id}::${condition.field}`,
      reaction_entity_id: candidate.entity_id,
      condition_variation_entity_id: parent.entity_id,
      condition_variation_attempt_entity_id: attempt.entity_id,
      field: condition.field,
      value,
      source: "condition_varies_attempt_inheritance",
      confidence: "high",
      evidence_entity_ids: uniqueStrings([
        parent.entity_id,
        attempt.entity_id,
        candidate.entity_id
      ]),
      review_required: false,
      warnings: []
    }];
  });
};

const buildImplicitConditionFacts = (
  record: ChemdTrainingExportV2
): TrainingImplicitConditionFactV1[] => {
  const facts = [
    ...record.semantic_layer.condition_variations.flatMap((variation) =>
      buildVariationImplicitConditionFacts(
        variation,
        findReactionByRawRef(record.semantic_layer.reactions, variation.reaction_ref_raw),
        findReactionByRawRef(record.semantic_layer.reactions, variation.standard_ref_raw)
      )
    ),
    ...record.semantic_layer.condition_variation_attempts.flatMap((attempt) =>
      buildAttemptImplicitConditionFacts(record, attempt)
    )
  ];

  return Array.from(new Map(facts.map((fact) => [fact.fact_id, fact])).values());
};

const getReactionClassificationText = (reaction: ExportedReactionV1): string =>
  compactText(
    reaction.name,
    reaction.caption,
    reaction.reagents_raw,
    reaction.catalyst_raw,
    reaction.solvent_raw,
    reaction.conditions_raw?.join(" "),
    reaction.normalized_conditions.catalyst?.normalized,
    reaction.normalized_conditions.reagents?.normalized.join(" "),
    formatParticipantList(reaction, "reactant") ?? undefined,
    formatParticipantList(reaction, "product") ?? undefined
  )?.toLowerCase() ?? "";

const getContextualReactionTags = (text: string): string[] => [
  ...(hasAnyTerm(text, ["palladium", "pd("]) ? ["palladium_catalysis"] : []),
  ...(hasAnyTerm(text, ["nickel", "ni("]) ? ["nickel_catalysis"] : []),
  ...(hasAnyTerm(text, ["photoredox", "irradiation", "blue led", "led"]) ? ["photochemistry"] : []),
  ...(hasAnyTerm(text, ["base", "k2co3", "cs2co3", "tea", "dipea"]) ? ["base_screening"] : []),
  ...(hasAnyTerm(text, ["ligand", "xphos", "sphos", "binap"]) ? ["ligand_screening"] : [])
];

const inferReactionTaxonomy = (
  reaction: ExportedReactionV1
): Omit<TrainingReactionTaxonomyV1, "reaction_entity_id" | "evidence_entity_ids"> => {
  const text = getReactionClassificationText(reaction);
  const rule = REACTION_TAXONOMY_RULES.find((candidate) =>
    hasAnyTerm(text, candidate.terms)
  );

  if (!rule) {
    return {
      reaction_family: "unknown",
      transformation_tags: getContextualReactionTags(text),
      confidence: "unknown",
      warnings: ["reaction_family_not_inferred"]
    };
  }

  return {
    reaction_family: rule.family,
    transformation_tags: uniqueStrings([...rule.tags, ...getContextualReactionTags(text)]),
    confidence: rule.confidence,
    warnings: []
  };
};

const buildReactionTaxonomy = (record: ChemdTrainingExportV2): TrainingReactionTaxonomyV1[] =>
  record.semantic_layer.reactions.map((reaction) => ({
    reaction_entity_id: reaction.entity_id,
    ...inferReactionTaxonomy(reaction),
    evidence_entity_ids: [reaction.entity_id]
  }));

const qualityByResultId = (
  outcomeQuality: TrainingOutcomeQualityV1[]
): Map<string, TrainingOutcomeQualityV1> =>
  new Map(outcomeQuality.map((quality) => [quality.result_entity_id, quality]));

const outcomeByResultId = (
  outcomes: TrainingOutcomeLogicV1[]
): Map<string, TrainingOutcomeLogicV1> =>
  new Map(outcomes.map((outcome) => [outcome.result_entity_id, outcome]));

const inferFailureModes = (
  outcome: TrainingOutcomeLogicV1,
  quality: TrainingOutcomeQualityV1 | undefined
): TrainingFailureSignalV1["failure_modes"] => [
  ...(outcome.status_label === "failed" ? ["failed_status" as const] : []),
  ...(typeof outcome.yield_percent === "number" && outcome.yield_percent < LOW_YIELD_THRESHOLD ? ["low_yield" as const] : []),
  ...(typeof outcome.conversion_percent === "number" && outcome.conversion_percent < LOW_CONVERSION_THRESHOLD ? ["low_conversion" as const] : []),
  ...(typeof outcome.selectivity_percent === "number" && outcome.selectivity_percent < LOW_SELECTIVITY_THRESHOLD ? ["low_selectivity" as const] : []),
  ...(typeof outcome.purity_percent === "number" && outcome.purity_percent < LOW_PURITY_THRESHOLD ? ["low_purity" as const] : []),
  ...(quality?.has_conflicting_values ? ["conflicting_result_values" as const] : []),
  ...(quality && quality.yield_confidence !== "confirmed" ? ["analytical_uncertainty" as const] : []),
  ...(!outcome.reaction_entity_id ? ["missing_reaction_link" as const] : [])
];

const uniqueFailureModes = (
  modes: TrainingFailureSignalV1["failure_modes"]
): TrainingFailureSignalV1["failure_modes"] => Array.from(new Set(modes));

const hasActionableFailureMode = (
  modes: TrainingFailureSignalV1["failure_modes"]
): boolean => modes.some((mode) => mode !== "analytical_uncertainty");

const getRecommendedChecks = (
  modes: TrainingFailureSignalV1["failure_modes"]
): string[] => uniqueStrings([
  ...(modes.includes("failed_status") ? ["Check reaction setup, reagent identity, and analysis evidence."] : []),
  ...(modes.includes("low_yield") ? ["Review limiting reagent, conversion, workup, and isolated yield basis."] : []),
  ...(modes.includes("low_conversion") ? ["Inspect temperature, time, catalyst, base, and reagent equivalence."] : []),
  ...(modes.includes("low_selectivity") ? ["Review side-product evidence and selectivity-driving conditions."] : []),
  ...(modes.includes("low_purity") ? ["Inspect purification records and analytical confirmation."] : []),
  ...(modes.includes("conflicting_result_values") ? ["Resolve conflicting linked result values before training."] : []),
  ...(modes.includes("analytical_uncertainty") ? ["Confirm yield basis with analysis or isolation evidence."] : []),
  ...(modes.includes("missing_reaction_link") ? ["Link the result to a reaction before decision training."] : [])
]);

const buildFailureSignals = (
  outcomes: TrainingOutcomeLogicV1[],
  outcomeQuality: TrainingOutcomeQualityV1[]
): TrainingFailureSignalV1[] => {
  const qualityByResult = qualityByResultId(outcomeQuality);

  return outcomes.flatMap((outcome) => {
    const quality = qualityByResult.get(outcome.result_entity_id);
    const modes = inferFailureModes(outcome, quality);
    if (modes.length === 0 || !hasActionableFailureMode(modes)) {
      return [];
    }

    return [{
      failure_id: `failure::${outcome.result_entity_id}`,
      result_entity_id: outcome.result_entity_id,
      ...(outcome.reaction_entity_id ? { reaction_entity_id: outcome.reaction_entity_id } : {}),
      failure_modes: uniqueFailureModes(modes),
      evidence_entity_ids: uniqueStrings([
        outcome.result_entity_id,
        ...(outcome.reaction_entity_id ? [outcome.reaction_entity_id] : []),
        ...(quality?.evidence_entity_ids ?? [])
      ]),
      recommended_checks: getRecommendedChecks(modes),
      confidence: quality?.has_conflicting_values ? "low" : "medium",
      warnings: quality?.warnings ?? []
    }];
  });
};

const getIntentKind = (
  input: IntentContextInput
): TrainingIntentHypothesisV1["intent_kind"] => {
  if (input.failure) {
    return "failure_diagnosis";
  }
  if (input.context.changed_variables.length > 0) {
    return "optimization";
  }
  if (input.quality?.result_confirmed_by_analysis) {
    return "characterization";
  }
  return input.context.variant_role === "single_run" ? "synthesis" : "baseline_observation";
};

const getIntentObjective = (
  input: IntentContextInput
): string => {
  const changed = input.context.changed_variables.map((variable) => variable.field).join(", ");
  if (input.failure) {
    return "Diagnose the linked outcome and identify review points before using the record for decision training.";
  }
  if (changed) {
    return `Compare the effect of changed variable(s): ${changed}.`;
  }
  if (input.quality?.result_confirmed_by_analysis) {
    return "Connect the reported result with analytical evidence for characterization.";
  }
  return input.procedurePairs.length > 0
    ? "Execute the recorded procedure and capture the linked reaction outcome."
    : "Represent the baseline experiment facts and available outcome context.";
};

const getIntentConfidence = (
  input: IntentContextInput
): TrainingInferenceConfidenceV1 => {
  if (hasConditionEvidence(input.context) && input.context.changed_variables.length > 0) {
    return "high";
  }
  if (input.failure || input.quality?.warnings.length) {
    return "low";
  }
  if (input.quality?.result_confirmed_by_analysis && input.procedurePairs.length > 0) {
    return "high";
  }
  return input.outcome || input.context.changed_variables.length > 0 ? "medium" : "low";
};

const getIntentFactors = (
  input: IntentContextInput
): string[] => uniqueStrings([
  `variant_role:${input.context.variant_role}`,
  ...input.context.changed_variables.map((variable) => `changed:${variable.field}`),
  ...(input.context.controlled_variables.length > 0
    ? [`controlled_variables:${input.context.controlled_variables.length}`]
    : []),
  ...(input.quality?.result_confirmed_by_analysis ? ["result_confirmed_by_analysis"] : []),
  ...(input.failure ? input.failure.failure_modes.map((mode) => `failure_mode:${mode}`) : []),
  ...(input.procedurePairs.length > 0 ? [`procedure_pairs:${input.procedurePairs.length}`] : [])
]);

const buildIntentHypotheses = (
  input: IntentBuildInput
): TrainingIntentHypothesisV1[] => {
  const outcomeByResult = outcomeByResultId(input.outcomes);
  const qualityByResult = qualityByResultId(input.outcomeQuality);
  const failureByResult = new Map(input.failureSignals.map((failure) => [failure.result_entity_id, failure]));

  return input.contexts.map((context) => {
    const outcome = context.linked_result_entity_id
      ? outcomeByResult.get(context.linked_result_entity_id)
      : undefined;
    const quality = context.linked_result_entity_id
      ? qualityByResult.get(context.linked_result_entity_id)
      : undefined;
    const failure = context.linked_result_entity_id
      ? failureByResult.get(context.linked_result_entity_id)
      : undefined;
    const intentInput = { context, outcome, quality, failure, procedurePairs: input.procedurePairs };

    return {
      intent_id: `intent::${context.context_id}`,
      intent_kind: getIntentKind(intentInput),
      objective: getIntentObjective(intentInput),
      reaction_entity_id: context.reaction_entity_id,
      ...(context.linked_result_entity_id ? { result_entity_id: context.linked_result_entity_id } : {}),
      logic_source: hasConditionEvidence(context) ? "explicit" : DERIVED_LOGIC_SOURCE,
      confidence: getIntentConfidence(intentInput),
      evidence_entity_ids: uniqueStrings([
        ...context.evidence_entity_ids,
        ...(quality?.evidence_entity_ids ?? []),
        ...(failure?.evidence_entity_ids ?? []),
        ...input.procedurePairs.map((pair) => pair.pair_id)
      ]),
      supporting_factors: getIntentFactors(intentInput),
      review_required: Boolean(failure || quality?.warnings.length)
    };
  });
};

const addValueField = (
  key: "baseline_value" | "candidate_value" | "value",
  value: LogicValue | undefined
): Partial<TrainingVariableLogicV1> =>
  value === undefined ? {} : { [key]: value };

const buildChangedVariableLogic = (
  context: TrainingExperimentDesignContextV1
): TrainingVariableLogicV1[] =>
  context.changed_variables.map((variable) => ({
    variable_id: `variable::${context.context_id}::changed::${variable.field}`,
    reaction_entity_id: context.reaction_entity_id,
    field: variable.field,
    variable_role: "changed",
    ...addValueField("baseline_value", variable.baseline_value),
    ...addValueField("candidate_value", variable.candidate_value),
    logic_source: DERIVED_LOGIC_SOURCE,
    confidence: "medium",
    evidence_entity_ids: context.evidence_entity_ids,
    review_required: false
  }));

const buildControlledVariableLogic = (
  context: TrainingExperimentDesignContextV1,
  reaction: ExportedReactionV1 | undefined,
  implicitFacts: TrainingImplicitConditionFactV1[]
): TrainingVariableLogicV1[] => {
  const values = reaction ? getReactionVariableMap(reaction) : {};
  return context.controlled_variables.map((field) => ({
    variable_id: `variable::${context.context_id}::controlled::${field}`,
    reaction_entity_id: context.reaction_entity_id,
    field,
    variable_role: "controlled",
    ...addValueField("value", values[field] ?? getContextImplicitValue(implicitFacts, context, field)),
    logic_source: getContextImplicitValue(implicitFacts, context, field) !== undefined ? "explicit" : DERIVED_LOGIC_SOURCE,
    confidence: getContextImplicitValue(implicitFacts, context, field) !== undefined ? "high" : "medium",
    evidence_entity_ids: context.evidence_entity_ids,
    review_required: false
  }));
};

const getVariableLogicKey = (logic: TrainingVariableLogicV1): string =>
  `${logic.reaction_entity_id}::${logic.variable_role}::${logic.field}`;

const buildExplicitConditionVariableLogic = (
  variations: TrainingConditionVariationLogicV1[]
): TrainingVariableLogicV1[] =>
  variations.flatMap((variation) =>
    variation.reaction_entity_id
      ? variation.changed_variables.map((change) => ({
          variable_id: `variable::${variation.variation_id}::changed::${change.field}`,
          reaction_entity_id: variation.reaction_entity_id as string,
          field: change.field,
          variable_role: "changed" as const,
          ...addValueField("baseline_value", change.baseline_value),
          ...addValueField("candidate_value", change.candidate_value),
          logic_source: "explicit" as const,
          confidence: variation.confidence,
          evidence_entity_ids: variation.evidence_entity_ids,
          review_required: variation.review_required
        }))
      : []
  );

const buildVariableLogic = (
  record: ChemdTrainingExportV2,
  contexts: TrainingExperimentDesignContextV1[],
  conditionVariations: TrainingConditionVariationLogicV1[],
  implicitFacts: TrainingImplicitConditionFactV1[]
): TrainingVariableLogicV1[] => {
  const reactionById = new Map(record.semantic_layer.reactions.map((reaction) => [reaction.entity_id, reaction]));
  const explicitLogic = buildExplicitConditionVariableLogic(conditionVariations);
  const explicitKeys = new Set(explicitLogic.map(getVariableLogicKey));
  const derivedLogic = contexts.flatMap((context) => [
    ...buildChangedVariableLogic(context),
    ...buildControlledVariableLogic(context, reactionById.get(context.reaction_entity_id), implicitFacts)
  ]);

  return [
    ...derivedLogic.filter((logic) => !explicitKeys.has(getVariableLogicKey(logic))),
    ...explicitLogic
  ];
};

const buildVariableCausalLinks = (
  contexts: TrainingExperimentDesignContextV1[],
  outcomes: TrainingOutcomeLogicV1[]
): TrainingCausalLinkV1[] => {
  const outcomeByResult = outcomeByResultId(outcomes);
  return contexts.flatMap((context) => {
    const outcome = context.linked_result_entity_id
      ? outcomeByResult.get(context.linked_result_entity_id)
      : undefined;
    const logicSource = hasConditionEvidence(context) ? "explicit" : DERIVED_LOGIC_SOURCE;
    const confidence = hasConditionEvidence(context) ? "high" : "medium";
    return context.changed_variables.flatMap((variable) =>
      outcome && context.linked_result_entity_id
        ? [{
            causal_link_id: `causal::${context.context_id}::changed::${variable.field}`,
            link_type: "changed_variable_may_affect_outcome" as const,
            cause: `${variable.field} changed between baseline and candidate.`,
            effect: "The linked result may reflect this changed experimental variable.",
            source_entity_ids: [context.reaction_entity_id],
            target_entity_ids: [context.linked_result_entity_id],
            logic_source: logicSource,
            confidence,
            evidence_entity_ids: context.evidence_entity_ids,
            review_required: false,
            warnings: []
          }]
        : []
    );
  });
};

const buildControlledCausalLinks = (
  contexts: TrainingExperimentDesignContextV1[]
): TrainingCausalLinkV1[] =>
  contexts.flatMap((context) =>
    context.variant_role === "variant" && context.controlled_variables.length > 0
      ? [{
          causal_link_id: `causal::${context.context_id}::controlled`,
          link_type: "controlled_variable_preserves_comparison",
          cause: `${context.controlled_variables.length} variables are held constant for comparison.`,
          effect: "The comparison can focus on the changed variables.",
          source_entity_ids: [context.reaction_entity_id],
          target_entity_ids: context.baseline_reaction_entity_id
            ? [context.baseline_reaction_entity_id, context.reaction_entity_id]
            : [context.reaction_entity_id],
          logic_source: hasConditionEvidence(context) ? "explicit" : DERIVED_LOGIC_SOURCE,
          confidence: hasConditionEvidence(context) ? "high" : "medium",
          evidence_entity_ids: context.evidence_entity_ids,
          review_required: false,
          warnings: []
        }]
      : []
  );

const buildProcedureCausalLinks = (
  record: ChemdTrainingExportV2,
  procedurePairs: ProcedurePair[]
): TrainingCausalLinkV1[] => {
  const target = record.semantic_layer.reactions.find((reaction) => reaction.is_primary)
    ?? record.semantic_layer.reactions[0];
  if (!target) {
    return [];
  }

  return procedurePairs
    .filter((pair) => pair.steps.length > 0)
    .map((pair) => ({
      causal_link_id: `causal::${pair.pair_id}::procedure`,
      link_type: "procedure_enables_reaction",
      cause: "The recorded procedure supplies ordered operations for the experiment.",
      effect: "The procedure operationalizes the target reaction.",
      source_entity_ids: [pair.pair_id],
      target_entity_ids: [target.entity_id],
      logic_source: DERIVED_LOGIC_SOURCE,
      confidence: pair.low_confidence_step_count ? "low" : "medium",
      evidence_entity_ids: [pair.pair_id, target.entity_id],
      review_required: Boolean(pair.low_confidence_step_count),
      warnings: pair.low_confidence_step_count ? ["low_confidence_steps"] : []
    }));
};

const buildEvidenceCausalLinks = (
  evidenceLinks: TrainingEvidenceLinkV1[]
): TrainingCausalLinkV1[] =>
  evidenceLinks.map((link) => ({
    causal_link_id: `causal::${link.evidence_entity_id}::supports::${link.target_entity_id}`,
    link_type: "evidence_supports_outcome_claim",
    cause: `${link.evidence_type} evidence is linked to the target entity.`,
    effect: "The target claim has structured supporting evidence.",
    source_entity_ids: [link.evidence_entity_id],
    target_entity_ids: [link.target_entity_id],
    logic_source: DERIVED_LOGIC_SOURCE,
    confidence: "medium",
    evidence_entity_ids: [link.evidence_entity_id, link.target_entity_id],
    review_required: false,
    warnings: []
  }));

const buildFailureCausalLinks = (
  failureSignals: TrainingFailureSignalV1[]
): TrainingCausalLinkV1[] =>
  failureSignals.map((failure) => ({
    causal_link_id: `causal::${failure.failure_id}::review`,
    link_type: "failure_signal_triggers_review",
    cause: `Failure signal(s): ${failure.failure_modes.join(", ")}.`,
    effect: "The experiment should be reviewed before decision-model evaluation.",
    source_entity_ids: [failure.result_entity_id],
    target_entity_ids: [failure.result_entity_id],
    logic_source: DERIVED_LOGIC_SOURCE,
    confidence: failure.confidence,
    evidence_entity_ids: failure.evidence_entity_ids,
    review_required: true,
    warnings: failure.warnings
  }));

const buildCausalLinks = (
  input: CausalLinkBuildInput
): TrainingCausalLinkV1[] => [
  ...buildVariableCausalLinks(input.contexts, input.outcomes),
  ...buildControlledCausalLinks(input.contexts),
  ...buildProcedureCausalLinks(input.record, input.procedurePairs),
  ...buildEvidenceCausalLinks(input.evidenceLinks),
  ...buildFailureCausalLinks(input.failureSignals)
];

const rankOutcomeYields = (
  steps: Array<{ resultEntityId?: string; yieldPercent?: number | null }>
): Map<string, number> => {
  const ranked = steps
    .filter((step): step is { resultEntityId: string; yieldPercent: number } =>
      Boolean(step.resultEntityId) && typeof step.yieldPercent === "number"
    )
    .sort((left, right) => right.yieldPercent - left.yieldPercent);

  return new Map(ranked.map((step, index) => [step.resultEntityId, index + 1]));
};

const buildOptimizationStep = (
  context: TrainingExperimentDesignContextV1,
  outcome: TrainingOutcomeLogicV1 | undefined,
  rankByResult: Map<string, number>,
  qualityByResult: Map<string, TrainingOutcomeQualityV1>
): TrainingOptimizationStepV1 => ({
  step_id: `trajectory-step::${context.context_id}`,
  reaction_entity_id: context.reaction_entity_id,
  ...(context.linked_result_entity_id ? { linked_result_entity_id: context.linked_result_entity_id } : {}),
  variant_role: context.variant_role,
  changed_variables: context.changed_variables,
  controlled_variables: context.controlled_variables,
  ...(outcome?.status_label ? { status_label: outcome.status_label } : {}),
  ...(outcome ? { yield_percent: outcome.yield_percent } : {}),
  ...(context.linked_result_entity_id && rankByResult.has(context.linked_result_entity_id)
    ? { outcome_rank: rankByResult.get(context.linked_result_entity_id) }
    : {}),
  warnings: context.linked_result_entity_id
    ? qualityByResult.get(context.linked_result_entity_id)?.warnings ?? []
    : ["missing_linked_result"]
});

const buildTrajectoryForSeries = (
  documentId: string,
  seriesId: string,
  contexts: TrainingExperimentDesignContextV1[],
  outcomes: TrainingOutcomeLogicV1[],
  outcomeQuality: TrainingOutcomeQualityV1[]
): TrainingOptimizationTrajectoryV1 => {
  const outcomeByResult = outcomeByResultId(outcomes);
  const qualityByResult = qualityByResultId(outcomeQuality);
  const rankByResult = rankOutcomeYields(contexts.map((context) => {
    const outcome = context.linked_result_entity_id
      ? outcomeByResult.get(context.linked_result_entity_id)
      : undefined;
    return { resultEntityId: context.linked_result_entity_id, yieldPercent: outcome?.yield_percent };
  }));
  const steps = contexts.map((context) =>
    buildOptimizationStep(context, context.linked_result_entity_id
      ? outcomeByResult.get(context.linked_result_entity_id)
      : undefined, rankByResult, qualityByResult)
  );
  const bestStep = steps.find((step) => step.outcome_rank === 1);

  return {
    trajectory_id: `trajectory::${documentId}::${seriesId}`,
    series_id: seriesId,
    ...(contexts.find((context) => context.variant_role === "baseline")
      ? { baseline_reaction_entity_id: contexts.find((context) => context.variant_role === "baseline")?.reaction_entity_id }
      : {}),
    ...(bestStep ? { best_reaction_entity_id: bestStep.reaction_entity_id } : {}),
    ...(typeof bestStep?.yield_percent === "number" ? { best_yield_percent: bestStep.yield_percent } : {}),
    steps,
    evidence_entity_ids: uniqueStrings(contexts.flatMap((context) => context.evidence_entity_ids)),
    warnings: uniqueStrings(steps.flatMap((step) => step.warnings))
  };
};

const buildOptimizationTrajectories = (
  documentId: string,
  contexts: TrainingExperimentDesignContextV1[],
  outcomes: TrainingOutcomeLogicV1[],
  outcomeQuality: TrainingOutcomeQualityV1[]
): TrainingOptimizationTrajectoryV1[] => {
  const bySeries = new Map<string, TrainingExperimentDesignContextV1[]>();
  contexts.forEach((context) => {
    bySeries.set(context.series_id, [...(bySeries.get(context.series_id) ?? []), context]);
  });

  return Array.from(bySeries.entries()).map(([seriesId, seriesContexts]) =>
    buildTrajectoryForSeries(documentId, seriesId, seriesContexts, outcomes, outcomeQuality)
  );
};

const getRouteLabels = (
  taxonomy: TrainingReactionTaxonomyV1,
  context: TrainingExperimentDesignContextV1 | undefined,
  quality: TrainingOutcomeQualityV1 | undefined,
  failure: TrainingFailureSignalV1 | undefined
): string[] => uniqueStrings([
  ...FAMILY_EXPERT_LABELS[taxonomy.reaction_family],
  ...(context ? ["condition_reasoning", "yield_prediction"] : []),
  ...(context && context.changed_variables.length > 0 ? ["condition_optimization"] : []),
  ...(quality?.result_confirmed_by_analysis ? ["analytical_confirmation"] : []),
  ...(failure ? ["failure_diagnosis"] : []),
  ...(taxonomy.reaction_family === "unknown" ? ["general_experiment_understanding"] : [])
]);

const buildExpertRouting = (
  taxonomies: TrainingReactionTaxonomyV1[],
  contexts: TrainingExperimentDesignContextV1[],
  outcomeQuality: TrainingOutcomeQualityV1[],
  failureSignals: TrainingFailureSignalV1[]
): TrainingExpertRoutingV1[] => {
  const contextByReaction = new Map(contexts.map((context) => [context.reaction_entity_id, context]));
  const qualityByReaction = new Map(outcomeQuality.flatMap((quality) =>
    quality.reaction_entity_id ? [[quality.reaction_entity_id, quality] as const] : []
  ));
  const failureByReaction = new Map(failureSignals.flatMap((failure) =>
    failure.reaction_entity_id ? [[failure.reaction_entity_id, failure] as const] : []
  ));

  return taxonomies.map((taxonomy) => {
    const context = contextByReaction.get(taxonomy.reaction_entity_id);
    const quality = qualityByReaction.get(taxonomy.reaction_entity_id);
    const failure = failureByReaction.get(taxonomy.reaction_entity_id);
    const warnings = uniqueStrings([...taxonomy.warnings, ...(quality?.warnings ?? []), ...(failure?.warnings ?? [])]);

    return {
      route_id: `expert-route::${taxonomy.reaction_entity_id}`,
      reaction_entity_id: taxonomy.reaction_entity_id,
      expert_labels: getRouteLabels(taxonomy, context, quality, failure),
      routing_basis: uniqueStrings([
        `reaction_family:${taxonomy.reaction_family}`,
        ...(context ? [`variant_role:${context.variant_role}`] : []),
        ...(failure ? failure.failure_modes.map((mode) => `failure_mode:${mode}`) : [])
      ]),
      confidence: warnings.length > 0 ? "low" : taxonomy.confidence,
      warnings
    };
  });
};

const buildEvidenceLinks = (
  record: ChemdTrainingExportV2,
  relationTypes: ReadonlySet<ExportedRelationV1["relation_type"]>,
  evidenceType: TrainingEvidenceLinkV1["evidence_type"]
): TrainingEvidenceLinkV1[] =>
  record.semantic_layer.links
    .filter((relation) => relationTypes.has(relation.relation_type))
    .map((relation) => ({
      evidence_entity_id: relation.from_entity_id,
      target_entity_id: relation.to_entity_id,
      relation_type: relation.relation_type,
      evidence_type: evidenceType
    }));

const getRelationsFromEntity = (
  record: ChemdTrainingExportV2,
  fromEntityId: string,
  relationTypes?: ReadonlySet<ExportedRelationV1["relation_type"]>
): ExportedRelationV1[] =>
  record.semantic_layer.links.filter((relation) =>
    relation.from_entity_id === fromEntityId
    && (!relationTypes || relationTypes.has(relation.relation_type))
  );

const getRelationsToEntity = (
  record: ChemdTrainingExportV2,
  toEntityId: string,
  relationTypes?: ReadonlySet<ExportedRelationV1["relation_type"]>
): ExportedRelationV1[] =>
  record.semantic_layer.links.filter((relation) =>
    relation.to_entity_id === toEntityId
    && (!relationTypes || relationTypes.has(relation.relation_type))
  );

const getSampleRole = (
  record: ChemdTrainingExportV2,
  sample: ExportedSampleV1
): TrainingSampleProfileV1["sample_role"] => {
  const outgoing = getRelationsFromEntity(record, sample.entity_id, SAMPLE_LINEAGE_RELATIONS);
  const incoming = getRelationsToEntity(record, sample.entity_id, SAMPLE_LINEAGE_RELATIONS);
  if (outgoing.some((relation) => relation.relation_type === "sample_aliquot_of_sample")) {
    return "aliquot";
  }
  if (outgoing.some((relation) => relation.relation_type === "sample_batch_of_sample")) {
    return "batch_member";
  }
  if (incoming.some((relation) => relation.relation_type === "sample_batch_of_sample")) {
    return "batch_parent";
  }
  if (outgoing.some((relation) => relation.relation_type === "sample_derived_from_reaction")) {
    return "reaction_output";
  }
  if (outgoing.some((relation) => relation.relation_type === "sample_derived_from_sample")) {
    return "derived_sample";
  }
  if (getRelationsToEntity(record, sample.entity_id, new Set(["analysis_targets_sample"])).length > 0) {
    return "analysis_subject";
  }
  if (outgoing.some((relation) => relation.relation_type === "sample_related_to_molecule")) {
    return "reference_material";
  }
  return "unknown";
};

const buildSampleProfiles = (
  record: ChemdTrainingExportV2
): TrainingSampleProfileV1[] =>
  record.semantic_layer.samples.map((sample) => {
    const outgoing = getRelationsFromEntity(record, sample.entity_id, SAMPLE_LINEAGE_RELATIONS);
    const incoming = getRelationsToEntity(record, sample.entity_id, SAMPLE_LINEAGE_RELATIONS);
    const analysisIds = getRelationsToEntity(record, sample.entity_id, new Set(["analysis_targets_sample"]))
      .map((relation) => relation.from_entity_id);

    return {
      sample_entity_id: sample.entity_id,
      sample_role: getSampleRole(record, sample),
      parent_entity_ids: outgoing
        .filter((relation) => relation.relation_type !== "sample_has_artifact")
        .map((relation) => relation.to_entity_id),
      child_sample_entity_ids: incoming
        .filter((relation) =>
          relation.relation_type === "sample_derived_from_sample"
          || relation.relation_type === "sample_aliquot_of_sample"
          || relation.relation_type === "sample_batch_of_sample"
        )
        .map((relation) => relation.from_entity_id),
      artifact_entity_ids: outgoing
        .filter((relation) => relation.relation_type === "sample_has_artifact")
        .map((relation) => relation.to_entity_id),
      analysis_entity_ids: analysisIds,
      evidence_entity_ids: uniqueStrings([
        sample.entity_id,
        ...outgoing.flatMap((relation) => [relation.from_entity_id, relation.to_entity_id]),
        ...incoming.flatMap((relation) => [relation.from_entity_id, relation.to_entity_id]),
        ...analysisIds
      ]),
      warnings: outgoing.length === 0 && incoming.length === 0 ? ["sample_profile_without_lineage"] : []
    };
  });

const getArtifactRole = (
  artifact: ExportedArtifactV1
): TrainingArtifactProfileV1["artifact_role"] => {
  const text = compactText(artifact.artifact_kind, artifact.path, artifact.notes)?.toLowerCase() ?? "";
  if (hasAnyTerm(text, ["nmr", "ms", "ir", "uv", "spectrum"])) {
    return "spectral_evidence";
  }
  if (hasAnyTerm(text, ["tlc", "lcms", "hplc", "gc", "chrom"])) {
    return "chromatography_evidence";
  }
  if (hasAnyTerm(text, ["image", "photo", ".png", ".jpg", ".jpeg"])) {
    return "image_evidence";
  }
  if (hasAnyTerm(text, ["notebook", "log", ".txt"])) {
    return "process_record";
  }
  return artifact.ref_raw ? "measurement_output" : "unknown";
};

const buildArtifactProfiles = (
  record: ChemdTrainingExportV2,
  stepDependencies: TrainingStepDependencyEdgeV1[]
): TrainingArtifactProfileV1[] =>
  record.semantic_layer.artifacts.map((artifact) => {
    const outgoing = getRelationsFromEntity(record, artifact.entity_id, ARTIFACT_EVIDENCE_RELATIONS);
    const incomingSampleRelations = getRelationsToEntity(record, artifact.entity_id, new Set(["sample_has_artifact"]));
    const incomingAnalysisRelations = getRelationsToEntity(record, artifact.entity_id, new Set(["artifact_supports_analysis"]));
    const producedByStepIds = stepDependencies
      .filter((edge) => edge.dependency_type === "step_produces_artifact" && edge.target_entity_id === artifact.entity_id)
      .map((edge) => edge.source_step_id);

    return {
      artifact_entity_id: artifact.entity_id,
      artifact_role: getArtifactRole(artifact),
      supports_entity_ids: outgoing.map((relation) => relation.to_entity_id),
      sample_entity_ids: incomingSampleRelations.map((relation) => relation.from_entity_id),
      analysis_entity_ids: outgoing
        .filter((relation) => relation.relation_type === "artifact_supports_analysis")
        .map((relation) => relation.to_entity_id)
        .concat(incomingAnalysisRelations.map((relation) => relation.from_entity_id)),
      produced_by_step_ids: producedByStepIds,
      evidence_entity_ids: uniqueStrings([
        artifact.entity_id,
        ...outgoing.flatMap((relation) => [relation.to_entity_id]),
        ...incomingSampleRelations.map((relation) => relation.from_entity_id),
        ...incomingAnalysisRelations.map((relation) => relation.from_entity_id),
        ...producedByStepIds
      ]),
      warnings: outgoing.length === 0 ? ["artifact_profile_without_support_target"] : []
    };
  });

const getEvidenceSourceRefs = (
  record: ChemdTrainingExportV2,
  evidenceEntityId: string
): SourceRefCandidate[] => {
  const analysis = record.semantic_layer.analyses.find((entity) => entity.entity_id === evidenceEntityId);
  if (analysis) {
    return [
      { entity_id: analysis.entity_id, field: "result", source_span: getFieldSourceSpan(analysis, "result") },
      { entity_id: analysis.entity_id, field: "data", source_span: getFieldSourceSpan(analysis, "data") },
      { entity_id: analysis.entity_id, field: "notes", source_span: getFieldSourceSpan(analysis, "notes") }
    ].filter((item) => item.source_span || item.field === "result");
  }

  const artifact = record.semantic_layer.artifacts.find((entity) => entity.entity_id === evidenceEntityId);
  if (artifact) {
    return [
      { entity_id: artifact.entity_id, field: "notes", source_span: getFieldSourceSpan(artifact, "notes") },
      { entity_id: artifact.entity_id, field: "path", source_span: getFieldSourceSpan(artifact, "path") }
    ].filter((item) => item.source_span || item.field === "notes");
  }

  return [{ entity_id: evidenceEntityId }];
};

const inferEvidenceInterpretationFromText = (
  text: string,
  kindHint: "analysis" | "artifact"
): { kind: TrainingEvidenceInterpretationKindV1; signal: string; confidence: TrainingInferenceConfidenceV1 } | undefined => {
  const lowered = text.toLowerCase();
  const negative = NEGATIVE_EVIDENCE_TERMS.find((term) => lowered.includes(term));
  if (negative) {
    return { kind: "weakens", signal: negative, confidence: "medium" };
  }

  const positive = POSITIVE_EVIDENCE_TERMS.find((term) => lowered.includes(term));
  if (!positive) {
    return undefined;
  }

  return {
    kind: kindHint === "analysis" && hasAnyTerm(lowered, ["nmr", "ms", "spectrum"]) ? "identifies" : "supports",
    signal: positive,
    confidence: "medium"
  };
};

const buildEvidenceInterpretations = (
  record: ChemdTrainingExportV2,
  fieldEvidence: TrainingFieldEvidenceV1[],
  evidenceLinks: TrainingEvidenceLinkV1[]
): TrainingEvidenceInterpretationV1[] => {
  const quantifiedFields = new Set(["yield_percent", "conversion_percent", "selectivity_percent", "purity_percent"]);
  const quantitative = fieldEvidence.flatMap((evidence) =>
    evidence.evidence_entity_ids
      .filter((entityId) => entityId !== evidence.subject_entity_id && quantifiedFields.has(evidence.field))
      .map((entityId) => ({
        interpretation_id: `evidence-interpretation::${entityId}::${evidence.subject_entity_id}::${evidence.field}`,
        evidence_entity_id: entityId,
        target_entity_id: evidence.subject_entity_id,
        target_field: evidence.field,
        interpretation_kind: "quantifies" as const,
        statement: `${entityId} provides structured support for ${evidence.field}.`,
        logic_source: DERIVED_LOGIC_SOURCE,
        confidence: (evidence.normalized ? "high" : "medium") as TrainingInferenceConfidenceV1,
        source_refs: getEvidenceSourceRefs(record, entityId),
        review_required: false,
        warnings: []
      }))
  );

  const textual = evidenceLinks.flatMap((link) => {
    const analysis = record.semantic_layer.analyses.find((entity) => entity.entity_id === link.evidence_entity_id);
    const artifact = record.semantic_layer.artifacts.find((entity) => entity.entity_id === link.evidence_entity_id);
    const text = compactText(
      analysis?.result_raw,
      analysis?.data_raw,
      analysis?.notes,
      artifact?.notes
    );
    const inferred = text
      ? inferEvidenceInterpretationFromText(text, analysis ? "analysis" : "artifact")
      : undefined;
    if (!inferred) {
      return [];
    }

    return [{
      interpretation_id: `evidence-interpretation::${link.evidence_entity_id}::${link.target_entity_id}::${inferred.kind}`,
      evidence_entity_id: link.evidence_entity_id,
      target_entity_id: link.target_entity_id,
      interpretation_kind: inferred.kind,
      statement: text as string,
      extracted_signal: inferred.signal,
      logic_source: DERIVED_LOGIC_SOURCE,
      confidence: inferred.confidence,
      source_refs: getEvidenceSourceRefs(record, link.evidence_entity_id),
      review_required: false,
      warnings: []
    }];
  });

  return Array.from(new Map(
    [...quantitative, ...textual].map((item) => [item.interpretation_id, item])
  ).values());
};

const getEntityLabel = (entity: ObjectEntity): string | undefined => {
  if ("name" in entity && entity.name) {
    return entity.name;
  }

  if ("caption" in entity && entity.caption) {
    return entity.caption;
  }

  if ("analysis_type" in entity && entity.analysis_type) {
    return entity.analysis_type;
  }

  return entity.original_id ?? entity.entity_id;
};

const getProcedureNodeId = (documentId: string, pair: ProcedurePair): string =>
  `proc::${documentId}::${pair.procedure_id ?? pair.pair_id}`;

const getStepNodeId = (documentId: string, pair: ProcedurePair, step: ProcedureStep): string =>
  `step::${documentId}::${pair.procedure_id ?? pair.pair_id}::${step.stepId}`;

const getObservationNodeId = (documentId: string, pair: ObservationPair): string =>
  `obs::${documentId}::${pair.observation_id ?? pair.pair_id}`;

const getEventNodeId = (documentId: string, pair: ObservationPair, event: ObservationEvent, index: number): string =>
  `event::${documentId}::${pair.observation_id ?? pair.pair_id}::${event.eventId ?? index}`;

const getValueNodeId = (subjectEntityId: string, field: string): string =>
  `value::${subjectEntityId}::${field}`;

const getRawValueNodeId = (subjectEntityId: string, field: string): string =>
  `raw-value::${subjectEntityId}::${field}`;

const formatFieldValue = (value: FieldValue): string => String(value);

const formatNumericWithUnit = (
  value: { value?: number; unit?: string } | null | undefined
): string | undefined =>
  typeof value?.value === "number"
    ? compactText(String(value.value), value.unit)
    : undefined;

const semanticNodesForEntity = (
  nodeType: TrainingKnowledgeNodeV1["node_type"],
  entities: ObjectEntity[]
): TrainingKnowledgeNodeV1[] =>
  entities.map((entity) => ({
    node_id: entity.entity_id,
    node_type: nodeType,
    label: getEntityLabel(entity),
    original_id: entity.original_id,
    is_primary: entity.is_primary
  }));

const buildProcedureNodes = (record: ChemdTrainingExportV2): TrainingKnowledgeNodeV1[] =>
  record.learning_layer.procedure_to_steps?.flatMap((pair) => [
    {
      node_id: getProcedureNodeId(record.document.document_id, pair),
      node_type: "procedure" as const,
      label: pair.procedure_id ?? pair.pair_id,
      original_id: pair.procedure_id
    },
    ...pair.steps.map((step) => ({
      node_id: getStepNodeId(record.document.document_id, pair, step),
      node_type: "procedure_step" as const,
      label: compactText(step.family, step.source.rawText.slice(0, 80)),
      original_id: step.stepId
    }))
  ]) ?? [];

const buildObservationNodes = (record: ChemdTrainingExportV2): TrainingKnowledgeNodeV1[] =>
  record.learning_layer.observation_to_events?.flatMap((pair) => [
    {
      node_id: getObservationNodeId(record.document.document_id, pair),
      node_type: "observation" as const,
      label: pair.observation_id ?? pair.pair_id,
      original_id: pair.observation_id
    },
    ...pair.events.map((event, index) => ({
      node_id: getEventNodeId(record.document.document_id, pair, event, index),
      node_type: "observation_event" as const,
      label: compactText(event.eventType, event.rawText.slice(0, 80)),
      original_id: event.eventId
    }))
  ]) ?? [];

const buildFieldValueNodes = (fieldEvidence: TrainingFieldEvidenceV1[]): TrainingKnowledgeNodeV1[] =>
  fieldEvidence.flatMap((item) => [
    ...(item.raw_value_node_id && item.raw_value
      ? [{
          node_id: item.raw_value_node_id,
          node_type: "field_value" as const,
          label: `${item.field}: ${item.raw_value}`,
          subject_entity_id: item.subject_entity_id,
          field: item.field,
          value: item.raw_value
        }]
      : []),
    {
      node_id: item.value_node_id,
      node_type: item.normalized ? "normalized_value" as const : "field_value" as const,
      label: `${item.field}: ${formatFieldValue(item.value)}`,
      subject_entity_id: item.subject_entity_id,
      field: item.field,
      value: item.value
    }
  ]);

const buildKnowledgeNodes = (
  record: ChemdTrainingExportV2,
  fieldEvidence: TrainingFieldEvidenceV1[]
): TrainingKnowledgeNodeV1[] => [
  {
    node_id: `doc::${record.document.document_id}`,
    node_type: "document",
    label: record.document.title,
    original_id: record.document.document_id,
    is_primary: true
  },
  ...semanticNodesForEntity("molecule", record.semantic_layer.molecules),
  ...semanticNodesForEntity("reaction", record.semantic_layer.reactions),
  ...semanticNodesForEntity("result", record.semantic_layer.results),
  ...semanticNodesForEntity("analysis", record.semantic_layer.analyses),
  ...semanticNodesForEntity("sample", record.semantic_layer.samples),
  ...semanticNodesForEntity("artifact", record.semantic_layer.artifacts),
  ...semanticNodesForEntity("condition_variation", record.semantic_layer.condition_variations),
  ...semanticNodesForEntity("condition_variation_attempt", record.semantic_layer.condition_variation_attempts),
  ...record.semantic_layer.markdown_blocks.map((block) => ({
    node_id: block.entity_id,
    node_type: "narrative" as const,
    label: block.cleaned_text.slice(0, 80)
  })),
  ...buildProcedureNodes(record),
  ...buildObservationNodes(record),
  ...buildExternalReferencedNodes(record),
  ...buildFieldValueNodes(fieldEvidence)
];

function buildExternalReferencedNodes(record: ChemdTrainingExportV2): TrainingKnowledgeNodeV1[] {
  const localEntityIds = new Set([
    ...record.semantic_layer.molecules.map((entity) => entity.entity_id),
    ...record.semantic_layer.reactions.map((entity) => entity.entity_id),
    ...record.semantic_layer.results.map((entity) => entity.entity_id),
    ...record.semantic_layer.analyses.map((entity) => entity.entity_id),
    ...record.semantic_layer.samples.map((entity) => entity.entity_id),
    ...record.semantic_layer.artifacts.map((entity) => entity.entity_id),
    ...record.semantic_layer.condition_variations.map((entity) => entity.entity_id),
    ...record.semantic_layer.condition_variation_attempts.map((entity) => entity.entity_id)
  ]);
  const externalEntityIds = uniqueStrings(record.semantic_layer.links.flatMap((relation) =>
    [relation.from_entity_id, relation.to_entity_id].filter((entityId) =>
      entityId.includes("::") && !localEntityIds.has(entityId)
    )
  ));

  return externalEntityIds.flatMap((entityId) => {
    const target = buildExternalTargetFromEntityId(entityId);
    if (!target?.source_node_type) {
      return [];
    }

    const nodeType = target.source_node_type === "condition_varies"
      ? "condition_variation"
      : target.source_node_type;

    return [{
      node_id: entityId,
      node_type: nodeType,
      label: stripReferencePrefix(target.original_id ?? entityId),
      original_id: target.original_id
    }];
  });
}

const buildSemanticEdges = (record: ChemdTrainingExportV2): TrainingKnowledgeEdgeV1[] =>
  record.semantic_layer.links.map((relation) => ({
    edge_id: relation.relation_id,
    edge_type: relation.relation_type,
    from_node_id: relation.from_entity_id,
    to_node_id: relation.to_entity_id,
    ...(relation.role ? { role: relation.role } : {}),
    confidence: relation.confidence,
    edge_source: "semantic_relation"
  }));

const createStepReferenceEdges = (
  documentId: string,
  pair: ProcedurePair,
  step: ProcedureStep,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingKnowledgeEdgeV1[] =>
  [...(step.inputs ?? []), ...(step.outputs ?? [])].flatMap((item) => {
    const target = item.reference ? getEntityByRawReference(entityByOriginalId, item.reference.refId) : undefined;

    return target
      ? [{
          edge_id: `kg::${documentId}::step_mentions_entity::${step.stepId}::${target.entity_id}`,
          edge_type: "step_mentions_entity" as const,
          from_node_id: getStepNodeId(documentId, pair, step),
          to_node_id: target.entity_id,
          role: item.reference?.targetKind,
          confidence: step.loweringConfidence,
          edge_source: "procedure_logic" as const
        }]
      : [];
  });

const createStepDependencyEdges = (
  documentId: string,
  pair: ProcedurePair,
  step: ProcedureStep
): TrainingKnowledgeEdgeV1[] =>
  (step.dependsOn ?? []).flatMap((dependencyId) => {
    const dependency = pair.steps.find((candidate) => candidate.stepId === dependencyId);

    return dependency
      ? [{
          edge_id: `kg::${documentId}::step_depends_on_step::${step.stepId}::${dependencyId}`,
          edge_type: "step_depends_on_step" as const,
          from_node_id: getStepNodeId(documentId, pair, step),
          to_node_id: getStepNodeId(documentId, pair, dependency),
          confidence: step.loweringConfidence,
          edge_source: "procedure_logic" as const
        }]
      : [];
  });

const buildProcedureEdges = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingKnowledgeEdgeV1[] =>
  record.learning_layer.procedure_to_steps?.flatMap((pair) =>
    pair.steps.flatMap((step, index) => [
      {
        edge_id: `kg::${record.document.document_id}::procedure_has_step::${pair.pair_id}::${step.stepId}`,
        edge_type: "procedure_has_step" as const,
        from_node_id: getProcedureNodeId(record.document.document_id, pair),
        to_node_id: getStepNodeId(record.document.document_id, pair, step),
        confidence: step.loweringConfidence,
        edge_source: "procedure_logic" as const
      },
      ...(index > 0
        ? [{
            edge_id: `kg::${record.document.document_id}::step_precedes_step::${pair.steps[index - 1]?.stepId}::${step.stepId}`,
            edge_type: "step_precedes_step" as const,
            from_node_id: getStepNodeId(record.document.document_id, pair, pair.steps[index - 1] as ProcedureStep),
            to_node_id: getStepNodeId(record.document.document_id, pair, step),
            confidence: 1,
            edge_source: "procedure_logic" as const
          }]
        : []),
      ...createStepDependencyEdges(record.document.document_id, pair, step),
      ...createStepReferenceEdges(record.document.document_id, pair, step, entityByOriginalId)
    ])
  ) ?? [];

const buildStepNodeIndex = (record: ChemdTrainingExportV2): Map<string, string> =>
  new Map(
    record.learning_layer.procedure_to_steps?.flatMap((pair) =>
      pair.steps.map((step) => [step.stepId, getStepNodeId(record.document.document_id, pair, step)])
    ) ?? []
  );

const buildObservationEdges = (record: ChemdTrainingExportV2): TrainingKnowledgeEdgeV1[] => {
  const stepNodeById = buildStepNodeIndex(record);

  return record.learning_layer.observation_to_events?.flatMap((pair) =>
    pair.events.flatMap((event, index) => [
      {
        edge_id: `kg::${record.document.document_id}::observation_has_event::${pair.pair_id}::${event.eventId ?? index}`,
        edge_type: "observation_has_event" as const,
        from_node_id: getObservationNodeId(record.document.document_id, pair),
        to_node_id: getEventNodeId(record.document.document_id, pair, event, index),
        confidence: event.confidence,
        edge_source: "observation_logic" as const
      },
      ...(event.linkedStepId && stepNodeById.get(event.linkedStepId)
        ? [{
            edge_id: `kg::${record.document.document_id}::event_observed_step::${event.eventId ?? index}::${event.linkedStepId}`,
            edge_type: "event_observed_step" as const,
            from_node_id: getEventNodeId(record.document.document_id, pair, event, index),
            to_node_id: stepNodeById.get(event.linkedStepId) as string,
            confidence: event.confidence,
            edge_source: "observation_logic" as const
          }]
        : [])
    ])
  ) ?? [];
};

const createFieldEdges = (item: TrainingFieldEvidenceV1): TrainingKnowledgeEdgeV1[] => {
  const hasRawValueNode = Boolean(item.raw_value_node_id);
  const rawTargetNodeId = item.raw_value_node_id ?? item.value_node_id;
  const subjectEdgeType = hasRawValueNode || !item.normalized
    ? "entity_has_field_value"
    : "entity_has_normalized_value";
  const subjectEdgeSource = subjectEdgeType === "entity_has_normalized_value" ? "normalization" : "field_evidence";
  const supportEdges = item.evidence_entity_ids
    .filter((entityId) => entityId !== item.subject_entity_id)
    .map((entityId) => ({
      edge_id: `kg::field_supported_by_evidence::${entityId}::${item.value_node_id}`,
      edge_type: "field_supported_by_evidence" as const,
      from_node_id: entityId,
      to_node_id: item.value_node_id,
      role: item.field,
      confidence: 1,
      edge_source: "field_evidence" as const
    }));

  return [
    {
      edge_id: `kg::${subjectEdgeType}::${item.subject_entity_id}::${rawTargetNodeId}`,
      edge_type: subjectEdgeType,
      from_node_id: item.subject_entity_id,
      to_node_id: rawTargetNodeId,
      role: item.field,
      confidence: 1,
      edge_source: subjectEdgeSource
    },
    ...(item.raw_value_node_id
      ? [{
          edge_id: `kg::raw_field_normalized_to::${item.raw_value_node_id}::${item.value_node_id}`,
          edge_type: "raw_field_normalized_to" as const,
          from_node_id: item.raw_value_node_id,
          to_node_id: item.value_node_id,
          role: item.field,
          confidence: 1,
          edge_source: "normalization" as const
        }]
      : []),
    ...supportEdges
  ];
};

const buildKnowledgeEdges = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  fieldEvidence: TrainingFieldEvidenceV1[]
): TrainingKnowledgeEdgeV1[] => [
  ...buildSemanticEdges(record),
  ...buildProcedureEdges(record, entityByOriginalId),
  ...buildObservationEdges(record),
  ...fieldEvidence.flatMap(createFieldEdges)
];

const toInferenceConfidence = (score: number | null | undefined): TrainingInferenceConfidenceV1 => {
  if (score === undefined || score === null) {
    return "unknown";
  }
  if (score >= 0.9) {
    return "high";
  }
  return score >= 0.6 ? "medium" : "low";
};

const createMaterialFlowEdge = (input: FlowEdgeInput): TrainingMaterialFlowEdgeV1 => ({
  flow_edge_id: input.flowEdgeId,
  edge_type: input.edgeType,
  from_node_id: input.fromNodeId,
  to_node_id: input.toNodeId,
  ...(input.role ? { role: input.role } : {}),
  logic_source: DERIVED_LOGIC_SOURCE,
  confidence: input.confidence,
  evidence_entity_ids: uniqueStrings(input.evidenceEntityIds),
  review_required: input.reviewRequired ?? false,
  warnings: input.warnings ?? []
});

const entityMaterialNode = (
  nodeType: TrainingMaterialFlowNodeTypeV1,
  entity: ObjectEntity
): TrainingMaterialFlowNodeV1 => ({
  node_id: entity.entity_id,
  node_type: nodeType,
  label: getEntityLabel(entity),
  entity_id: entity.entity_id,
  source_entity_ids: [entity.entity_id]
});

const stepMaterialNode = (
  documentId: string,
  pair: ProcedurePair,
  step: ProcedureStep
): TrainingMaterialFlowNodeV1 => ({
  node_id: getStepNodeId(documentId, pair, step),
  node_type: "procedure_step",
  label: compactText(step.family, step.source.rawText.slice(0, 80)),
  step_id: step.stepId,
  source_entity_ids: [pair.procedure_id ?? pair.pair_id]
});

const buildMaterialFlowNodeCandidates = (record: ChemdTrainingExportV2): TrainingMaterialFlowNodeV1[] => [
  ...record.semantic_layer.molecules.map((entity) => entityMaterialNode("molecule", entity)),
  ...record.semantic_layer.reactions.map((entity) => entityMaterialNode("reaction", entity)),
  ...record.semantic_layer.results.map((entity) => entityMaterialNode("result", entity)),
  ...record.semantic_layer.analyses.map((entity) => entityMaterialNode("analysis", entity)),
  ...record.semantic_layer.samples.map((entity) => entityMaterialNode("sample", entity)),
  ...record.semantic_layer.artifacts.map((entity) => entityMaterialNode("artifact", entity)),
  ...(record.learning_layer.procedure_to_steps?.flatMap((pair) =>
    pair.steps.map((step) => stepMaterialNode(record.document.document_id, pair, step))
  ) ?? [])
];

const buildMaterialFlowNodes = (
  record: ChemdTrainingExportV2,
  edges: TrainingMaterialFlowEdgeV1[]
): TrainingMaterialFlowNodeV1[] => {
  const nodeIds = new Set(edges.flatMap((edge) => [edge.from_node_id, edge.to_node_id]));
  return buildMaterialFlowNodeCandidates(record).filter((node) => nodeIds.has(node.node_id));
};

const buildReactionMaterialFlowEdges = (record: ChemdTrainingExportV2): TrainingMaterialFlowEdgeV1[] =>
  record.semantic_layer.reactions.flatMap((reaction) => [
    ...reaction.reactants.flatMap((participant) =>
      participant.target_entity_id
        ? [createMaterialFlowEdge({
            flowEdgeId: `flow::${reaction.entity_id}::reactant::${participant.target_entity_id}`,
            edgeType: "material_input_to_reaction",
            fromNodeId: participant.target_entity_id,
            toNodeId: reaction.entity_id,
            role: participant.raw,
            confidence: "high",
            evidenceEntityIds: [participant.target_entity_id, reaction.entity_id]
          })]
        : []
    ),
    ...reaction.products.flatMap((participant) =>
      participant.target_entity_id
        ? [createMaterialFlowEdge({
            flowEdgeId: `flow::${reaction.entity_id}::product::${participant.target_entity_id}`,
            edgeType: "reaction_outputs_material",
            fromNodeId: reaction.entity_id,
            toNodeId: participant.target_entity_id,
            role: participant.raw,
            confidence: "high",
            evidenceEntityIds: [reaction.entity_id, participant.target_entity_id]
          })]
        : []
    )
  ]);

const createRelationMaterialFlowEdge = (
  relation: ExportedRelationV1
): TrainingMaterialFlowEdgeV1[] => {
  const spec = RELATION_MATERIAL_FLOW_SPECS[relation.relation_type];
  if (!spec) {
    return [];
  }

  return [createMaterialFlowEdge({
    flowEdgeId: `flow::${relation.relation_id}`,
    edgeType: spec.edgeType,
    fromNodeId: spec.reverse ? relation.to_entity_id : relation.from_entity_id,
    toNodeId: spec.reverse ? relation.from_entity_id : relation.to_entity_id,
    role: relation.role,
    confidence: toInferenceConfidence(relation.confidence ?? 1),
    evidenceEntityIds: [relation.from_entity_id, relation.to_entity_id]
  })];
};

const getStepIoTarget = (
  item: { reference?: { refId: string; resolved: boolean } },
  entityByOriginalId: Map<string, ObjectEntity>
): ResolvedReferenceTarget | undefined =>
  item.reference?.resolved ? getEntityByRawReference(entityByOriginalId, item.reference.refId) : undefined;

const buildStepMaterialFlowEdges = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingMaterialFlowEdgeV1[] =>
  record.learning_layer.procedure_to_steps?.flatMap((pair) =>
    pair.steps.flatMap((step) => {
      const stepNodeId = getStepNodeId(record.document.document_id, pair, step);
      return [
        ...(step.inputs ?? []).flatMap((input) => {
          const target = getStepIoTarget(input, entityByOriginalId);
          return target ? [createMaterialFlowEdge({
            flowEdgeId: `flow::${stepNodeId}::input::${target.entity_id}`,
            edgeType: "step_consumes_material",
            fromNodeId: target.entity_id,
            toNodeId: stepNodeId,
            role: input.raw,
            confidence: toInferenceConfidence(step.loweringConfidence),
            evidenceEntityIds: [target.entity_id, pair.procedure_id ?? pair.pair_id],
            reviewRequired: step.loweringConfidence < 0.6,
            warnings: step.loweringConfidence < 0.6 ? ["low_confidence_step"] : []
          })] : [];
        }),
        ...(step.outputs ?? []).flatMap((output) => {
          const target = getStepIoTarget(output, entityByOriginalId);
          return target ? [createMaterialFlowEdge({
            flowEdgeId: `flow::${stepNodeId}::output::${target.entity_id}`,
            edgeType: "step_produces_material",
            fromNodeId: stepNodeId,
            toNodeId: target.entity_id,
            role: output.raw,
            confidence: toInferenceConfidence(step.loweringConfidence),
            evidenceEntityIds: [pair.procedure_id ?? pair.pair_id, target.entity_id],
            reviewRequired: step.loweringConfidence < 0.6,
            warnings: step.loweringConfidence < 0.6 ? ["low_confidence_step"] : []
          })] : [];
        })
      ];
    })
  ) ?? [];

const dedupeMaterialFlowEdges = (
  edges: TrainingMaterialFlowEdgeV1[]
): TrainingMaterialFlowEdgeV1[] => Array.from(
  new Map(edges.map((edge) => [edge.flow_edge_id, edge])).values()
);

const buildMaterialFlowGraph = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingMaterialFlowGraphV1 => {
  const edges = dedupeMaterialFlowEdges([
    ...buildReactionMaterialFlowEdges(record),
    ...record.semantic_layer.links.flatMap(createRelationMaterialFlowEdge),
    ...buildStepMaterialFlowEdges(record, entityByOriginalId)
  ]);

  return {
    nodes: buildMaterialFlowNodes(record, edges),
    edges
  };
};

const createStepDependencyEdge = (
  edge: Omit<TrainingStepDependencyEdgeV1, "logic_source">
): TrainingStepDependencyEdgeV1 => ({
  ...edge,
  logic_source: DERIVED_LOGIC_SOURCE
});

const buildOrderedStepDependencies = (record: ChemdTrainingExportV2): TrainingStepDependencyEdgeV1[] =>
  record.learning_layer.procedure_to_steps?.flatMap((pair) =>
    pair.steps.flatMap((step, index) => {
      const previous = pair.steps[index - 1];
      return previous ? [createStepDependencyEdge({
        dependency_edge_id: `stepdep::${pair.pair_id}::order::${previous.stepId}::${step.stepId}`,
        dependency_type: "step_order_precedes",
        source_step_id: getStepNodeId(record.document.document_id, pair, previous),
        target_step_id: getStepNodeId(record.document.document_id, pair, step),
        procedure_pair_id: pair.pair_id,
        reason: "Procedure order places the source step before the target step.",
        confidence: "medium",
        evidence_entity_ids: [pair.procedure_id ?? pair.pair_id],
        review_required: true,
        warnings: ["positional_order_only"]
      })] : [];
    })
  ) ?? [];

const createExplicitStepDependency = (
  record: ChemdTrainingExportV2,
  pair: ProcedurePair,
  step: ProcedureStep,
  dependencyId: string
): TrainingStepDependencyEdgeV1[] => {
  const dependency = pair.steps.find((candidate) => candidate.stepId === dependencyId);
  return dependency ? [createStepDependencyEdge({
    dependency_edge_id: `stepdep::${pair.pair_id}::explicit::${dependencyId}::${step.stepId}`,
    dependency_type: "explicit_step_dependency",
    source_step_id: getStepNodeId(record.document.document_id, pair, dependency),
    target_step_id: getStepNodeId(record.document.document_id, pair, step),
    procedure_pair_id: pair.pair_id,
    reason: "The target step explicitly declares a dependency on the source step.",
    confidence: toInferenceConfidence(step.loweringConfidence),
    evidence_entity_ids: [pair.procedure_id ?? pair.pair_id],
    review_required: step.loweringConfidence < 0.6,
    warnings: step.loweringConfidence < 0.6 ? ["low_confidence_step"] : []
  })] : [];
};

const buildExplicitStepDependencies = (record: ChemdTrainingExportV2): TrainingStepDependencyEdgeV1[] =>
  record.learning_layer.procedure_to_steps?.flatMap((pair) =>
    pair.steps.flatMap((step) =>
      (step.dependsOn ?? []).flatMap((dependencyId) =>
        createExplicitStepDependency(record, pair, step, dependencyId)
      )
    )
  ) ?? [];

const buildOutputConsumptionStepDependencies = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingStepDependencyEdgeV1[] =>
  record.learning_layer.procedure_to_steps?.flatMap((pair) => {
    const producerByEntityId = new Map<string, ProcedureStep>();
    return pair.steps.flatMap((step) => {
      const dependencies = (step.inputs ?? []).flatMap((input) => {
        const target = getStepIoTarget(input, entityByOriginalId);
        const producer = target ? producerByEntityId.get(target.entity_id) : undefined;
        return target && producer ? [createStepDependencyEdge({
          dependency_edge_id: `stepdep::${pair.pair_id}::material::${producer.stepId}::${step.stepId}::${target.entity_id}`,
          dependency_type: "step_consumes_previous_output",
          source_step_id: getStepNodeId(record.document.document_id, pair, producer),
          target_step_id: getStepNodeId(record.document.document_id, pair, step),
          target_entity_id: target.entity_id,
          procedure_pair_id: pair.pair_id,
          reason: "The target step consumes material produced by the source step.",
          confidence: toInferenceConfidence(Math.min(producer.loweringConfidence, step.loweringConfidence)),
          evidence_entity_ids: [pair.procedure_id ?? pair.pair_id, target.entity_id],
          review_required: producer.loweringConfidence < 0.6 || step.loweringConfidence < 0.6,
          warnings: producer.loweringConfidence < 0.6 || step.loweringConfidence < 0.6 ? ["low_confidence_step"] : []
        })] : [];
      });
      (step.outputs ?? []).forEach((output) => {
        const target = getStepIoTarget(output, entityByOriginalId);
        if (target) {
          producerByEntityId.set(target.entity_id, step);
        }
      });
      return dependencies;
    });
  }) ?? [];

const buildArtifactStepDependencies = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingStepDependencyEdgeV1[] =>
  record.learning_layer.procedure_to_steps?.flatMap((pair) =>
    pair.steps.flatMap((step) =>
      (step.artifacts ?? []).map((artifact) => {
        const target = getEntityByRawReference(entityByOriginalId, artifact.artifactId);
        return createStepDependencyEdge({
          dependency_edge_id: `stepdep::${pair.pair_id}::artifact::${step.stepId}::${artifact.artifactId}`,
          dependency_type: "step_produces_artifact",
          source_step_id: getStepNodeId(record.document.document_id, pair, step),
          ...(target ? { target_entity_id: target.entity_id } : {}),
          procedure_pair_id: pair.pair_id,
          reason: "The step declares an artifact output.",
          confidence: toInferenceConfidence(step.loweringConfidence),
          evidence_entity_ids: uniqueStrings([pair.procedure_id ?? pair.pair_id, ...(target ? [target.entity_id] : [])]),
          review_required: step.loweringConfidence < 0.6 || !target,
          warnings: [
            ...(step.loweringConfidence < 0.6 ? ["low_confidence_step"] : []),
            ...(!target ? ["artifact_target_unresolved"] : [])
          ]
        });
      })
    )
  ) ?? [];

const buildObservationStepDependencies = (record: ChemdTrainingExportV2): TrainingStepDependencyEdgeV1[] => {
  const stepNodeById = buildStepNodeIndex(record);
  return record.learning_layer.observation_to_events?.flatMap((pair) =>
    pair.events.flatMap((event, index) =>
      event.linkedStepId && stepNodeById.get(event.linkedStepId)
        ? [createStepDependencyEdge({
            dependency_edge_id: `stepdep::${pair.pair_id}::observed::${event.linkedStepId}::${event.eventId ?? index}`,
            dependency_type: "step_observed_by_event",
            source_step_id: stepNodeById.get(event.linkedStepId) as string,
            target_event_id: getEventNodeId(record.document.document_id, pair, event, index),
            reason: "The observation event links back to the source procedure step.",
            confidence: toInferenceConfidence(event.confidence),
            evidence_entity_ids: [pair.observation_id ?? pair.pair_id],
            review_required: event.confidence < 0.6,
            warnings: event.confidence < 0.6 ? ["low_confidence_observation"] : []
          })]
        : []
    )
  ) ?? [];
};

const buildStepDependencies = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingStepDependencyEdgeV1[] => [
  ...buildOrderedStepDependencies(record),
  ...buildExplicitStepDependencies(record),
  ...buildOutputConsumptionStepDependencies(record, entityByOriginalId),
  ...buildArtifactStepDependencies(record, entityByOriginalId),
  ...buildObservationStepDependencies(record)
];

const findEvidenceRelationsForResult = (
  result: ExportedResultV1,
  record: ChemdTrainingExportV2
): ExportedRelationV1[] => {
  const reactionId = findLinkedReactionId(result, record.semantic_layer.links);

  return record.semantic_layer.links.filter((relation) =>
    (relation.relation_type === "analysis_targets_result" && relation.to_entity_id === result.entity_id)
    || (relation.relation_type === "sample_related_to_result" && relation.to_entity_id === result.entity_id)
    || (relation.relation_type === "artifact_supports_result" && relation.to_entity_id === result.entity_id)
    || Boolean(reactionId && relation.to_entity_id === reactionId && (
      relation.relation_type === "analysis_targets_reaction"
      || relation.relation_type === "sample_derived_from_reaction"
      || relation.relation_type === "artifact_supports_reaction"
    ))
  );
};

const getEvidenceAnalyses = (
  record: ChemdTrainingExportV2,
  relations: ExportedRelationV1[]
): ExportedAnalysisV1[] => {
  const analysisIds = new Set(relations.map((relation) => relation.from_entity_id));

  return record.semantic_layer.analyses.filter((analysis) => analysisIds.has(analysis.entity_id));
};

const containsAny = (value: string | undefined, patterns: RegExp[]): boolean =>
  Boolean(value && patterns.some((pattern) => pattern.test(value)));

const inferYieldBasis = (
  result: ExportedResultV1,
  analyses: ExportedAnalysisV1[]
): TrainingOutcomeQualityV1["yield_basis"] => {
  const text = compactText(
    result.yield_raw,
    result.notes,
    ...analyses.map((analysis) => compactText(analysis.analysis_type, analysis.method, analysis.result_raw))
  );

  if (result.yield_percent == null) {
    return "not_reported";
  }

  if (result.isolated_mass || containsAny(text, [/isolated/i])) {
    return "isolated";
  }

  if (containsAny(text, [/\bnmr\b/i])) {
    return "nmr";
  }

  if (containsAny(text, [/\blc[-\s]?ms\b/i, /\blcms\b/i])) {
    return "lcms";
  }

  return containsAny(text, [/crude/i]) ? "crude" : "unknown";
};

const getResultsForReaction = (
  record: ChemdTrainingExportV2,
  reactionEntityId: string
): ExportedResultV1[] =>
  record.semantic_layer.results.filter((result) =>
    findLinkedReactionId(result, record.semantic_layer.links) === reactionEntityId
  );

const hasConflictingOutcomeValue = (
  record: ChemdTrainingExportV2,
  reactionEntityId: string | undefined,
  field: "yield_percent" | "conversion_percent" | "selectivity_percent" | "purity_percent"
): boolean => {
  if (!reactionEntityId) {
    return false;
  }

  const values = uniqueStrings(
    getResultsForReaction(record, reactionEntityId).flatMap((result) => {
      const value = result[field];
      return typeof value === "number" ? [String(value)] : [];
    })
  );

  return values.length > 1;
};

const inferYieldConfidence = (
  basis: TrainingOutcomeQualityV1["yield_basis"],
  hasConflict: boolean
): TrainingOutcomeQualityV1["yield_confidence"] => {
  if (basis === "not_reported") {
    return "unknown";
  }

  if (hasConflict) {
    return "estimated";
  }

  return basis === "isolated" || basis === "nmr" || basis === "lcms"
    ? "confirmed"
    : "estimated";
};

const buildOutcomeWarnings = (
  result: ExportedResultV1,
  basis: TrainingOutcomeQualityV1["yield_basis"],
  hasConflict: boolean
): string[] => [
  ...(result.yield_percent == null ? ["missing_yield_percent"] : []),
  ...(hasConflict ? ["conflicting_result_values"] : []),
  ...(basis === "unknown" ? ["unknown_yield_basis"] : []),
  ...(basis === "crude" ? ["crude_yield_basis"] : [])
];

const buildOutcomeQuality = (record: ChemdTrainingExportV2): TrainingOutcomeQualityV1[] =>
  record.semantic_layer.results.map((result) => {
    const reactionId = findLinkedReactionId(result, record.semantic_layer.links);
    const evidenceRelations = findEvidenceRelationsForResult(result, record);
    const analyses = getEvidenceAnalyses(record, evidenceRelations);
    const hasConflict = hasConflictingOutcomeValue(record, reactionId, "yield_percent");
    const basis = inferYieldBasis(result, analyses);
    const confirmedByAnalysis = analyses.length > 0;

    return {
      result_entity_id: result.entity_id,
      ...(reactionId ? { reaction_entity_id: reactionId } : {}),
      yield_confidence: inferYieldConfidence(basis, hasConflict),
      yield_basis: basis,
      result_confirmed_by_analysis: confirmedByAnalysis,
      has_conflicting_values: hasConflict,
      target_usable_for_regression: typeof result.yield_percent === "number" && !hasConflict,
      evidence_entity_ids: uniqueStrings([
        result.entity_id,
        ...evidenceRelations.map((relation) => relation.from_entity_id)
      ]),
      warnings: buildOutcomeWarnings(result, basis, hasConflict)
    };
  });

const createFieldEvidence = (input: FieldEvidenceInput): TrainingFieldEvidenceV1[] => {
  if (input.value === undefined || input.value === null) {
    return [];
  }

  const rawValueNodeId = input.rawValue ? getRawValueNodeId(input.subjectEntityId, input.field) : undefined;

  return [{
    subject_entity_id: input.subjectEntityId,
    field: input.field,
    value: input.value,
    ...(input.rawValue ? { raw_value: input.rawValue } : {}),
    value_node_id: getValueNodeId(input.subjectEntityId, input.field),
    ...(rawValueNodeId ? { raw_value_node_id: rawValueNodeId } : {}),
    ...(input.normalized ? { normalized: true } : {}),
    evidence_entity_ids: uniqueStrings([input.subjectEntityId, ...(input.evidenceEntityIds ?? [])]),
    source_relation_ids: uniqueStrings(input.sourceRelationIds ?? []),
    ...(input.sourceSpan ? { source_span: input.sourceSpan } : {})
  }];
};

const getFieldSourceSpan = (
  entity: { field_source_spans?: Record<string, TrainingFieldEvidenceV1["source_span"]> },
  field: string
): TrainingFieldEvidenceV1["source_span"] => entity.field_source_spans?.[field];

const buildMoleculeFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.molecules.flatMap((molecule) => [
    ...createFieldEvidence({
      subjectEntityId: molecule.entity_id,
      field: "smiles",
      value: molecule.smiles,
      sourceSpan: getFieldSourceSpan(molecule, "smiles")
    }),
    ...createFieldEvidence({
      subjectEntityId: molecule.entity_id,
      field: "cas",
      value: molecule.cas,
      sourceSpan: getFieldSourceSpan(molecule, "cas")
    }),
    ...createFieldEvidence({
      subjectEntityId: molecule.entity_id,
      field: "formula",
      value: molecule.formula,
      sourceSpan: getFieldSourceSpan(molecule, "formula")
    }),
    ...createFieldEvidence({
      subjectEntityId: molecule.entity_id,
      field: "amount_value",
      value: formatNumericWithUnit(molecule.amount_value),
      rawValue: molecule.amount_raw,
      normalized: Boolean(molecule.amount_value),
      sourceSpan: getFieldSourceSpan(molecule, "amount")
    }),
    ...createFieldEvidence({
      subjectEntityId: molecule.entity_id,
      field: "equivalents_value",
      value: molecule.equivalents_value,
      rawValue: molecule.equivalents_raw,
      normalized: typeof molecule.equivalents_value === "number",
      sourceSpan: getFieldSourceSpan(molecule, "equivalents")
    })
  ]);

const buildReactionFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.reactions.flatMap((reaction) => [
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "solvent",
      value: reaction.normalized_conditions.solvent?.normalized,
      rawValue: reaction.solvent_raw,
      normalized: Boolean(reaction.normalized_conditions.solvent),
      sourceSpan: getFieldSourceSpan(reaction, "solvent")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "catalyst",
      value: reaction.normalized_conditions.catalyst?.normalized,
      rawValue: reaction.catalyst_raw,
      normalized: Boolean(reaction.normalized_conditions.catalyst),
      sourceSpan: getFieldSourceSpan(reaction, "catalyst")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "reagents",
      value: reaction.normalized_conditions.reagents?.normalized.join(", "),
      rawValue: reaction.reagents_raw,
      normalized: Boolean(reaction.normalized_conditions.reagents),
      sourceSpan: getFieldSourceSpan(reaction, "reagents")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "temperature",
      value: formatNumericWithUnit(reaction.normalized_conditions.temperature),
      rawValue: reaction.temperature_raw,
      normalized: Boolean(reaction.normalized_conditions.temperature),
      sourceSpan: getFieldSourceSpan(reaction, "temperature")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "time",
      value: formatNumericWithUnit(reaction.normalized_conditions.time),
      rawValue: reaction.time_raw,
      normalized: Boolean(reaction.normalized_conditions.time),
      sourceSpan: getFieldSourceSpan(reaction, "time")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "pressure",
      value: formatNumericWithUnit(reaction.normalized_conditions.pressure),
      rawValue: reaction.pressure_raw,
      normalized: Boolean(reaction.normalized_conditions.pressure),
      sourceSpan: getFieldSourceSpan(reaction, "pressure")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "atmosphere",
      value: reaction.normalized_conditions.atmosphere?.normalized,
      rawValue: reaction.atmosphere_raw,
      normalized: Boolean(reaction.normalized_conditions.atmosphere),
      sourceSpan: getFieldSourceSpan(reaction, "atmosphere")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "yield_percent",
      value: reaction.normalized_outcome_hints.yield_percent,
      rawValue: reaction.yield_raw,
      normalized: typeof reaction.normalized_outcome_hints.yield_percent === "number",
      sourceSpan: getFieldSourceSpan(reaction, "yield")
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "conversion_percent",
      value: reaction.normalized_outcome_hints.conversion_percent,
      rawValue: reaction.conversion_raw,
      normalized: typeof reaction.normalized_outcome_hints.conversion_percent === "number"
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "selectivity_percent",
      value: reaction.normalized_outcome_hints.selectivity_percent,
      rawValue: reaction.selectivity_raw,
      normalized: typeof reaction.normalized_outcome_hints.selectivity_percent === "number"
    })
  ]);

const buildResultFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.results.flatMap((result) => {
    const evidenceRelations = findEvidenceRelationsForResult(result, record);
    const evidenceEntityIds = evidenceRelations.map((relation) => relation.from_entity_id);
    const sourceRelationIds = evidenceRelations.map((relation) => relation.relation_id);

    return [
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "status_label",
        value: result.status_label,
        rawValue: result.status_raw,
        normalized: Boolean(result.status_label),
        evidenceEntityIds,
        sourceRelationIds,
        sourceSpan: getFieldSourceSpan(result, "status")
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "yield_percent",
        value: result.yield_percent,
        rawValue: result.yield_raw,
        normalized: typeof result.yield_percent === "number",
        evidenceEntityIds,
        sourceRelationIds,
        sourceSpan: getFieldSourceSpan(result, "yield")
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "conversion_percent",
        value: result.conversion_percent,
        rawValue: result.conversion_raw,
        normalized: typeof result.conversion_percent === "number",
        evidenceEntityIds,
        sourceRelationIds,
        sourceSpan: getFieldSourceSpan(result, "conversion")
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "selectivity_percent",
        value: result.selectivity_percent,
        rawValue: result.selectivity_raw,
        normalized: typeof result.selectivity_percent === "number",
        evidenceEntityIds,
        sourceRelationIds,
        sourceSpan: getFieldSourceSpan(result, "selectivity")
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "purity_percent",
        value: result.purity_percent,
        rawValue: result.purity_raw,
        normalized: typeof result.purity_percent === "number",
        evidenceEntityIds,
        sourceRelationIds,
        sourceSpan: getFieldSourceSpan(result, "purity")
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "isolated_mass",
        value: formatNumericWithUnit(result.isolated_mass),
        rawValue: result.isolated_mass_raw,
        normalized: Boolean(result.isolated_mass),
        evidenceEntityIds,
        sourceRelationIds,
        sourceSpan: getFieldSourceSpan(result, "isolated_mass")
      })
    ];
  });

const buildAnalysisFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.analyses.flatMap((analysis) => [
    ...createFieldEvidence({
      subjectEntityId: analysis.entity_id,
      field: "analysis_type",
      value: analysis.analysis_type,
      sourceSpan: getFieldSourceSpan(analysis, "type")
    }),
    ...createFieldEvidence({
      subjectEntityId: analysis.entity_id,
      field: "method",
      value: analysis.method,
      sourceSpan: getFieldSourceSpan(analysis, "method")
    }),
    ...createFieldEvidence({
      subjectEntityId: analysis.entity_id,
      field: "data",
      value: analysis.data_raw,
      sourceSpan: getFieldSourceSpan(analysis, "data")
    }),
    ...createFieldEvidence({
      subjectEntityId: analysis.entity_id,
      field: "result",
      value: analysis.result_raw,
      sourceSpan: getFieldSourceSpan(analysis, "result")
    })
  ]);

const buildSampleFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.samples.flatMap((sample) => [
    ...createFieldEvidence({
      subjectEntityId: sample.entity_id,
      field: "sample_code",
      value: sample.sample_code,
      sourceSpan: getFieldSourceSpan(sample, "sample_id")
    }),
    ...createFieldEvidence({
      subjectEntityId: sample.entity_id,
      field: "batch",
      value: sample.batch,
      sourceSpan: getFieldSourceSpan(sample, "batch")
    }),
    ...createFieldEvidence({
      subjectEntityId: sample.entity_id,
      field: "purity_percent",
      value: sample.purity_percent,
      rawValue: sample.purity_raw,
      normalized: typeof sample.purity_percent === "number",
      sourceSpan: getFieldSourceSpan(sample, "purity")
    })
  ]);

const buildArtifactFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.artifacts.flatMap((artifact) => [
    ...createFieldEvidence({
      subjectEntityId: artifact.entity_id,
      field: "artifact_kind",
      value: artifact.artifact_kind,
      sourceSpan: getFieldSourceSpan(artifact, "kind")
    }),
    ...createFieldEvidence({
      subjectEntityId: artifact.entity_id,
      field: "path",
      value: artifact.path,
      sourceSpan: getFieldSourceSpan(artifact, "path")
    }),
    ...createFieldEvidence({
      subjectEntityId: artifact.entity_id,
      field: "checksum",
      value: artifact.checksum,
      sourceSpan: getFieldSourceSpan(artifact, "checksum")
    }),
    ...createFieldEvidence({
      subjectEntityId: artifact.entity_id,
      field: "instrument",
      value: artifact.instrument,
      sourceSpan: getFieldSourceSpan(artifact, "instrument")
    }),
    ...createFieldEvidence({
      subjectEntityId: artifact.entity_id,
      field: "notes",
      value: artifact.notes,
      sourceSpan: getFieldSourceSpan(artifact, "notes")
    })
  ]);

const buildConditionVariationFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  [
    ...record.semantic_layer.condition_variations.flatMap((variation) => [
      ...(variation.condition ?? []).flatMap((condition) =>
        createFieldEvidence({
          subjectEntityId: variation.entity_id,
          field: `condition_${condition.field}`,
          value: condition.baseline_raw ?? condition.raw,
          rawValue: condition.raw,
          sourceSpan: getFieldSourceSpan(variation, "condition")
        })
      ),
      ...variation.changes.flatMap((change) => [
        ...createFieldEvidence({
          subjectEntityId: variation.entity_id,
          field: `baseline_${change.field}`,
          value: change.baseline_raw,
          rawValue: change.raw,
          sourceSpan: getFieldSourceSpan(variation, change.field)
        }),
        ...createFieldEvidence({
          subjectEntityId: variation.entity_id,
          field: `candidate_${change.field}`,
          value: change.candidate_raw ?? change.raw,
          rawValue: change.raw,
          sourceSpan: getFieldSourceSpan(variation, change.field)
        })
      ])
    ]),
    ...record.semantic_layer.condition_variation_attempts.flatMap((attempt) => [
      ...attempt.condition.flatMap((condition) =>
        createFieldEvidence({
          subjectEntityId: attempt.entity_id,
          field: `condition_${condition.field}`,
          value: condition.candidate_raw ?? condition.raw,
          rawValue: condition.raw,
          evidenceEntityIds: [attempt.parent_condition_variation_id, attempt.entity_id],
          sourceSpan: getFieldSourceSpan(attempt, attempt.attempt_id)
        })
      ),
      ...attempt.changes.flatMap((change) => [
      ...createFieldEvidence({
        subjectEntityId: attempt.entity_id,
        field: `baseline_${change.field}`,
        value: change.baseline_raw,
        rawValue: change.raw,
        evidenceEntityIds: [attempt.parent_condition_variation_id, attempt.entity_id],
        sourceSpan: getFieldSourceSpan(attempt, attempt.attempt_id)
      }),
      ...createFieldEvidence({
        subjectEntityId: attempt.entity_id,
        field: `candidate_${change.field}`,
        value: change.candidate_raw ?? change.raw,
        rawValue: change.raw,
        evidenceEntityIds: [attempt.parent_condition_variation_id, attempt.entity_id],
        sourceSpan: getFieldSourceSpan(attempt, attempt.attempt_id)
      })
      ]),
      ...createFieldEvidence({
        subjectEntityId: attempt.entity_id,
        field: "note",
        value: attempt.note,
        evidenceEntityIds: [attempt.parent_condition_variation_id, attempt.entity_id],
        sourceSpan: getFieldSourceSpan(attempt, `note${attempt.attempt_id.replace(/^var/, "")}`)
      })
    ])
  ];

const buildFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] => [
  ...buildMoleculeFieldEvidence(record),
  ...buildReactionFieldEvidence(record),
  ...buildResultFieldEvidence(record),
  ...buildAnalysisFieldEvidence(record),
  ...buildSampleFieldEvidence(record),
  ...buildArtifactFieldEvidence(record),
  ...buildConditionVariationFieldEvidence(record)
];

const hasExternalEvidence = (item: TrainingFieldEvidenceV1): boolean =>
  item.evidence_entity_ids.some((entityId) => entityId !== item.subject_entity_id);

const countExternalEvidenceReferences = (fieldEvidence: TrainingFieldEvidenceV1[]): number =>
  fieldEvidence.flatMap((item) =>
    item.evidence_entity_ids.filter((entityId) => entityId !== item.subject_entity_id)
  ).length;

const hasOutcomeHint = (reaction: ExportedReactionV1): boolean =>
  Object.values(reaction.normalized_outcome_hints).some((value) => typeof value === "number");

const buildMissingPrimaryLogic = (
  primaryEntities: TrainingPrimaryEntityV1[]
): TrainingMissingLogicV1[] =>
  primaryEntities.flatMap((entity) =>
    entity.entity_id
      ? []
      : [{
          code: "primary_entity_unresolved",
          severity: "warning",
          message: `Primary ${entity.role} ${entity.original_id} does not resolve to an exported entity.`
        }]
  );

const buildMissingReactionLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] =>
  record.semantic_layer.reactions.flatMap((reaction) =>
    record.semantic_layer.links.some((link) =>
      link.relation_type === "result_describes_reaction" && link.to_entity_id === reaction.entity_id
    ) || hasOutcomeHint(reaction)
      ? []
      : [{
          code: "reaction_without_outcome" as const,
          severity: "info" as const,
          message: "Reaction has no linked result or normalized outcome hint.",
          entity_id: reaction.entity_id
        }]
  );

const buildMissingResultLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] =>
  record.semantic_layer.results.flatMap((result) =>
    findLinkedReactionId(result, record.semantic_layer.links)
      ? []
      : [{
          code: "result_without_reaction_link" as const,
          severity: "warning" as const,
          message: "Result does not link to a reaction.",
          entity_id: result.entity_id,
          field: "ref"
        }]
  );

const buildMissingAnalysisLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] =>
  record.semantic_layer.analyses.flatMap((analysis) =>
    findRelation(record, analysis.entity_id, EVIDENCE_RELATIONS)
      ? []
      : [{
          code: "analysis_without_target" as const,
          severity: "info" as const,
          message: "Analysis has no target relation.",
          entity_id: analysis.entity_id,
          field: "ref"
        }]
  );

const buildMissingSampleLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] =>
  record.semantic_layer.samples.flatMap((sample) =>
    findRelation(record, sample.entity_id, SAMPLE_LINEAGE_RELATIONS)
      ? []
      : [{
          code: "sample_without_lineage" as const,
          severity: "info" as const,
          message: "Sample has no lineage relation.",
          entity_id: sample.entity_id,
          field: "ref"
        }]
  );

const buildMissingArtifactLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] =>
  record.semantic_layer.artifacts.flatMap((artifact) =>
    findRelation(record, artifact.entity_id, ARTIFACT_EVIDENCE_RELATIONS)
      ? []
      : [{
          code: "artifact_without_target" as const,
          severity: "info" as const,
          message: "Artifact has no target relation.",
          entity_id: artifact.entity_id,
          field: "ref"
      }]
  );

const buildMissingRouteLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] =>
  record.source_layer.diagnostics.flatMap<TrainingMissingLogicV1>((diagnostic) => {
    const reaction = diagnostic.node_id
      ? record.semantic_layer.reactions.find((item) => item.original_id === diagnostic.node_id)
      : undefined;

    if (diagnostic.code === "E_REACTION_ROUTE_CYCLE") {
      return [{
        code: "reaction_route_cycle" as const,
        severity: diagnostic.severity,
        message: diagnostic.message,
        ...(reaction ? { entity_id: reaction.entity_id } : {}),
        field: "prev"
      }];
    }

    if (diagnostic.code === "W_REACTION_ROUTE_ORPHAN") {
      return [{
        code: "reaction_route_orphan" as const,
        severity: diagnostic.severity,
        message: diagnostic.message,
        ...(reaction ? { entity_id: reaction.entity_id } : {}),
        field: "route"
      }];
    }

    return [];
  });

const buildMissingProcedureLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] => [
  ...(record.learning_layer.procedure_to_steps?.flatMap((pair) =>
    pair.steps.length > 0
      ? []
      : [{
          code: "procedure_without_steps" as const,
          severity: "warning" as const,
          message: "Procedure did not lower to any canonical steps.",
          entity_id: pair.procedure_id ?? pair.pair_id
        }]
  ) ?? []),
  ...(record.semantic_layer.reactions.length > 1 && record.learning_layer.procedure_to_steps?.length
    ? [{
        code: "procedure_without_reaction_link" as const,
        severity: "info" as const,
        message: "Procedure logic is available but no explicit procedure-to-reaction link exists."
      }]
    : [])
];

const buildMissingObservationPairLogic = (pair: ObservationPair): TrainingMissingLogicV1[] =>
  pair.events.length > 0
    ? pair.events.flatMap((event): TrainingMissingLogicV1[] =>
        event.linkedStepId || event.linkedStepFamily
          ? []
          : [{
              code: "observation_without_target",
              severity: "info",
              message: "Observation event has no linked step target.",
              entity_id: pair.observation_id ?? pair.pair_id
            }]
      )
    : [{
        code: "observation_without_event",
        severity: "warning",
        message: "Observation did not lower to any events.",
        entity_id: pair.observation_id ?? pair.pair_id
      }];

const buildMissingObservationLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] =>
  record.learning_layer.observation_to_events?.flatMap(buildMissingObservationPairLogic) ?? [];

const buildConflictingResultLogic = (record: ChemdTrainingExportV2): TrainingMissingLogicV1[] => {
  const byReaction = new Map<string, ExportedResultV1[]>();
  record.semantic_layer.results.forEach((result) => {
    const reactionId = findLinkedReactionId(result, record.semantic_layer.links);
    if (reactionId) {
      byReaction.set(reactionId, [...(byReaction.get(reactionId) ?? []), result]);
    }
  });

  return Array.from(byReaction.entries()).flatMap(([reactionId, results]) =>
    ["yield_percent", "conversion_percent", "selectivity_percent", "purity_percent"].flatMap((field) => {
      const values = uniqueStrings(results.flatMap((result) => {
        const value = result[field as keyof ExportedResultV1];
        return typeof value === "number" ? [String(value)] : [];
      }));

      return values.length > 1
        ? [{
            code: "conflicting_result_values" as const,
            severity: "warning" as const,
            message: `Linked results for ${reactionId} disagree on ${field}.`,
            entity_id: reactionId,
            field
          }]
        : [];
    })
  );
};

const buildUnresolvedReferenceLogic = (
  resolvedReferences: TrainingResolvedReferenceV1[]
): TrainingMissingLogicV1[] =>
  resolvedReferences.flatMap((reference) =>
    reference.resolution_status === "unresolved"
      ? [{
          code: "unresolved_reference" as const,
          severity: "warning" as const,
          message: `Reference ${reference.raw} could not be resolved.`,
          entity_id: reference.source_entity_id,
          field: reference.source_field
        }]
      : []
  );

const buildMissingLogic = (
  record: ChemdTrainingExportV2,
  resolvedReferences: TrainingResolvedReferenceV1[],
  primaryEntities: TrainingPrimaryEntityV1[]
): TrainingMissingLogicV1[] => [
  ...(record.semantic_layer.reactions.length === 0
    ? [{ code: "no_reactions" as const, severity: "warning" as const, message: "No reaction entities were exported." }]
    : []),
  ...(record.semantic_layer.results.length === 0
    ? [{ code: "no_results" as const, severity: "warning" as const, message: "No result entities were exported." }]
    : []),
  ...buildMissingPrimaryLogic(primaryEntities),
  ...buildMissingReactionLogic(record),
  ...buildMissingResultLogic(record),
  ...buildMissingAnalysisLogic(record),
  ...buildMissingSampleLogic(record),
  ...buildMissingArtifactLogic(record),
  ...buildMissingRouteLogic(record),
  ...buildMissingProcedureLogic(record),
  ...buildMissingObservationLogic(record),
  ...buildConflictingResultLogic(record),
  ...buildUnresolvedReferenceLogic(resolvedReferences)
];

const buildCanonicalSummary = (
  record: ChemdTrainingExportV2,
  fieldEvidence: TrainingFieldEvidenceV1[]
): TrainingCanonicalSummaryV1 | undefined => {
  const firstReaction = record.semantic_layer.reactions[0];
  const primaryResult = record.semantic_layer.results.find((result) => result.is_primary) ?? record.semantic_layer.results[0];
  const procedureCount = record.learning_layer.procedure_to_steps?.flatMap((pair) => pair.steps).length ?? 0;
  const evidenceCount = countExternalEvidenceReferences(fieldEvidence);
  const conditionCount = record.semantic_layer.condition_variations.length;
  const text = compactText(
    `Document ${record.document.title} (${record.document.date}).`,
    firstReaction ? `Main reaction candidate ${firstReaction.entity_id}.` : undefined,
    primaryResult ? `Main result candidate ${primaryResult.entity_id}.` : undefined,
    conditionCount > 0 ? `${conditionCount} explicit condition variation blocks are available.` : undefined,
    fieldEvidence.length > 0 ? `${fieldEvidence.length} training-relevant fields are represented as value nodes.` : undefined,
    evidenceCount > 0 ? `${evidenceCount} external evidence references support field values.` : undefined,
    procedureCount > 0 ? `${procedureCount} procedure steps are available.` : undefined
  );

  return text
    ? {
        text,
        source_entity_ids: uniqueStrings([
          ...(firstReaction ? [firstReaction.entity_id] : []),
          ...(primaryResult ? [primaryResult.entity_id] : []),
          ...fieldEvidence.flatMap((item) => [item.subject_entity_id, ...item.evidence_entity_ids])
        ])
      }
    : undefined;
};

const buildReactionRoutes = (record: ChemdTrainingExportV2): TrainingReactionRouteStepV1[] =>
  record.semantic_layer.reactions.map((reaction) => {
    const prevReactionIds = record.semantic_layer.links
      .filter((relation) =>
        relation.relation_type === "reaction_depends_on_reaction"
        && relation.from_entity_id === reaction.entity_id
      )
      .map((relation) => relation.to_entity_id);
    const nextReactionIds = record.semantic_layer.links
      .filter((relation) =>
        relation.relation_type === "reaction_precedes_reaction"
        && relation.from_entity_id === reaction.entity_id
      )
      .map((relation) => relation.to_entity_id);
    const routeDiagnostics = record.source_layer.diagnostics
      .filter((diagnostic) => diagnostic.node_id === reaction.original_id)
      .map((diagnostic) => diagnostic.code);

    return {
      route_id: reaction.route_raw ?? `route::${record.document.document_id}::${reaction.entity_id}`,
      reaction_entity_id: reaction.entity_id,
      prev_reaction_entity_ids: uniqueStrings(prevReactionIds),
      next_reaction_entity_ids: uniqueStrings(nextReactionIds),
      step_role: prevReactionIds.length === 0
        ? nextReactionIds.length === 0 ? "isolated" : "root"
        : nextReactionIds.length === 0 ? "leaf" : "intermediate",
      warnings: uniqueStrings(routeDiagnostics)
    };
  });

const createTaskHint = (
  taskType: LoraTaskTypeV1,
  reason: string,
  sourceEntityIds: string[] = []
): LoraTaskHintV1 => ({
  task_type: taskType,
  reason,
  ...(sourceEntityIds.length > 0 ? { source_entity_ids: uniqueStrings(sourceEntityIds) } : {})
});

const includeTask = (condition: boolean, hint: LoraTaskHintV1): LoraTaskHintV1[] =>
  condition ? [hint] : [];

const buildRecommendedLoraTasks = (
  context: LoraHintContext,
  entityIds: string[]
): LoraTaskHintV1[] => {
  const { record, fieldEvidence, missingLogic, resolvedReferences } = context;
  const hasProcedureLogic = Boolean(record.learning_layer.procedure_to_steps?.length);
  const hasReactions = record.semantic_layer.reactions.length > 0;
  const hasSemanticRelations = record.semantic_layer.links.length > 0;
  const hasEvidenceLinks = fieldEvidence.some(hasExternalEvidence);
  const hasObservationLogic = Boolean(record.learning_layer.observation_to_events?.length);
  const hasSummaryBasis = record.semantic_layer.reactions.length + record.semantic_layer.results.length > 0;
  const hasDecisionBasis = record.semantic_layer.reactions.length > 0 && record.semantic_layer.results.length > 0;
  const hasYieldPrediction = record.learning_layer.prediction_instances.some((instance) =>
    instance.usability.usable_for_yield_regression
  );
  const hasFailedOutcome = record.semantic_layer.results.some((result) => result.status_label === "failed");
  const hasExperimentComparison = record.semantic_layer.reactions.length > 1;
  const hasConditionVariations = record.semantic_layer.condition_variations.length > 0;
  const hasProposalBasis = hasProcedureLogic && hasDecisionBasis;
  const hasNormalizationEvidence = fieldEvidence.some((item) => item.normalized);
  const hasIntentBasis = hasDecisionBasis || hasProcedureLogic || hasEvidenceLinks || hasConditionVariations;
  const hasMaterialFlowBasis = hasSemanticRelations || hasProcedureLogic;
  const hasEvidenceInterpretation = hasEvidenceLinks;
  const qualityIssueCount = missingLogic.length + (record.quality_layer.training_quality.exclusion_reasons?.length ?? 0);

  return [
    ...includeTask(record.source_layer.raw_children.length > 0, createTaskHint("record_to_chemd", "Source snapshots can be reconstructed as Chemd blocks.")),
    ...includeTask(qualityIssueCount > 0, createTaskHint("chemd_repair", "Quality warnings or missing logic can be turned into repair examples.")),
    ...includeTask(hasNormalizationEvidence, createTaskHint("normalization_explanation", "Normalized field evidence is available.")),
    ...(entityIds.length > 0 ? [createTaskHint("entity_extraction", "Experiment entities are available.", entityIds)] : []),
    ...includeTask(hasSummaryBasis, createTaskHint("experiment_summary", "Reaction or result entities are available.", entityIds)),
    ...includeTask(hasReactions, createTaskHint("reaction_classification", "Reaction entities can receive taxonomy labels.")),
    ...includeTask(hasReactions, createTaskHint("expert_routing", "Reaction entities can receive expert routing labels.")),
    ...includeTask(hasSemanticRelations, createTaskHint("relation_extraction", "Semantic relations are available.", entityIds)),
    ...includeTask(resolvedReferences.length > 0, createTaskHint("reference_resolution", "Resolved or unresolved references are available.")),
    ...includeTask(hasEvidenceLinks, createTaskHint("evidence_tracing", "External field-level evidence is available.")),
    ...includeTask(hasEvidenceInterpretation, createTaskHint("evidence_interpretation", "Evidence entities can be interpreted into support or contradiction claims.")),
    ...includeTask(hasProcedureLogic, createTaskHint("procedure_reasoning", "Procedure-to-step pairs are available.")),
    ...includeTask(hasObservationLogic, createTaskHint("observation_events", "Observation-to-event pairs are available.")),
    ...includeTask(hasYieldPrediction, createTaskHint("yield_prediction", "Usable yield targets are available.")),
    ...includeTask(
      hasDecisionBasis || hasConditionVariations,
      createTaskHint("condition_recommendation", "Reaction conditions or explicit condition variations are available.")
    ),
    ...includeTask(hasProposalBasis, createTaskHint("experiment_proposal", "Procedure and outcome context are available.")),
    ...includeTask(hasIntentBasis, createTaskHint("experiment_intent", "Experiment intent and causal logic can be inferred from structured facts.")),
    ...includeTask(hasMaterialFlowBasis, createTaskHint("material_flow_reasoning", "Material flow and step dependencies can be inferred from structured links.")),
    ...includeTask(hasFailedOutcome, createTaskHint("failure_analysis", "Failed result labels are available.")),
    ...includeTask(
      hasExperimentComparison || hasConditionVariations,
      createTaskHint("experiment_comparison", "Reaction variants or condition variation blocks can be compared.")
    ),
    ...includeTask(qualityIssueCount > 0, createTaskHint("consistency_check", "Quality warnings or missing logic are available.")),
    ...(entityIds.length > 0 ? [createTaskHint("qa_with_context", "Structured experiment context is available.", entityIds)] : [])
  ];
};

const buildBlockedLoraTasks = (context: LoraHintContext): LoraTaskHintV1[] => {
  const { record, fieldEvidence, resolvedReferences } = context;
  const hasProcedureLogic = Boolean(record.learning_layer.procedure_to_steps?.length);
  const hasObservationLogic = Boolean(record.learning_layer.observation_to_events?.length);
  const hasReactions = record.semantic_layer.reactions.length > 0;
  const hasSemanticRelations = record.semantic_layer.links.length > 0;
  const hasEvidenceLinks = fieldEvidence.some(hasExternalEvidence);
  const hasConditionVariations = record.semantic_layer.condition_variations.length > 0;
  const hasNormalizationEvidence = fieldEvidence.some((item) => item.normalized);
  const hasYieldPrediction = record.learning_layer.prediction_instances.some((instance) =>
    instance.usability.usable_for_yield_regression
  );
  const hasIntentBasis = (hasReactions && record.semantic_layer.results.length > 0)
    || hasProcedureLogic
    || hasEvidenceLinks
    || hasConditionVariations;
  const hasMaterialFlowBasis = hasSemanticRelations || hasProcedureLogic;
  const hasEvidenceInterpretation = hasEvidenceLinks;

  return [
    ...includeTask(record.source_layer.raw_children.length === 0, createTaskHint("record_to_chemd", "No source snapshots are available.")),
    ...includeTask(!hasNormalizationEvidence, createTaskHint("normalization_explanation", "No normalized field evidence is available.")),
    ...includeTask(!hasReactions, createTaskHint("reaction_classification", "No reaction entities are available.")),
    ...includeTask(!hasReactions, createTaskHint("expert_routing", "No reaction entities are available.")),
    ...includeTask(!hasSemanticRelations, createTaskHint("relation_extraction", "No semantic relations are available.")),
    ...includeTask(resolvedReferences.length === 0, createTaskHint("reference_resolution", "No references are available.")),
    ...includeTask(!hasEvidenceLinks, createTaskHint("evidence_tracing", "No external field-level evidence is available.")),
    ...includeTask(!hasEvidenceInterpretation, createTaskHint("evidence_interpretation", "No evidence entities are available for interpretation.")),
    ...includeTask(!hasProcedureLogic, createTaskHint("procedure_reasoning", "No procedure logic is available.")),
    ...includeTask(!hasObservationLogic, createTaskHint("observation_events", "No observation event logic is available.")),
    ...includeTask(!hasYieldPrediction, createTaskHint("yield_prediction", "No usable yield target is available.")),
    ...includeTask(
      !hasConditionVariations && (record.semantic_layer.reactions.length === 0 || record.semantic_layer.results.length === 0),
      createTaskHint("condition_recommendation", "No reaction/result pair is available.")
    ),
    ...includeTask(!hasProcedureLogic, createTaskHint("experiment_proposal", "No procedure logic is available.")),
    ...includeTask(!hasIntentBasis, createTaskHint("experiment_intent", "No reaction/result, procedure, or evidence basis is available.")),
    ...includeTask(!hasMaterialFlowBasis, createTaskHint("material_flow_reasoning", "No semantic relation or procedure logic is available.")),
    ...includeTask(!record.semantic_layer.results.some((result) => result.status_label === "failed"), createTaskHint("failure_analysis", "No failed result label is available.")),
    ...includeTask(
      !hasConditionVariations && record.semantic_layer.reactions.length < 2,
      createTaskHint("experiment_comparison", "Fewer than two reactions are available.")
    )
  ];
};

const buildLoraGenerationHints = (context: LoraHintContext): TrainingLoraGenerationHintsV1 => {
  const entityIds = context.graphNodes
    .filter((node) => node.node_type !== "document")
    .map((node) => node.node_id);

  return {
    recommended_tasks: buildRecommendedLoraTasks(context, entityIds),
    blocked_tasks: buildBlockedLoraTasks(context),
    split_hint: {
      document_id: context.record.document.document_id,
      date: context.record.document.date
    }
  };
};

const buildTrainingWarnings = (
  record: ChemdTrainingExportV2,
  resolvedReferences: TrainingResolvedReferenceV1[],
  missingLogic: TrainingMissingLogicV1[]
): string[] => [
  ...resolvedReferences
    .filter((reference) => reference.resolution_status === "unresolved")
    .map((reference) => `unresolved_reference:${reference.raw}`),
  ...missingLogic.map((item) => item.code),
  ...record.learning_layer.prediction_instances.flatMap((instance) => instance.usability.warnings)
];

const isTrainingProjectionBlocked = (record: ChemdTrainingExportV2): boolean =>
  record.quality_layer.governance_quality.blocking;

const getTrainingExclusionReasons = (record: ChemdTrainingExportV2): string[] =>
  record.quality_layer.training_quality.exclusion_reasons ?? [];

const buildBlockedTrainingUnderstanding = (
  record: ChemdTrainingExportV2
): ChemdTrainingUnderstandingV1 => {
  const exclusionReasons = getTrainingExclusionReasons(record);
  const governanceWarnings = record.quality_layer.governance_quality.diagnostics
    .map((diagnostic) => diagnostic.code);

  return {
    schema_version: "chemd-training-understanding/v0.1",
    document: record.document,
    governance: record.governance,
    entities: {
      molecules: [],
      materials: [],
      reactions: [],
      results: [],
      analyses: [],
      samples: [],
      artifacts: [],
      condition_variations: [],
      condition_variation_attempts: [],
      narrative_blocks: []
    },
    relations: [],
    resolved_references: [],
    procedure_logic: {
      procedure_to_steps: [],
      observation_to_events: []
    },
    experiment_logic: {
      primary_entities: [],
      outcomes: [],
      design_contexts: [],
      outcome_quality: [],
      reaction_taxonomy: [],
      expert_routing: [],
      intent_hypotheses: [],
      condition_variations: [],
      variable_logic: [],
      causal_links: [],
      material_flow_graph: { nodes: [], edges: [] },
      step_dependencies: [],
      optimization_trajectories: [],
      failure_signals: [],
      reaction_routes: [],
      implicit_condition_facts: [],
      evidence_links: [],
      evidence_interpretations: [],
      sample_lineage: [],
      sample_profiles: [],
      artifact_profiles: []
    },
    knowledge_graph: {
      nodes: [],
      edges: [],
      field_evidence: [],
      missing_logic: []
    },
    lora_generation_hints: {
      recommended_tasks: [],
      blocked_tasks: [
        createTaskHint("consistency_check", "Governance blocks non-audit training projection.")
      ],
      split_hint: {
        document_id: record.document.document_id,
        date: record.document.date
      }
    },
    quality: {
      usable_for_training: false,
      confidence_score: record.quality_layer.training_quality.confidence_score,
      warnings: uniqueStrings([...governanceWarnings, ...exclusionReasons]),
      ...(exclusionReasons.length > 0 ? { exclusion_reasons: exclusionReasons } : {})
    }
  };
};

export const buildTrainingUnderstandingFromRecord = (
  record: ChemdTrainingExportV2
): ChemdTrainingUnderstandingV1 => {
  if (isTrainingProjectionBlocked(record)) {
    return buildBlockedTrainingUnderstanding(record);
  }

  const entityByOriginalId = buildEntityIndex(record);
  const resolvedReferences = buildResolvedReferences(record, entityByOriginalId, buildEntityIdIndex(record));
  const primaryEntities = buildPrimaryEntities(record, entityByOriginalId);
  const fieldEvidence = buildFieldEvidence(record);
  const graphNodes = buildKnowledgeNodes(record, fieldEvidence);
  const graphEdges = buildKnowledgeEdges(record, entityByOriginalId, fieldEvidence);
  const missingLogic = buildMissingLogic(record, resolvedReferences, primaryEntities);
  const canonicalSummary = buildCanonicalSummary(record, fieldEvidence);
  const outcomes = buildOutcomeLogic(record);
  const designContexts = buildExperimentDesignContexts(record);
  const outcomeQuality = buildOutcomeQuality(record);
  const reactionTaxonomy = buildReactionTaxonomy(record);
  const failureSignals = buildFailureSignals(outcomes, outcomeQuality);
  const conditionVariations = buildConditionVariationLogic(record);
  const implicitConditionFacts = buildImplicitConditionFacts(record);
  const procedurePairs = record.learning_layer.procedure_to_steps ?? [];
  const evidenceLinks = [
    ...buildEvidenceLinks(record, EVIDENCE_RELATIONS, "analysis"),
    ...buildEvidenceLinks(record, ARTIFACT_EVIDENCE_RELATIONS, "artifact")
  ];
  const sampleLineage = buildEvidenceLinks(record, SAMPLE_LINEAGE_RELATIONS, "sample");
  const intentHypotheses = buildIntentHypotheses({
    contexts: designContexts,
    outcomes,
    outcomeQuality,
    failureSignals,
    procedurePairs
  });
  const variableLogic = buildVariableLogic(record, designContexts, conditionVariations, implicitConditionFacts);
  const causalLinks = buildCausalLinks({
    record,
    contexts: designContexts,
    outcomes,
    failureSignals,
    evidenceLinks,
    procedurePairs
  });
  const materialFlowGraph = buildMaterialFlowGraph(record, entityByOriginalId);
  const stepDependencies = buildStepDependencies(record, entityByOriginalId);
  const sampleProfiles = buildSampleProfiles(record);
  const artifactProfiles = buildArtifactProfiles(record, stepDependencies);
  const evidenceInterpretations = buildEvidenceInterpretations(record, fieldEvidence, evidenceLinks);
  const reactionRoutes = buildReactionRoutes(record);
  const optimizationTrajectories = buildOptimizationTrajectories(
    record.document.document_id,
    designContexts,
    outcomes,
    outcomeQuality
  );
  const expertRouting = buildExpertRouting(
    reactionTaxonomy,
    designContexts,
    outcomeQuality,
    failureSignals
  );

  return {
    schema_version: "chemd-training-understanding/v0.1",
    document: {
      ...record.document,
      ...(getDocumentSummary(record) ? { summary: getDocumentSummary(record) } : {})
    },
    governance: record.governance,
    ...(canonicalSummary ? { canonical_summary: canonicalSummary } : {}),
    entities: {
      molecules: record.semantic_layer.molecules.map(stripSourceFields) as TrainingMoleculeV1[],
      materials: record.semantic_layer.materials.map(stripTrainingMaterial),
      reactions: record.semantic_layer.reactions.map(stripSourceFields) as TrainingReactionV1[],
      results: record.semantic_layer.results.map(stripSourceFields) as TrainingResultV1[],
      analyses: record.semantic_layer.analyses.map(stripSourceFields) as TrainingAnalysisV1[],
      samples: record.semantic_layer.samples.map(stripTrainingSample),
      artifacts: record.semantic_layer.artifacts.map(stripTrainingArtifact),
      condition_variations: record.semantic_layer.condition_variations.map(stripSourceFields) as TrainingConditionVaryV1[],
      condition_variation_attempts: record.semantic_layer.condition_variation_attempts.map(stripSourceFields) as TrainingConditionVariationAttemptV1[],
      narrative_blocks: buildNarrativeBlocks(record)
    },
    relations: record.semantic_layer.links,
    resolved_references: resolvedReferences,
    procedure_logic: {
      procedure_to_steps: buildProcedureLogicPairs(record),
      observation_to_events: buildObservationLogicPairs(record)
    },
    experiment_logic: {
      primary_entities: primaryEntities,
      outcomes,
      design_contexts: designContexts,
      outcome_quality: outcomeQuality,
      reaction_taxonomy: reactionTaxonomy,
      expert_routing: expertRouting,
      intent_hypotheses: intentHypotheses,
      condition_variations: conditionVariations,
      variable_logic: variableLogic,
      causal_links: causalLinks,
      material_flow_graph: materialFlowGraph,
      step_dependencies: stepDependencies,
      optimization_trajectories: optimizationTrajectories,
      failure_signals: failureSignals,
      reaction_routes: reactionRoutes,
      implicit_condition_facts: implicitConditionFacts,
      evidence_links: evidenceLinks,
      evidence_interpretations: evidenceInterpretations,
      sample_lineage: sampleLineage,
      sample_profiles: sampleProfiles,
      artifact_profiles: artifactProfiles
    },
    knowledge_graph: {
      nodes: graphNodes,
      edges: graphEdges,
      field_evidence: fieldEvidence,
      missing_logic: missingLogic
    },
    lora_generation_hints: buildLoraGenerationHints({
      record,
      graphNodes,
      graphEdges,
      fieldEvidence,
      missingLogic,
      resolvedReferences
    }),
    quality: {
      usable_for_training: !record.quality_layer.parse_quality.has_errors
        && getTrainingExclusionReasons(record).length === 0,
      confidence_score: record.quality_layer.training_quality.confidence_score,
      warnings: buildTrainingWarnings(record, resolvedReferences, missingLogic),
      ...(getTrainingExclusionReasons(record).length > 0
        ? { exclusion_reasons: getTrainingExclusionReasons(record) }
        : {})
    }
  };
};

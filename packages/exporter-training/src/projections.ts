import type {
  ChemdRagChunkV1,
  ChemdRagExportV1,
  ChemdTrainingUnderstandingV1,
  LoraTaskHintV1,
  LoraTaskTypeV1,
  TrainingAnalysisV1,
  TrainingCanonicalSummaryV1,
  TrainingEvidenceLinkV1,
  TrainingExperimentDesignContextV1,
  TrainingExperimentVariableDeltaV1,
  TrainingFieldEvidenceV1,
  TrainingKnowledgeEdgeV1,
  TrainingKnowledgeNodeV1,
  TrainingLoraGenerationHintsV1,
  TrainingMissingLogicV1,
  TrainingMoleculeV1,
  TrainingNarrativeBlockV1,
  TrainingObservationLogicPairV1,
  TrainingOutcomeQualityV1,
  TrainingOutcomeLogicV1,
  TrainingPrimaryEntityV1,
  TrainingProcedureLogicPairV1,
  TrainingReactionV1,
  TrainingResolvedReferenceV1,
  TrainingResultV1,
  TrainingSampleV1
} from "./projection-types";
import type {
  ChemdTrainingExportV2,
  ExportedAnalysisV1,
  ExportedEntityBase,
  ExportedMoleculeV1,
  ExportedReactionV1,
  ExportedRelationV1,
  ExportedResultV1,
  ExportedSampleV1
} from "./types";

type ObjectEntity =
  | ExportedMoleculeV1
  | ExportedAnalysisV1
  | ExportedResultV1
  | ExportedSampleV1
  | ExportedReactionV1;

type PrimaryRole = TrainingPrimaryEntityV1["role"];
type SourceStrippedKey =
  | "node_index"
  | "source_node_type"
  | "source_block_type"
  | "syntax_origin"
  | "declared_kind"
  | "provenance"
  | "text_for_embedding";
type ProcedurePair = NonNullable<ChemdTrainingExportV2["learning_layer"]["procedure_to_steps"]>[number];
type ObservationPair = NonNullable<ChemdTrainingExportV2["learning_layer"]["observation_to_events"]>[number];
type ProcedureStep = ProcedurePair["steps"][number];
type ObservationEvent = ObservationPair["events"][number];
type FieldValue = TrainingFieldEvidenceV1["value"];

interface FieldEvidenceInput {
  subjectEntityId: string;
  field: string;
  value: FieldValue | undefined;
  rawValue?: string;
  normalized?: boolean;
  evidenceEntityIds?: string[];
  sourceRelationIds?: string[];
}

interface LoraHintContext {
  record: ChemdTrainingExportV2;
  graphNodes: TrainingKnowledgeNodeV1[];
  graphEdges: TrainingKnowledgeEdgeV1[];
  fieldEvidence: TrainingFieldEvidenceV1[];
  missingLogic: TrainingMissingLogicV1[];
  resolvedReferences: TrainingResolvedReferenceV1[];
}

const RAG_EXCLUSION_REASONS = new Set(["no_retrieval_chunks"]);
const SAMPLE_LINEAGE_RELATIONS = new Set<ExportedRelationV1["relation_type"]>([
  "sample_derived_from_reaction",
  "sample_related_to_molecule",
  "sample_related_to_result"
]);
const EVIDENCE_RELATIONS = new Set<ExportedRelationV1["relation_type"]>([
  "analysis_targets_reaction",
  "analysis_targets_result",
  "analysis_targets_sample"
]);

const compactText = (...parts: Array<string | undefined>): string | undefined => {
  const text = parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  return text || undefined;
};

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values));

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
    text_for_embedding: _textForEmbedding,
    ...rest
  } = entity as T & { text_for_embedding?: string };

  return rest as Omit<T, SourceStrippedKey>;
};

const stripRagChunk = (chunk: ChemdTrainingExportV2["learning_layer"]["retrieval_chunks"][number]): ChemdRagChunkV1 => {
  const { raw_text: _rawText, ...cleanChunk } = chunk;
  return cleanChunk;
};

const getRagExclusionReasons = (record: ChemdTrainingExportV2): string[] | undefined => {
  const reasons = record.quality_layer.training_quality.exclusion_reasons
    ?.filter((reason) => RAG_EXCLUSION_REASONS.has(reason));

  return reasons && reasons.length > 0 ? reasons : undefined;
};

export const buildRagExportFromTrainingRecord = (record: ChemdTrainingExportV2): ChemdRagExportV1 => {
  const chunks = record.learning_layer.retrieval_chunks.map(stripRagChunk);

  return {
    schema_version: "chemd-rag-export/v0.1",
    document: record.document,
    chunks,
    quality: {
      rag_eligible: record.quality_layer.training_quality.rag_eligible,
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
    ...record.semantic_layer.samples
  ];

  return new Map(
    entities
      .filter((entity) => entity.original_id)
      .map((entity) => [entity.original_id as string, entity])
  );
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

const findRelation = (
  record: ChemdTrainingExportV2,
  fromEntityId: string,
  relationTypes: ReadonlySet<ExportedRelationV1["relation_type"]>
): ExportedRelationV1 | undefined =>
  record.semantic_layer.links.find((relation) =>
    relation.from_entity_id === fromEntityId && relationTypes.has(relation.relation_type)
  );

const createStructuredReference = (
  raw: string,
  source: Pick<TrainingResolvedReferenceV1, "source_entity_id" | "source_entity_type" | "source_field">,
  target: ObjectEntity | undefined,
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
          entityByOriginalId.get(normalizeReferenceId(reactionRaw)),
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
            entityByOriginalId.get(normalizeReferenceId(result.product_ref_raw))
          )
        ]
      : references;
  });

const buildSingleFieldReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>,
  entities: Array<ExportedAnalysisV1 | ExportedSampleV1>,
  sourceType: "analysis" | "sample"
): TrainingResolvedReferenceV1[] =>
  entities.flatMap((entity) => {
    if (!entity.ref_raw) {
      return [];
    }

    const relation = findRelation(record, entity.entity_id, sourceType === "analysis" ? EVIDENCE_RELATIONS : SAMPLE_LINEAGE_RELATIONS);

    return [createStructuredReference(
      entity.ref_raw,
      {
        source_entity_id: entity.entity_id,
        source_entity_type: sourceType,
        source_field: "ref"
      },
      entityByOriginalId.get(normalizeReferenceId(entity.ref_raw)),
      relation?.relation_type
    )];
  });

const buildResolvedReferences = (
  record: ChemdTrainingExportV2,
  entityByOriginalId: Map<string, ObjectEntity>
): TrainingResolvedReferenceV1[] => [
  ...buildMarkdownReferences(record, entityByOriginalId),
  ...buildReactionParticipantReferences(record),
  ...buildResultReferences(record, entityByOriginalId),
  ...buildSingleFieldReferences(record, entityByOriginalId, record.semantic_layer.analyses, "analysis"),
  ...buildSingleFieldReferences(record, entityByOriginalId, record.semantic_layer.samples, "sample")
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

const buildExperimentDesignContexts = (record: ChemdTrainingExportV2): TrainingExperimentDesignContextV1[] => {
  const baseline = record.semantic_layer.reactions.find((reaction) => reaction.is_primary)
    ?? record.semantic_layer.reactions[0];

  if (!baseline) {
    return [];
  }

  const seriesId = `series::${record.document.document_id}::${baseline.entity_id}`;
  return record.semantic_layer.reactions.map((reaction) => {
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
  ...record.semantic_layer.markdown_blocks.map((block) => ({
    node_id: block.entity_id,
    node_type: "narrative" as const,
    label: block.cleaned_text.slice(0, 80)
  })),
  ...buildProcedureNodes(record),
  ...buildObservationNodes(record),
  ...buildFieldValueNodes(fieldEvidence)
];

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
    const target = item.reference ? entityByOriginalId.get(normalizeReferenceId(item.reference.refId)) : undefined;

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

const findEvidenceRelationsForResult = (
  result: ExportedResultV1,
  record: ChemdTrainingExportV2
): ExportedRelationV1[] => {
  const reactionId = findLinkedReactionId(result, record.semantic_layer.links);

  return record.semantic_layer.links.filter((relation) =>
    (relation.relation_type === "analysis_targets_result" && relation.to_entity_id === result.entity_id)
    || (relation.relation_type === "sample_related_to_result" && relation.to_entity_id === result.entity_id)
    || Boolean(reactionId && relation.to_entity_id === reactionId && (
      relation.relation_type === "analysis_targets_reaction"
      || relation.relation_type === "sample_derived_from_reaction"
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
    source_relation_ids: uniqueStrings(input.sourceRelationIds ?? [])
  }];
};

const buildMoleculeFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.molecules.flatMap((molecule) => [
    ...createFieldEvidence({ subjectEntityId: molecule.entity_id, field: "smiles", value: molecule.smiles }),
    ...createFieldEvidence({ subjectEntityId: molecule.entity_id, field: "cas", value: molecule.cas }),
    ...createFieldEvidence({ subjectEntityId: molecule.entity_id, field: "formula", value: molecule.formula }),
    ...createFieldEvidence({
      subjectEntityId: molecule.entity_id,
      field: "amount_value",
      value: formatNumericWithUnit(molecule.amount_value),
      rawValue: molecule.amount_raw,
      normalized: Boolean(molecule.amount_value)
    }),
    ...createFieldEvidence({
      subjectEntityId: molecule.entity_id,
      field: "equivalents_value",
      value: molecule.equivalents_value,
      rawValue: molecule.equivalents_raw,
      normalized: typeof molecule.equivalents_value === "number"
    })
  ]);

const buildReactionFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.reactions.flatMap((reaction) => [
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "solvent",
      value: reaction.normalized_conditions.solvent?.normalized,
      rawValue: reaction.solvent_raw,
      normalized: Boolean(reaction.normalized_conditions.solvent)
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "catalyst",
      value: reaction.normalized_conditions.catalyst?.normalized,
      rawValue: reaction.catalyst_raw,
      normalized: Boolean(reaction.normalized_conditions.catalyst)
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "reagents",
      value: reaction.normalized_conditions.reagents?.normalized.join(", "),
      rawValue: reaction.reagents_raw,
      normalized: Boolean(reaction.normalized_conditions.reagents)
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "temperature",
      value: formatNumericWithUnit(reaction.normalized_conditions.temperature),
      rawValue: reaction.temperature_raw,
      normalized: Boolean(reaction.normalized_conditions.temperature)
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "time",
      value: formatNumericWithUnit(reaction.normalized_conditions.time),
      rawValue: reaction.time_raw,
      normalized: Boolean(reaction.normalized_conditions.time)
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "pressure",
      value: formatNumericWithUnit(reaction.normalized_conditions.pressure),
      rawValue: reaction.pressure_raw,
      normalized: Boolean(reaction.normalized_conditions.pressure)
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "atmosphere",
      value: reaction.normalized_conditions.atmosphere?.normalized,
      rawValue: reaction.atmosphere_raw,
      normalized: Boolean(reaction.normalized_conditions.atmosphere)
    }),
    ...createFieldEvidence({
      subjectEntityId: reaction.entity_id,
      field: "yield_percent",
      value: reaction.normalized_outcome_hints.yield_percent,
      rawValue: reaction.yield_raw,
      normalized: typeof reaction.normalized_outcome_hints.yield_percent === "number"
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
        sourceRelationIds
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "yield_percent",
        value: result.yield_percent,
        rawValue: result.yield_raw,
        normalized: typeof result.yield_percent === "number",
        evidenceEntityIds,
        sourceRelationIds
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "conversion_percent",
        value: result.conversion_percent,
        rawValue: result.conversion_raw,
        normalized: typeof result.conversion_percent === "number",
        evidenceEntityIds,
        sourceRelationIds
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "selectivity_percent",
        value: result.selectivity_percent,
        rawValue: result.selectivity_raw,
        normalized: typeof result.selectivity_percent === "number",
        evidenceEntityIds,
        sourceRelationIds
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "purity_percent",
        value: result.purity_percent,
        rawValue: result.purity_raw,
        normalized: typeof result.purity_percent === "number",
        evidenceEntityIds,
        sourceRelationIds
      }),
      ...createFieldEvidence({
        subjectEntityId: result.entity_id,
        field: "isolated_mass",
        value: formatNumericWithUnit(result.isolated_mass),
        rawValue: result.isolated_mass_raw,
        normalized: Boolean(result.isolated_mass),
        evidenceEntityIds,
        sourceRelationIds
      })
    ];
  });

const buildAnalysisFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.analyses.flatMap((analysis) => [
    ...createFieldEvidence({ subjectEntityId: analysis.entity_id, field: "analysis_type", value: analysis.analysis_type }),
    ...createFieldEvidence({ subjectEntityId: analysis.entity_id, field: "method", value: analysis.method }),
    ...createFieldEvidence({ subjectEntityId: analysis.entity_id, field: "data", value: analysis.data_raw }),
    ...createFieldEvidence({ subjectEntityId: analysis.entity_id, field: "result", value: analysis.result_raw })
  ]);

const buildSampleFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] =>
  record.semantic_layer.samples.flatMap((sample) => [
    ...createFieldEvidence({ subjectEntityId: sample.entity_id, field: "sample_code", value: sample.sample_code }),
    ...createFieldEvidence({ subjectEntityId: sample.entity_id, field: "batch", value: sample.batch }),
    ...createFieldEvidence({
      subjectEntityId: sample.entity_id,
      field: "purity_percent",
      value: sample.purity_percent,
      rawValue: sample.purity_raw,
      normalized: typeof sample.purity_percent === "number"
    })
  ]);

const buildFieldEvidence = (record: ChemdTrainingExportV2): TrainingFieldEvidenceV1[] => [
  ...buildMoleculeFieldEvidence(record),
  ...buildReactionFieldEvidence(record),
  ...buildResultFieldEvidence(record),
  ...buildAnalysisFieldEvidence(record),
  ...buildSampleFieldEvidence(record)
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
  const text = compactText(
    `Document ${record.document.title} (${record.document.date}).`,
    firstReaction ? `Main reaction candidate ${firstReaction.entity_id}.` : undefined,
    primaryResult ? `Main result candidate ${primaryResult.entity_id}.` : undefined,
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
  const hasSemanticRelations = record.semantic_layer.links.length > 0;
  const hasEvidenceLinks = fieldEvidence.some(hasExternalEvidence);
  const hasSummaryBasis = record.semantic_layer.reactions.length + record.semantic_layer.results.length > 0;
  const hasDecisionBasis = record.semantic_layer.reactions.length > 0 && record.semantic_layer.results.length > 0;
  const hasYieldPrediction = record.learning_layer.prediction_instances.some((instance) =>
    instance.usability.usable_for_yield_regression
  );
  const hasFailedOutcome = record.semantic_layer.results.some((result) => result.status_label === "failed");
  const hasExperimentComparison = record.semantic_layer.reactions.length > 1;
  const hasProposalBasis = hasProcedureLogic && hasDecisionBasis;
  const qualityIssueCount = missingLogic.length + (record.quality_layer.training_quality.exclusion_reasons?.length ?? 0);

  return [
    ...(entityIds.length > 0 ? [createTaskHint("entity_extraction", "Experiment entities are available.", entityIds)] : []),
    ...includeTask(hasSummaryBasis, createTaskHint("experiment_summary", "Reaction or result entities are available.", entityIds)),
    ...includeTask(hasSemanticRelations, createTaskHint("relation_extraction", "Semantic relations are available.", entityIds)),
    ...includeTask(resolvedReferences.length > 0, createTaskHint("reference_resolution", "Resolved or unresolved references are available.")),
    ...includeTask(hasEvidenceLinks, createTaskHint("evidence_tracing", "External field-level evidence is available.")),
    ...includeTask(hasProcedureLogic, createTaskHint("procedure_reasoning", "Procedure-to-step pairs are available.")),
    ...includeTask(hasYieldPrediction, createTaskHint("yield_prediction", "Usable yield targets are available.")),
    ...includeTask(hasDecisionBasis, createTaskHint("condition_recommendation", "Reaction conditions and outcomes are available.")),
    ...includeTask(hasProposalBasis, createTaskHint("experiment_proposal", "Procedure and outcome context are available.")),
    ...includeTask(hasFailedOutcome, createTaskHint("failure_analysis", "Failed result labels are available.")),
    ...includeTask(hasExperimentComparison, createTaskHint("experiment_comparison", "Multiple reactions can be compared.")),
    ...includeTask(qualityIssueCount > 0, createTaskHint("consistency_check", "Quality warnings or missing logic are available.")),
    ...(entityIds.length > 0 ? [createTaskHint("qa_with_context", "Structured experiment context is available.", entityIds)] : [])
  ];
};

const buildBlockedLoraTasks = (context: LoraHintContext): LoraTaskHintV1[] => {
  const { record, fieldEvidence, resolvedReferences } = context;
  const hasProcedureLogic = Boolean(record.learning_layer.procedure_to_steps?.length);
  const hasSemanticRelations = record.semantic_layer.links.length > 0;
  const hasEvidenceLinks = fieldEvidence.some(hasExternalEvidence);
  const hasYieldPrediction = record.learning_layer.prediction_instances.some((instance) =>
    instance.usability.usable_for_yield_regression
  );

  return [
    ...includeTask(!hasSemanticRelations, createTaskHint("relation_extraction", "No semantic relations are available.")),
    ...includeTask(resolvedReferences.length === 0, createTaskHint("reference_resolution", "No references are available.")),
    ...includeTask(!hasEvidenceLinks, createTaskHint("evidence_tracing", "No external field-level evidence is available.")),
    ...includeTask(!hasProcedureLogic, createTaskHint("procedure_reasoning", "No procedure logic is available.")),
    ...includeTask(!hasYieldPrediction, createTaskHint("yield_prediction", "No usable yield target is available.")),
    ...includeTask(
      record.semantic_layer.reactions.length === 0 || record.semantic_layer.results.length === 0,
      createTaskHint("condition_recommendation", "No reaction/result pair is available.")
    ),
    ...includeTask(!hasProcedureLogic, createTaskHint("experiment_proposal", "No procedure logic is available.")),
    ...includeTask(!record.semantic_layer.results.some((result) => result.status_label === "failed"), createTaskHint("failure_analysis", "No failed result label is available.")),
    ...includeTask(record.semantic_layer.reactions.length < 2, createTaskHint("experiment_comparison", "Fewer than two reactions are available."))
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

export const buildTrainingUnderstandingFromRecord = (
  record: ChemdTrainingExportV2
): ChemdTrainingUnderstandingV1 => {
  const entityByOriginalId = buildEntityIndex(record);
  const resolvedReferences = buildResolvedReferences(record, entityByOriginalId);
  const primaryEntities = buildPrimaryEntities(record, entityByOriginalId);
  const fieldEvidence = buildFieldEvidence(record);
  const graphNodes = buildKnowledgeNodes(record, fieldEvidence);
  const graphEdges = buildKnowledgeEdges(record, entityByOriginalId, fieldEvidence);
  const missingLogic = buildMissingLogic(record, resolvedReferences, primaryEntities);
  const canonicalSummary = buildCanonicalSummary(record, fieldEvidence);

  return {
    schema_version: "chemd-training-understanding/v0.1",
    document: {
      ...record.document,
      ...(getDocumentSummary(record) ? { summary: getDocumentSummary(record) } : {})
    },
    ...(canonicalSummary ? { canonical_summary: canonicalSummary } : {}),
    entities: {
      molecules: record.semantic_layer.molecules.map(stripSourceFields) as TrainingMoleculeV1[],
      reactions: record.semantic_layer.reactions.map(stripSourceFields) as TrainingReactionV1[],
      results: record.semantic_layer.results.map(stripSourceFields) as TrainingResultV1[],
      analyses: record.semantic_layer.analyses.map(stripSourceFields) as TrainingAnalysisV1[],
      samples: record.semantic_layer.samples.map(stripSourceFields) as TrainingSampleV1[],
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
      outcomes: buildOutcomeLogic(record),
      design_contexts: buildExperimentDesignContexts(record),
      outcome_quality: buildOutcomeQuality(record),
      evidence_links: buildEvidenceLinks(record, EVIDENCE_RELATIONS, "analysis"),
      sample_lineage: buildEvidenceLinks(record, SAMPLE_LINEAGE_RELATIONS, "sample")
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
      usable_for_training: !record.quality_layer.parse_quality.has_errors,
      confidence_score: record.quality_layer.training_quality.confidence_score,
      warnings: buildTrainingWarnings(record, resolvedReferences, missingLogic),
      ...(record.quality_layer.training_quality.exclusion_reasons
        ? { exclusion_reasons: record.quality_layer.training_quality.exclusion_reasons }
        : {})
    }
  };
};

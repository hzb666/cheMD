import type { StepGraph } from "@chemd/step-ontology";

import type {
  ExportedDocumentInfo,
  ExportedDiagnostic,
  ExportedReactionV1,
  ExportedResultV1,
  LearningLayerV1,
  ObservationToEventsPairV03,
  PredictionInstanceV1,
  PredictionTargetFieldV1,
  PredictionTargetSourceV1,
  PredictionTargetsV1,
  ProcedureToStepsPairV03,
  RetrievalChunkV1,
  RetrievalMetadataV1,
  SemanticLayerV1
} from "./types";

export interface BuildLearningLayerInput {
  document: ExportedDocumentInfo;
  semanticLayer: SemanticLayerV1;
  stepGraph?: StepGraph;
}

const exportDiagnostic = (diagnostic: StepGraph["diagnostics"][number]): ExportedDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  node_id: diagnostic.sourceNodeId,
  position: diagnostic.position
});

const readProcedureSourceText = (procedure: StepGraph["procedures"][number]): string =>
  procedure.steps
    .map((step) => step.source.rawText.trim())
    .filter((rawText) => rawText.length > 0)
    .join("\n");

const buildProcedurePairs = (stepGraph: StepGraph | undefined): ProcedureToStepsPairV03[] =>
  stepGraph?.procedures.map((procedure, index) => ({
    pair_id: `procedure_to_steps::${procedure.procedureId ?? index}`,
    procedure_id: procedure.procedureId,
    source_type: procedure.sourceType,
    source_text: readProcedureSourceText(procedure),
    steps: procedure.steps,
    low_confidence_step_count: procedure.steps.filter((step) => step.loweringConfidence < 0.85).length,
    diagnostics: procedure.diagnostics.map(exportDiagnostic)
  })) ?? [];

const buildObservationPairs = (stepGraph: StepGraph | undefined): ObservationToEventsPairV03[] =>
  stepGraph?.observations.map((observation, index) => ({
    pair_id: `observation_to_events::${observation.observationId ?? index}`,
    observation_id: observation.observationId,
    source_text: observation.events[0]?.rawText ?? "",
    events: observation.events,
    diagnostics: observation.diagnostics.map(exportDiagnostic)
  })) ?? [];

const compactText = (...parts: Array<string | undefined>): string =>
  parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

const uniqueStrings = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const createRetrievalMetadata = (
  document: ExportedDocumentInfo,
  semanticLayer: SemanticLayerV1
): RetrievalMetadataV1 => ({
  date: document.date,
  ...(document.tags ? { tags: document.tags } : {}),
  molecule_ids: semanticLayer.molecules.map((molecule) => molecule.entity_id),
  reaction_ids: semanticLayer.reactions.map((reaction) => reaction.entity_id),
  result_ids: semanticLayer.results.map((result) => result.entity_id),
  analysis_ids: semanticLayer.analyses.map((analysis) => analysis.entity_id),
  sample_ids: semanticLayer.samples.map((sample) => sample.entity_id),
  artifact_ids: semanticLayer.artifacts.map((artifact) => artifact.entity_id),
  condition_variation_ids: semanticLayer.condition_variations.map((variation) => variation.entity_id),
  analysis_types: uniqueStrings(semanticLayer.analyses.map((analysis) => analysis.analysis_type))
});

const buildDocumentSummaryText = (
  document: ExportedDocumentInfo,
  semanticLayer: SemanticLayerV1
): string => compactText(
  `Document ${document.title}`,
  `date ${document.date}`,
  document.tags?.length ? `tags ${document.tags.join(", ")}` : undefined,
  semanticLayer.molecules.length ? `${semanticLayer.molecules.length} molecules` : undefined,
  semanticLayer.reactions.length ? `${semanticLayer.reactions.length} reactions` : undefined,
  semanticLayer.results.length ? `${semanticLayer.results.length} results` : undefined,
  semanticLayer.analyses.length ? `${semanticLayer.analyses.length} analyses` : undefined,
  semanticLayer.samples.length ? `${semanticLayer.samples.length} samples` : undefined,
  semanticLayer.artifacts.length ? `${semanticLayer.artifacts.length} artifacts` : undefined,
  semanticLayer.condition_variations.length
    ? `${semanticLayer.condition_variations.length} condition variations`
    : undefined
);

const getDocumentSummaryEntityIds = (semanticLayer: SemanticLayerV1): string[] => [
  ...semanticLayer.molecules.map((molecule) => molecule.entity_id),
  ...semanticLayer.reactions.map((reaction) => reaction.entity_id),
  ...semanticLayer.results.map((result) => result.entity_id),
  ...semanticLayer.analyses.map((analysis) => analysis.entity_id),
  ...semanticLayer.samples.map((sample) => sample.entity_id),
  ...semanticLayer.artifacts.map((artifact) => artifact.entity_id),
  ...semanticLayer.condition_variations.map((variation) => variation.entity_id)
];

const buildConditionVariationChunks = (
  document: ExportedDocumentInfo,
  semanticLayer: SemanticLayerV1,
  metadata: RetrievalMetadataV1
): RetrievalChunkV1[] =>
  semanticLayer.condition_variations.flatMap((variation) =>
    variation.text_for_embedding
      ? [{
          chunk_id: `retrieval::${document.document_id}::${variation.entity_id}`,
          experiment_id: document.document_id,
          chunk_type: "condition_variation" as const,
          source_entity_ids: [variation.entity_id],
          text: variation.text_for_embedding,
          metadata
        }]
      : []
  );

const buildRetrievalChunks = (
  document: ExportedDocumentInfo,
  semanticLayer: SemanticLayerV1
): RetrievalChunkV1[] => {
  const metadata = createRetrievalMetadata(document, semanticLayer);
  const chunks: RetrievalChunkV1[] = [];
  const documentSummary = buildDocumentSummaryText(document, semanticLayer);

  if (documentSummary) {
    chunks.push({
      chunk_id: `retrieval::${document.document_id}::document-summary`,
      experiment_id: document.document_id,
      chunk_type: "document_summary",
      source_entity_ids: getDocumentSummaryEntityIds(semanticLayer),
      text: documentSummary,
      metadata
    });
  }

  semanticLayer.markdown_blocks.forEach((block) => {
    if (!block.text_for_embedding) {
      return;
    }

    chunks.push({
      chunk_id: `retrieval::${document.document_id}::${block.entity_id}`,
      experiment_id: document.document_id,
      chunk_type: "markdown",
      source_entity_ids: [block.entity_id],
      text: block.text_for_embedding,
      raw_text: block.raw_text,
      metadata
    });
  });

  semanticLayer.reactions.forEach((reaction) => {
    const text = compactText(reaction.name, reaction.caption, reaction.text_for_embedding);
    if (!text) {
      return;
    }

    chunks.push({
      chunk_id: `retrieval::${document.document_id}::${reaction.entity_id}`,
      experiment_id: document.document_id,
      chunk_type: "reaction_summary",
      source_entity_ids: [reaction.entity_id],
      text,
      metadata
    });
  });

  semanticLayer.results.forEach((result) => {
    const text = compactText(result.notes, result.text_for_embedding);
    if (!text) {
      return;
    }

    chunks.push({
      chunk_id: `retrieval::${document.document_id}::${result.entity_id}`,
      experiment_id: document.document_id,
      chunk_type: "result_notes",
      source_entity_ids: [result.entity_id],
      text,
      metadata: {
        ...metadata,
        status_label: result.status_label,
        yield_percent: result.yield_percent,
        conversion_percent: result.conversion_percent,
        selectivity_percent: result.selectivity_percent,
        purity_percent: result.purity_percent
      }
    });
  });

  semanticLayer.analyses.forEach((analysis) => {
    const text = compactText(
      analysis.analysis_type,
      analysis.ref_raw ? `ref ${analysis.ref_raw}` : undefined,
      analysis.instrument,
      analysis.method,
      analysis.data_raw,
      analysis.result_raw,
      analysis.notes
    );
    if (!text) {
      return;
    }

    chunks.push({
      chunk_id: `retrieval::${document.document_id}::${analysis.entity_id}`,
      experiment_id: document.document_id,
      chunk_type: "analysis_notes",
      source_entity_ids: [analysis.entity_id],
      text,
      metadata: {
        ...metadata,
        analysis_types: analysis.analysis_type ? [analysis.analysis_type] : metadata.analysis_types
      }
    });
  });

  semanticLayer.samples.forEach((sample) => {
    const text = compactText(
      sample.name,
      sample.sample_code,
      sample.batch,
      sample.ref_raw ? `ref ${sample.ref_raw}` : undefined,
      sample.supplier,
      sample.purity_raw,
      sample.notes
    );
    if (!text) {
      return;
    }

    chunks.push({
      chunk_id: `retrieval::${document.document_id}::${sample.entity_id}`,
      experiment_id: document.document_id,
      chunk_type: "sample_notes",
      source_entity_ids: [sample.entity_id],
      text,
      metadata: {
        ...metadata,
        purity_percent: sample.purity_percent
      }
    });
  });

  semanticLayer.artifacts.forEach((artifact) => {
    const text = compactText(
      artifact.artifact_kind,
      artifact.ref_raw ? `ref ${artifact.ref_raw}` : undefined,
      artifact.path,
      artifact.instrument,
      artifact.notes
    );
    if (!text) {
      return;
    }

    chunks.push({
      chunk_id: `retrieval::${document.document_id}::${artifact.entity_id}`,
      experiment_id: document.document_id,
      chunk_type: "artifact_notes",
      source_entity_ids: [artifact.entity_id],
      text,
      metadata
    });
  });

  chunks.push(...buildConditionVariationChunks(document, semanticLayer, metadata));

  return chunks;
};

const toConditionValue = (value: { normalized?: string } | null | undefined): string | null =>
  value?.normalized ?? null;

const toNumericValue = (value: { value?: number } | null | undefined): number | null =>
  typeof value?.value === "number" ? value.value : null;

const readTargetValue = (
  resultValue: number | null | undefined,
  reactionHint: number | null | undefined
): { value?: number | null; source: PredictionTargetSourceV1 } => {
  if (typeof resultValue === "number") {
    return { value: resultValue, source: "result" };
  }

  if (typeof reactionHint === "number") {
    return { value: reactionHint, source: "reaction_hint" };
  }

  return { source: "missing" };
};

const createTargetSources = (
  entries: Array<[PredictionTargetFieldV1, PredictionTargetSourceV1]>
): Partial<Record<PredictionTargetFieldV1, PredictionTargetSourceV1>> =>
  Object.fromEntries(entries) as Partial<Record<PredictionTargetFieldV1, PredictionTargetSourceV1>>;

const buildPredictionTargets = (
  reaction: ExportedReactionV1,
  primaryResult: ExportedResultV1 | undefined
): PredictionTargetsV1 => {
  const yieldTarget = readTargetValue(primaryResult?.yield_percent, reaction.normalized_outcome_hints.yield_percent);
  const conversionTarget = readTargetValue(
    primaryResult?.conversion_percent,
    reaction.normalized_outcome_hints.conversion_percent
  );
  const selectivityTarget = readTargetValue(
    primaryResult?.selectivity_percent,
    reaction.normalized_outcome_hints.selectivity_percent
  );
  const puritySource: PredictionTargetSourceV1 = typeof primaryResult?.purity_percent === "number" ? "result" : "missing";

  return {
    status_class: primaryResult?.status_label,
    yield_percent: yieldTarget.value,
    conversion_percent: conversionTarget.value,
    selectivity_percent: selectivityTarget.value,
    purity_percent: primaryResult?.purity_percent,
    target_sources: createTargetSources([
      ["status_class", primaryResult?.status_label ? "result" : "missing"],
      ["yield_percent", yieldTarget.source],
      ["conversion_percent", conversionTarget.source],
      ["selectivity_percent", selectivityTarget.source],
      ["purity_percent", puritySource]
    ])
  };
};

const buildMissingPredictionFields = (
  reaction: ExportedReactionV1,
  primaryResult: ExportedResultV1 | undefined,
  targets: PredictionTargetsV1
): string[] => [
  reaction.reactants.length === 0 ? "reactants" : "",
  reaction.products.length === 0 ? "products" : "",
  !primaryResult && targets.yield_percent == null ? "result_or_reaction_yield" : ""
].filter(Boolean);

const buildLinkedMoleculeIds = (reaction: ExportedReactionV1): string[] => [
  ...reaction.reactants.flatMap((participant) => participant.target_entity_id ?? []),
  ...reaction.products.flatMap((participant) => participant.target_entity_id ?? [])
];

const buildChemistryFeatureRefIds = (
  semanticLayer: SemanticLayerV1,
  reaction: ExportedReactionV1,
  linkedMoleculeEntityIds: string[]
): string[] => uniqueStrings([
  ...(reaction.chemistry_feature_ref_ids ?? []),
  ...semanticLayer.molecules
    .filter((molecule) => linkedMoleculeEntityIds.includes(molecule.entity_id))
    .flatMap((molecule) => molecule.chemistry_feature_ref_ids ?? [])
]);

const findLinkedResultForReaction = (
  semanticLayer: SemanticLayerV1,
  reactionEntityId: string
): ExportedResultV1 | undefined =>
  semanticLayer.results.find((result) =>
    semanticLayer.links.some((relation) =>
      relation.relation_type === "result_describes_reaction"
      && relation.from_entity_id === result.entity_id
      && relation.to_entity_id === reactionEntityId
    )
  );

const buildLinkedEntityIds = (
  semanticLayer: SemanticLayerV1,
  relationTypes: string[],
  targetIds: string[]
): string[] =>
  semanticLayer.links
    .filter((relation) =>
      relationTypes.includes(relation.relation_type)
      && targetIds.includes(relation.to_entity_id)
    )
    .map((relation) => relation.from_entity_id);

const sumReactantEquivalents = (
  semanticLayer: SemanticLayerV1,
  linkedMoleculeEntityIds: string[]
): number | null => {
  const values = semanticLayer.molecules
    .filter((molecule) => linkedMoleculeEntityIds.includes(molecule.entity_id))
    .flatMap((molecule) => typeof molecule.equivalents_value === "number" ? [molecule.equivalents_value] : []);

  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
};

const buildPredictionWarnings = (reaction: ExportedReactionV1): string[] =>
  reaction.reactants.concat(reaction.products)
    .filter((participant) => participant.reference_status === "unresolved")
    .map((participant) => `unresolved_${participant.role}:${participant.raw}`);

const buildPredictionInstance = (
  document: ExportedDocumentInfo,
  semanticLayer: SemanticLayerV1,
  reaction: ExportedReactionV1,
  primaryResult: ExportedResultV1 | undefined
): PredictionInstanceV1 => {
  const targets = buildPredictionTargets(reaction, primaryResult);
  const linkedMoleculeIds = buildLinkedMoleculeIds(reaction);
  const linkedTargetIds = [reaction.entity_id, ...(primaryResult ? [primaryResult.entity_id] : [])];
  const linkedAnalysisIds = buildLinkedEntityIds(semanticLayer, [
    "analysis_targets_reaction",
    "analysis_targets_result"
  ], linkedTargetIds);
  const linkedSampleIds = buildLinkedEntityIds(semanticLayer, [
    "sample_derived_from_reaction",
    "sample_related_to_result"
  ], linkedTargetIds);

  return {
    instance_id: `prediction::${document.document_id}::${reaction.entity_id}`,
    experiment_id: document.document_id,
    task_scope: "reaction",
    reaction_entity_id: reaction.entity_id,
    ...(primaryResult ? { linked_result_entity_id: primaryResult.entity_id } : {}),
    ...(linkedAnalysisIds.length > 0 ? { linked_analysis_entity_ids: linkedAnalysisIds } : {}),
    ...(linkedSampleIds.length > 0 ? { linked_sample_entity_ids: linkedSampleIds } : {}),
    linked_molecule_entity_ids: linkedMoleculeIds,
    split_hint: {
      date: document.date
    },
    features: {
      categorical: {
        reaction_name: reaction.name ?? null,
        solvent: toConditionValue(reaction.normalized_conditions.solvent),
        catalyst: toConditionValue(reaction.normalized_conditions.catalyst),
        reagents: reaction.normalized_conditions.reagents?.normalized.join(", ") ?? null,
        atmosphere: toConditionValue(reaction.normalized_conditions.atmosphere)
      },
      numeric: {
        temperature: toNumericValue(reaction.normalized_conditions.temperature),
        time: toNumericValue(reaction.normalized_conditions.time),
        pressure: toNumericValue(reaction.normalized_conditions.pressure),
        num_reactants: reaction.reactants.length,
        num_products: reaction.products.length,
        num_resolved_reactants: reaction.reactants.filter((participant) => participant.reference_status === "resolved").length,
        total_reactant_equivalents: sumReactantEquivalents(semanticLayer, linkedMoleculeIds)
      },
      text_refs: reaction.text_for_embedding ? [reaction.text_for_embedding] : [],
      entity_refs: [
        reaction.entity_id,
        ...linkedMoleculeIds
      ],
      chemistry_feature_ref_ids: buildChemistryFeatureRefIds(semanticLayer, reaction, linkedMoleculeIds)
    },
    targets,
    usability: {
      usable_for_classification: Boolean(targets.status_class),
      usable_for_yield_regression: typeof targets.yield_percent === "number",
      usable_for_conversion_regression: typeof targets.conversion_percent === "number",
      usable_for_selectivity_regression: typeof targets.selectivity_percent === "number",
      missing_required_fields: buildMissingPredictionFields(reaction, primaryResult, targets),
      warnings: buildPredictionWarnings(reaction)
    }
  };
};

const buildPredictionInstances = (
  document: ExportedDocumentInfo,
  semanticLayer: SemanticLayerV1
): PredictionInstanceV1[] => {
  const fallbackResult = semanticLayer.reactions.length === 1
    ? semanticLayer.results.find((result) => result.is_primary) ?? semanticLayer.results[0]
    : undefined;

  return semanticLayer.reactions.map((reaction) =>
    buildPredictionInstance(
      document,
      semanticLayer,
      reaction,
      findLinkedResultForReaction(semanticLayer, reaction.entity_id) ?? fallbackResult
    )
  );
};

export const buildLearningLayer = (input: BuildLearningLayerInput): LearningLayerV1 => {
  const procedurePairs = buildProcedurePairs(input.stepGraph);
  const observationPairs = buildObservationPairs(input.stepGraph);

  return {
    retrieval_chunks: buildRetrievalChunks(input.document, input.semanticLayer),
    prediction_instances: buildPredictionInstances(input.document, input.semanticLayer),
    ...(procedurePairs.length > 0 ? { procedure_to_steps: procedurePairs } : {}),
    ...(observationPairs.length > 0 ? { observation_to_events: observationPairs } : {})
  };
};

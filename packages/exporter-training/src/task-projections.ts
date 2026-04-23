import type {
  ChemdTrainingTaskDatasetV1,
  ChemdTrainingUnderstandingV1,
  ExperimentDecisionTaskTypeV1,
  TrainingExpertRoutingV1,
  TrainingConditionVariationLogicV1,
  TrainingExperimentDesignContextV1,
  TrainingInferenceConfidenceV1,
  TrainingOutcomeLogicV1,
  TrainingOutcomeQualityV1,
  TrainingReactionV1,
  TrainingReactionTaxonomyV1,
  TrainingTaskLeakageRiskV1,
  TrainingTaskExampleV1
} from "./projection-types";

type JsonObject = Record<string, unknown>;

interface CreateExampleInput {
  understanding: ChemdTrainingUnderstandingV1;
  taskType: ExperimentDecisionTaskTypeV1;
  suffix: string;
  sourceEntityIds: string[];
  input: JsonObject;
  output: JsonObject;
  warnings?: string[];
  targetFields?: string[];
  leakageRisk?: TrainingTaskLeakageRiskV1;
  usableForEval?: boolean;
  derivedLabelConfidence?: TrainingInferenceConfidenceV1;
}

const SYSTEM_PROMPTS: Record<ExperimentDecisionTaskTypeV1, string> = {
  record_to_chemd: "Convert supplied structured experiment facts into concise Chemd blocks without inventing missing fields.",
  chemd_repair: "Identify the minimal Chemd repair needed for the supplied quality issue. Preserve existing meaning.",
  normalization_explanation: "Explain how raw Chemd fields normalize into structured values using only supplied evidence.",
  procedure_reasoning: "Convert Chemd procedure text into ordered canonical experiment steps with conservative confidence.",
  observation_events: "Convert Chemd observation text into structured observation events and link them to known steps when possible.",
  evidence_tracing: "Trace which evidence supports a field or relation. Separate direct evidence from inferred context.",
  evidence_interpretation: "Interpret analytical or artifact evidence into support, contradiction, or quantification claims without inventing chemistry.",
  reference_resolution: "Resolve Chemd references to target entities and report unresolved references without inventing targets.",
  relation_extraction: "Extract semantic Chemd relations from entity and reference facts with stable relation roles.",
  qa_with_context: "Answer questions using only supplied Chemd training understanding context. Say when evidence is missing.",
  experiment_intent: "Infer experiment intent and causal logic from structured Chemd facts without inventing unsupported rationale.",
  material_flow_reasoning: "Reconstruct material flow and step dependencies from structured Chemd facts without leaking target graph fields.",
  reaction_classification: "Classify the reaction using only supplied Chemd experiment facts and return conservative taxonomy labels.",
  expert_routing: "Route the experiment to suitable chemistry or modeling experts using only supplied Chemd experiment facts.",
  yield_prediction: "Use only the supplied Chemd experiment facts to estimate the observed reaction outcome. Do not invent missing chemistry.",
  condition_recommendation: "Use Chemd experiment facts to recommend conservative condition changes with evidence. Do not invent unavailable reagents.",
  experiment_proposal: "Use Chemd experiment facts to draft the next experiment plan with assumptions and risks.",
  failure_analysis: "Use Chemd experiment facts to analyze likely failure signals. Separate evidence from hypothesis.",
  experiment_comparison: "Compare Chemd experiment variants by changed variables and observed outcomes."
};

const toJson = (value: JsonObject): string => JSON.stringify(value, null, 2);

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values));

const getReaction = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string
): TrainingReactionV1 | undefined =>
  understanding.entities.reactions.find((reaction) => reaction.entity_id === reactionEntityId);

const getOutcomeByResult = (
  understanding: ChemdTrainingUnderstandingV1,
  resultEntityId: string | undefined
): TrainingOutcomeLogicV1 | undefined =>
  resultEntityId
    ? understanding.experiment_logic.outcomes.find((outcome) => outcome.result_entity_id === resultEntityId)
    : undefined;

const getOutcomeByReaction = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string | undefined
): TrainingOutcomeLogicV1 | undefined =>
  reactionEntityId
    ? understanding.experiment_logic.outcomes.find((outcome) => outcome.reaction_entity_id === reactionEntityId)
    : undefined;

const getOutcomeQuality = (
  understanding: ChemdTrainingUnderstandingV1,
  resultEntityId: string | undefined
): TrainingOutcomeQualityV1 | undefined =>
  resultEntityId
    ? understanding.experiment_logic.outcome_quality.find((quality) => quality.result_entity_id === resultEntityId)
    : undefined;

const getDesignContext = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string
): TrainingExperimentDesignContextV1 | undefined =>
  understanding.experiment_logic.design_contexts.find((context) => context.reaction_entity_id === reactionEntityId);

const getConditionVariationsForReaction = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string | undefined
): TrainingConditionVariationLogicV1[] =>
  reactionEntityId
    ? understanding.experiment_logic.condition_variations.filter((variation) =>
        variation.reaction_entity_id === reactionEntityId
        || variation.standard_reaction_entity_id === reactionEntityId
      )
    : [];

const getConditionVariationFacts = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId?: string
): JsonObject[] =>
  getConditionVariationsForReaction(understanding, reactionEntityId).map((variation) => ({
    condition_variation_entity_id: variation.condition_variation_entity_id,
    condition_variation_attempt_entity_id: variation.condition_variation_attempt_entity_id,
    attempt_id: variation.attempt_id,
    reaction_entity_id: variation.reaction_entity_id,
    result_entity_id: variation.result_entity_id,
    standard_reaction_entity_id: variation.standard_reaction_entity_id,
    condition: variation.condition,
    changed_variables: variation.changed_variables,
    confidence: variation.confidence,
    warnings: variation.warnings
  }));

const getImplicitConditionFacts = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId?: string
): JsonObject[] =>
  understanding.experiment_logic.implicit_condition_facts
    .filter((fact) => fact.reaction_entity_id === reactionEntityId)
    .map((fact) => ({
      reaction_entity_id: fact.reaction_entity_id,
      condition_variation_entity_id: fact.condition_variation_entity_id,
      condition_variation_attempt_entity_id: fact.condition_variation_attempt_entity_id,
      field: fact.field,
      value: fact.value,
      source: fact.source,
      confidence: fact.confidence,
      warnings: fact.warnings
    }));

const getReactionFacts = (reaction: TrainingReactionV1 | undefined): JsonObject => ({
  reaction_entity_id: reaction?.entity_id,
  name: reaction?.name,
  reactants: reaction?.reactants,
  products: reaction?.products,
  conditions_raw: reaction?.conditions_raw,
  normalized_conditions: reaction?.normalized_conditions
});

const getEntityById = (
  understanding: ChemdTrainingUnderstandingV1,
  entityId: string | undefined
): JsonObject | undefined => {
  if (!entityId) {
    return undefined;
  }

  const entity = [
    ...understanding.entities.molecules,
    ...understanding.entities.reactions,
    ...understanding.entities.results,
    ...understanding.entities.analyses,
    ...understanding.entities.samples,
    ...understanding.entities.artifacts,
    ...understanding.entities.condition_variations,
    ...understanding.entities.condition_variation_attempts,
    ...understanding.entities.narrative_blocks
  ].find((candidate) => candidate.entity_id === entityId);

  return entity as JsonObject | undefined;
};

const getOutcomeFacts = (
  outcome: TrainingOutcomeLogicV1 | undefined,
  quality: TrainingOutcomeQualityV1 | undefined
): JsonObject => ({
  status_label: outcome?.status_label,
  yield_percent: outcome?.yield_percent,
  conversion_percent: outcome?.conversion_percent,
  selectivity_percent: outcome?.selectivity_percent,
  purity_percent: outcome?.purity_percent,
  yield_confidence: quality?.yield_confidence,
  yield_basis: quality?.yield_basis,
  result_confirmed_by_analysis: quality?.result_confirmed_by_analysis
});

const mapYieldConfidence = (
  confidence: TrainingOutcomeQualityV1["yield_confidence"] | undefined
): TrainingInferenceConfidenceV1 | undefined => {
  if (confidence === "confirmed") {
    return "high";
  }

  if (confidence === "estimated") {
    return "medium";
  }

  return confidence === "unknown" ? "low" : undefined;
};

const getTaxonomyOutput = (taxonomy: TrainingReactionTaxonomyV1): JsonObject => ({
  reaction_family: taxonomy.reaction_family,
  transformation_tags: taxonomy.transformation_tags,
  confidence: taxonomy.confidence,
  warnings: taxonomy.warnings
});

const getRoutingOutput = (routing: TrainingExpertRoutingV1): JsonObject => ({
  expert_labels: routing.expert_labels,
  routing_basis: routing.routing_basis,
  confidence: routing.confidence,
  warnings: routing.warnings
});

const createExample = (input: CreateExampleInput): TrainingTaskExampleV1 => ({
  example_id: `${input.taskType}::${input.understanding.document.document_id}::${input.suffix}`,
  task_type: input.taskType,
  source_document_id: input.understanding.document.document_id,
  source_entity_ids: uniqueStrings(input.sourceEntityIds),
  split_hint: input.understanding.lora_generation_hints.split_hint,
  messages: [
    { role: "system", content: SYSTEM_PROMPTS[input.taskType] },
    { role: "user", content: toJson(input.input) },
    { role: "assistant", content: toJson(input.output) }
  ],
  quality: {
    supervision: "derived_from_training_understanding",
    usable_for_sft: (input.warnings ?? []).length === 0,
    usable_for_eval: input.usableForEval ?? false,
    ...(input.derivedLabelConfidence ? { derived_label_confidence: input.derivedLabelConfidence } : {}),
    warnings: input.warnings ?? []
  },
  evaluation: {
    holdout_eligible: input.usableForEval ?? false,
    leakage_risk: input.leakageRisk ?? "low",
    target_fields: input.targetFields ?? []
  }
});

const buildReactionClassificationExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.reaction_taxonomy.map((taxonomy) => {
    const reaction = getReaction(understanding, taxonomy.reaction_entity_id);

    return createExample({
      understanding,
      taskType: "reaction_classification",
      suffix: taxonomy.reaction_entity_id,
      sourceEntityIds: taxonomy.evidence_entity_ids,
      input: {
        task: "reaction_classification",
        reaction: getReactionFacts(reaction)
      },
      output: getTaxonomyOutput(taxonomy),
      warnings: taxonomy.warnings,
      targetFields: ["reaction_family", "transformation_tags"],
      leakageRisk: "low",
      usableForEval: taxonomy.warnings.length === 0 && taxonomy.confidence !== "unknown",
      derivedLabelConfidence: taxonomy.confidence
    });
  });

const buildRecordToChemdExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] => {
  const entityCounts = {
    molecules: understanding.entities.molecules.length,
    reactions: understanding.entities.reactions.length,
    results: understanding.entities.results.length,
    analyses: understanding.entities.analyses.length,
    samples: understanding.entities.samples.length,
    artifacts: understanding.entities.artifacts.length,
    condition_variations: understanding.entities.condition_variations.length,
    condition_variation_attempts: understanding.entities.condition_variation_attempts.length
  };
  const sourceEntityIds = uniqueStrings([
    ...understanding.entities.molecules.map((entity) => entity.entity_id),
    ...understanding.entities.reactions.map((entity) => entity.entity_id),
    ...understanding.entities.results.map((entity) => entity.entity_id),
    ...understanding.entities.analyses.map((entity) => entity.entity_id),
    ...understanding.entities.samples.map((entity) => entity.entity_id),
    ...understanding.entities.artifacts.map((entity) => entity.entity_id),
    ...understanding.entities.condition_variations.map((entity) => entity.entity_id),
    ...understanding.entities.condition_variation_attempts.map((entity) => entity.entity_id)
  ]);

  if (sourceEntityIds.length === 0) {
    return [];
  }

  return [createExample({
    understanding,
    taskType: "record_to_chemd",
    suffix: "document",
    sourceEntityIds,
    input: {
      task: "record_to_chemd",
      document: understanding.document,
      entity_counts: entityCounts,
      primary_entities: understanding.experiment_logic.primary_entities,
      canonical_summary: understanding.canonical_summary
    },
    output: {
      chemd_outline: {
        meta: {
          id: understanding.document.document_id,
          title: understanding.document.title,
          date: understanding.document.date
        },
        entities: entityCounts,
        relation_count: understanding.relations.length
      },
      omissions: understanding.knowledge_graph.missing_logic.map((item) => item.code)
    },
    warnings: understanding.knowledge_graph.missing_logic
      .filter((item) => item.severity === "error")
      .map((item) => item.code),
    targetFields: ["chemd_outline"],
    leakageRisk: "medium",
    usableForEval: false
  })];
};

const buildChemdRepairExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.knowledge_graph.missing_logic.map((issue) =>
    createExample({
      understanding,
      taskType: "chemd_repair",
      suffix: `${issue.code}::${issue.entity_id ?? "document"}::${issue.field ?? "record"}`,
      sourceEntityIds: issue.entity_id ? [issue.entity_id] : [],
      input: {
        task: "chemd_repair",
        issue,
        entity: getEntityById(understanding, issue.entity_id)
      },
      output: {
        repair_goal: issue.message,
        field_to_review: issue.field,
        minimal_action: "Add or correct the missing Chemd reference/field before using this record for supervised training.",
        requires_human_review: issue.severity !== "info"
      },
      warnings: issue.severity === "error" ? [issue.code] : [],
      targetFields: ["minimal_action"],
      leakageRisk: "low",
      usableForEval: false
    })
  );

const buildNormalizationExplanationExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.knowledge_graph.field_evidence
    .filter((evidence) => evidence.normalized)
    .map((evidence) =>
      createExample({
        understanding,
        taskType: "normalization_explanation",
        suffix: `${evidence.subject_entity_id}::${evidence.field}`,
        sourceEntityIds: evidence.evidence_entity_ids,
        input: {
          task: "normalization_explanation",
          subject_entity_id: evidence.subject_entity_id,
          field: evidence.field,
          raw_value: evidence.raw_value,
          source_span: evidence.source_span
        },
        output: {
          raw_value: evidence.raw_value,
          normalized_value: evidence.value,
          explanation: "The normalized value is derived directly from the Chemd field evidence and preserves the reported unit or percentage semantics."
        },
        targetFields: ["normalized_value"],
        leakageRisk: "low",
        usableForEval: Boolean(evidence.raw_value)
      })
    );

const buildProcedureReasoningExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.procedure_logic.procedure_to_steps.flatMap((pair) => {
    if (pair.steps.length === 0) {
      return [];
    }

    return [createExample({
      understanding,
      taskType: "procedure_reasoning",
      suffix: pair.pair_id,
      sourceEntityIds: pair.procedure_id ? [pair.procedure_id] : [],
      input: {
        task: "procedure_reasoning",
        source_text: pair.source_text,
        source_type: pair.source_type
      },
      output: {
        steps: pair.steps.map((step) => ({
          step_id: step.stepId,
          family: step.family,
          params: step.params,
          stage: step.stage,
          purpose: step.purpose,
          evidence: step.evidence,
          confidence: step.loweringConfidence
        }))
      },
      warnings: pair.low_confidence_step_count ? ["low_confidence_steps"] : [],
      targetFields: ["steps"],
      leakageRisk: "low",
      usableForEval: !pair.low_confidence_step_count,
      derivedLabelConfidence: pair.low_confidence_step_count ? "low" : "medium"
    })];
  });

const buildObservationEventExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.procedure_logic.observation_to_events.flatMap((pair) => {
    if (pair.events.length === 0) {
      return [];
    }

    return [createExample({
      understanding,
      taskType: "observation_events",
      suffix: pair.pair_id,
      sourceEntityIds: pair.observation_id ? [pair.observation_id] : [],
      input: {
        task: "observation_events",
        source_text: pair.source_text,
        ref_raw: pair.ref_raw,
        target_entity_id: pair.target_entity_id,
        target_entity_type: pair.target_entity_type,
        procedure_steps: understanding.procedure_logic.procedure_to_steps.flatMap((procedure) => procedure.steps)
      },
      output: {
        events: pair.events.map((event) => ({
          event_id: event.eventId,
          event_type: event.eventType,
          linked_step_id: event.linkedStepId,
          linked_step_family: event.linkedStepFamily,
          timepoint: event.timepoint,
          severity: event.severity,
          evidence: event.evidence,
          confidence: event.confidence
        }))
      },
      targetFields: ["events"],
      leakageRisk: "low",
      usableForEval: true,
      derivedLabelConfidence: "medium"
    })];
  });

const buildEvidenceTracingExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.knowledge_graph.field_evidence
    .filter((evidence) => evidence.evidence_entity_ids.some((entityId) => entityId !== evidence.subject_entity_id))
    .map((evidence) =>
      createExample({
        understanding,
        taskType: "evidence_tracing",
        suffix: `${evidence.subject_entity_id}::${evidence.field}`,
        sourceEntityIds: evidence.evidence_entity_ids,
        input: {
          task: "evidence_tracing",
          claim: {
            subject_entity_id: evidence.subject_entity_id,
            field: evidence.field,
            value: evidence.value
          },
          subject: getEntityById(understanding, evidence.subject_entity_id),
          evidence_entities: evidence.evidence_entity_ids
            .filter((entityId) => entityId !== evidence.subject_entity_id)
            .map((entityId) => getEntityById(understanding, entityId))
        },
        output: {
          supported_field: evidence.field,
          supported_value: evidence.value,
          direct_evidence_entity_ids: evidence.evidence_entity_ids.filter((entityId) => entityId !== evidence.subject_entity_id),
          source_relation_ids: evidence.source_relation_ids
        },
        targetFields: ["direct_evidence_entity_ids", "supported_value"],
        leakageRisk: "medium",
        usableForEval: false
      })
    );

const buildEvidenceInterpretationExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.evidence_interpretations.map((interpretation) =>
    createExample({
      understanding,
      taskType: "evidence_interpretation",
      suffix: interpretation.interpretation_id,
      sourceEntityIds: [interpretation.evidence_entity_id, interpretation.target_entity_id],
      input: {
        task: "evidence_interpretation",
        evidence_entity: getEntityById(understanding, interpretation.evidence_entity_id),
        target_entity: getEntityById(understanding, interpretation.target_entity_id),
        target_field: interpretation.target_field,
        source_refs: interpretation.source_refs
      },
      output: {
        interpretation_kind: interpretation.interpretation_kind,
        statement: interpretation.statement,
        extracted_signal: interpretation.extracted_signal
      },
      warnings: interpretation.warnings,
      targetFields: ["interpretation_kind", "statement"],
      leakageRisk: "medium",
      usableForEval: interpretation.warnings.length === 0,
      derivedLabelConfidence: interpretation.confidence
    })
  );

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const getEntityLabel = (entity: JsonObject): string | undefined =>
  stringValue(entity.name)
  ?? stringValue(entity.caption)
  ?? stringValue(entity.analysis_type)
  ?? stringValue(entity.artifact_kind)
  ?? stringValue(entity.original_id)
  ?? stringValue(entity.entity_id);

const summarizeEntity = (entityType: string, entity: JsonObject): JsonObject => ({
  entity_type: entityType,
  entity_id: entity.entity_id,
  original_id: entity.original_id,
  label: getEntityLabel(entity)
});

const getReferenceCandidateEntities = (understanding: ChemdTrainingUnderstandingV1): JsonObject[] => [
  ...understanding.entities.molecules.map((entity) => summarizeEntity("molecule", entity as JsonObject)),
  ...understanding.entities.reactions.map((entity) => summarizeEntity("reaction", entity as JsonObject)),
  ...understanding.entities.results.map((entity) => summarizeEntity("result", entity as JsonObject)),
  ...understanding.entities.analyses.map((entity) => summarizeEntity("analysis", entity as JsonObject)),
  ...understanding.entities.samples.map((entity) => summarizeEntity("sample", entity as JsonObject)),
  ...understanding.entities.artifacts.map((entity) => summarizeEntity("artifact", entity as JsonObject)),
  ...understanding.entities.condition_variations.map((entity) =>
    summarizeEntity("condition_variation", entity as JsonObject)
  ),
  ...understanding.entities.condition_variation_attempts.map((entity) =>
    summarizeEntity("condition_variation_attempt", entity as JsonObject)
  )
];

const getReferenceResolutionInput = (understanding: ChemdTrainingUnderstandingV1): JsonObject => ({
  task: "reference_resolution",
  document: understanding.document,
  references: understanding.resolved_references.map((reference) => ({
    raw: reference.raw,
    source_entity_id: reference.source_entity_id,
    source_entity_type: reference.source_entity_type,
    source_field: reference.source_field,
    target_field: reference.target_field
  })),
  candidate_entities: getReferenceCandidateEntities(understanding)
});

const getReferenceResolutionOutput = (understanding: ChemdTrainingUnderstandingV1): JsonObject => ({
  resolved_references: understanding.resolved_references.map((reference) => ({
    raw: reference.raw,
    source_entity_id: reference.source_entity_id,
    source_entity_type: reference.source_entity_type,
    source_field: reference.source_field,
    target_entity_id: reference.target_entity_id,
    target_original_id: reference.target_original_id,
    target_field: reference.target_field,
    relation_type: reference.relation_type,
    resolution_status: reference.resolution_status
  }))
});

const buildReferenceResolutionExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] => {
  if (understanding.resolved_references.length === 0) {
    return [];
  }

  const sourceEntityIds = uniqueStrings(understanding.resolved_references.flatMap((reference) => [
    reference.source_entity_id,
    ...(reference.target_entity_id ? [reference.target_entity_id] : [])
  ]));

  return [createExample({
    understanding,
    taskType: "reference_resolution",
    suffix: "document",
    sourceEntityIds,
    input: getReferenceResolutionInput(understanding),
    output: getReferenceResolutionOutput(understanding),
    targetFields: ["resolved_references"],
    leakageRisk: "medium",
    usableForEval: false,
    derivedLabelConfidence: "medium"
  })];
};

const getRelationExtractionInput = (understanding: ChemdTrainingUnderstandingV1): JsonObject => ({
  task: "relation_extraction",
  document: understanding.document,
  entities: getReferenceCandidateEntities(understanding),
  reference_facts: understanding.resolved_references.map((reference) => ({
    raw: reference.raw,
    source_entity_id: reference.source_entity_id,
    source_entity_type: reference.source_entity_type,
    source_field: reference.source_field,
    target_entity_id: reference.target_entity_id,
    target_original_id: reference.target_original_id,
    target_field: reference.target_field
  }))
});

const buildRelationExtractionExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] => {
  if (understanding.relations.length === 0) {
    return [];
  }

  return [createExample({
    understanding,
    taskType: "relation_extraction",
    suffix: "document",
    sourceEntityIds: uniqueStrings(understanding.relations.flatMap((relation) => [
      relation.from_entity_id,
      relation.to_entity_id
    ])),
    input: getRelationExtractionInput(understanding),
    output: {
      relations: understanding.relations
    },
    targetFields: ["relations"],
    leakageRisk: "medium",
    usableForEval: false,
    derivedLabelConfidence: "medium"
  })];
};

const buildQaWithContextExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] => {
  const summary = understanding.canonical_summary;
  if (!summary) {
    return [];
  }

  return [createExample({
    understanding,
    taskType: "qa_with_context",
    suffix: "canonical-summary",
    sourceEntityIds: summary.source_entity_ids,
    input: {
      task: "qa_with_context",
      question: "What are the main structured experiment facts available for this record?",
      context: {
        document: understanding.document,
        primary_entities: understanding.experiment_logic.primary_entities,
        relation_count: understanding.relations.length
      }
    },
    output: {
      answer: summary.text,
      evidence_entity_ids: summary.source_entity_ids
    },
    targetFields: ["answer"],
    leakageRisk: "low",
    usableForEval: true,
    derivedLabelConfidence: "medium"
  })];
};

const getProcedureFacts = (understanding: ChemdTrainingUnderstandingV1): JsonObject[] =>
  understanding.procedure_logic.procedure_to_steps.map((pair) => ({
    pair_id: pair.pair_id,
    source_type: pair.source_type,
    step_count: pair.steps.length,
    step_families: pair.steps.map((step) => step.family),
    stages: uniqueStrings(pair.steps.flatMap((step) => step.stage ? [step.stage] : [])),
    low_confidence_step_count: pair.low_confidence_step_count ?? 0
  }));

const getProcedureFlowFacts = (understanding: ChemdTrainingUnderstandingV1): JsonObject[] =>
  understanding.procedure_logic.procedure_to_steps.map((pair) => ({
    pair_id: pair.pair_id,
    source_type: pair.source_type,
    steps: pair.steps.map((step) => ({
      step_id: step.stepId,
      family: step.family,
      stage: step.stage,
      purpose: step.purpose,
      inputs: step.inputs?.map((input) => input.raw),
      outputs: step.outputs?.map((output) => output.raw),
      depends_on: step.dependsOn,
      evidence: step.evidence,
      artifact_count: step.artifacts?.length ?? 0,
      confidence: step.loweringConfidence
    }))
  }));

const buildExperimentIntentExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] => {
  const logic = understanding.experiment_logic;
  if (logic.intent_hypotheses.length === 0 && logic.causal_links.length === 0) {
    return [];
  }

  const sourceEntityIds = uniqueStrings([
    ...logic.intent_hypotheses.flatMap((intent) => intent.evidence_entity_ids),
    ...logic.variable_logic.flatMap((variable) => variable.evidence_entity_ids),
    ...logic.causal_links.flatMap((link) => link.evidence_entity_ids)
  ]);

  return [createExample({
    understanding,
    taskType: "experiment_intent",
    suffix: "document",
    sourceEntityIds,
    input: {
      task: "experiment_intent",
      document: understanding.document,
      reactions: understanding.entities.reactions.map(getReactionFacts),
      condition_variations: logic.condition_variations.map((variation) => ({
        condition_variation_entity_id: variation.condition_variation_entity_id,
        condition_variation_attempt_entity_id: variation.condition_variation_attempt_entity_id,
        attempt_id: variation.attempt_id,
        reaction_entity_id: variation.reaction_entity_id,
        result_entity_id: variation.result_entity_id,
        standard_reaction_entity_id: variation.standard_reaction_entity_id,
        condition: variation.condition,
        changed_variables: variation.changed_variables,
        confidence: variation.confidence,
        warnings: variation.warnings
      })),
      implicit_condition_facts: logic.implicit_condition_facts,
      outcomes: logic.outcomes.map((outcome) =>
        getOutcomeFacts(outcome, getOutcomeQuality(understanding, outcome.result_entity_id))
      ),
      procedure: getProcedureFacts(understanding),
      evidence_link_count: logic.evidence_links.length,
      sample_lineage_count: logic.sample_lineage.length,
      evidence_interpretation_count: logic.evidence_interpretations.length
    },
    output: {
      intent_hypotheses: logic.intent_hypotheses,
      variable_logic: logic.variable_logic,
      causal_links: logic.causal_links
    },
    targetFields: ["intent_hypotheses", "variable_logic", "causal_links"],
    leakageRisk: "medium",
    usableForEval: false,
    derivedLabelConfidence: "medium"
  })];
};

const buildMaterialFlowReasoningExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] => {
  const logic = understanding.experiment_logic;
  if (logic.material_flow_graph.edges.length === 0 && logic.step_dependencies.length === 0) {
    return [];
  }

  const sourceEntityIds = uniqueStrings([
    ...logic.material_flow_graph.edges.flatMap((edge) => edge.evidence_entity_ids),
    ...logic.step_dependencies.flatMap((edge) => edge.evidence_entity_ids)
  ]);

  return [createExample({
    understanding,
    taskType: "material_flow_reasoning",
    suffix: "document",
    sourceEntityIds,
    input: {
      task: "material_flow_reasoning",
      document: understanding.document,
      reactions: understanding.entities.reactions.map(getReactionFacts),
      samples: understanding.entities.samples.map((sample) => ({
        entity_id: sample.entity_id,
        name: sample.name,
        ref_raw: sample.ref_raw,
        derived_from_raw: sample.derived_from_raw,
        aliquot_of_raw: sample.aliquot_of_raw,
        batch_of_raw: sample.batch_of_raw,
        artifact_refs_raw: sample.artifact_refs_raw
      })),
      artifacts: understanding.entities.artifacts.map((artifact) => ({
        entity_id: artifact.entity_id,
        artifact_kind: artifact.artifact_kind,
        ref_raw: artifact.ref_raw
      })),
      sample_profiles: logic.sample_profiles,
      artifact_profiles: logic.artifact_profiles,
      relation_types: understanding.relations.map((relation) => relation.relation_type),
      procedure: getProcedureFlowFacts(understanding)
    },
    output: {
      material_flow_graph: logic.material_flow_graph,
      step_dependencies: logic.step_dependencies
    },
    targetFields: ["material_flow_graph", "step_dependencies"],
    leakageRisk: "medium",
    usableForEval: false,
    derivedLabelConfidence: "medium"
  })];
};

const buildExpertRoutingExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.expert_routing.map((routing) => {
    const reaction = getReaction(understanding, routing.reaction_entity_id);
    const context = getDesignContext(understanding, routing.reaction_entity_id);
    const taxonomy = understanding.experiment_logic.reaction_taxonomy.find((candidate) =>
      candidate.reaction_entity_id === routing.reaction_entity_id
    );

    return createExample({
      understanding,
      taskType: "expert_routing",
      suffix: routing.reaction_entity_id,
      sourceEntityIds: uniqueStrings([routing.reaction_entity_id, ...(context?.evidence_entity_ids ?? [])]),
      input: {
        task: "expert_routing",
        reaction: getReactionFacts(reaction),
        taxonomy: taxonomy ? getTaxonomyOutput(taxonomy) : undefined,
        design_context: context
      },
      output: getRoutingOutput(routing),
      warnings: routing.warnings,
      targetFields: ["expert_labels"],
      leakageRisk: "low",
      usableForEval: routing.warnings.length === 0 && routing.confidence !== "unknown",
      derivedLabelConfidence: routing.confidence
    });
  });

const buildYieldPredictionExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.design_contexts.flatMap((context) => {
    const outcome = getOutcomeByResult(understanding, context.linked_result_entity_id);
    if (typeof outcome?.yield_percent !== "number") {
      return [];
    }

    const reaction = getReaction(understanding, context.reaction_entity_id);
    const quality = getOutcomeQuality(understanding, outcome.result_entity_id);

    return [createExample({
      understanding,
      taskType: "yield_prediction",
      suffix: outcome.result_entity_id,
      sourceEntityIds: [context.reaction_entity_id, outcome.result_entity_id],
      input: {
        task: "yield_prediction",
        reaction: getReactionFacts(reaction),
        design_context: context
      },
      output: {
        observed_outcome: getOutcomeFacts(outcome, quality),
        target_source: "linked_result",
        rationale: "Observed yield is derived from the linked result entity."
      },
      warnings: quality?.warnings ?? [],
      targetFields: ["observed_outcome.yield_percent"],
      leakageRisk: "medium",
      usableForEval: (quality?.warnings ?? []).length === 0,
      derivedLabelConfidence: mapYieldConfidence(quality?.yield_confidence)
    })];
  });

const getRecommendation = (
  outcome: TrainingOutcomeLogicV1,
  context: TrainingExperimentDesignContextV1
): string => {
  if (outcome.status_label === "failed") {
    return "Change one high-impact condition at a time and preserve controlled variables for diagnosis.";
  }

  if (typeof outcome.yield_percent === "number" && outcome.yield_percent < 50) {
    return "Use the current run as a low-yield baseline and vary one changed condition before broader optimization.";
  }

  return context.changed_variables.length > 0
    ? "Keep beneficial changed variables and confirm with a repeat or scale-adjusted run."
    : "Use this run as a baseline before proposing larger condition changes.";
};

const buildConditionRecommendationExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.design_contexts.flatMap((context) => {
    const outcome = getOutcomeByResult(understanding, context.linked_result_entity_id);
    if (!outcome) {
      return [];
    }

    const reaction = getReaction(understanding, context.reaction_entity_id);
    const quality = getOutcomeQuality(understanding, outcome.result_entity_id);
    const conditionVariations = getConditionVariationFacts(understanding, context.reaction_entity_id);
    const implicitConditionFacts = getImplicitConditionFacts(understanding, context.reaction_entity_id);

    return [createExample({
      understanding,
      taskType: "condition_recommendation",
      suffix: outcome.result_entity_id,
      sourceEntityIds: uniqueStrings([
        context.reaction_entity_id,
        outcome.result_entity_id,
        ...conditionVariations.flatMap((variation) =>
          typeof variation.condition_variation_entity_id === "string"
            ? [
                variation.condition_variation_entity_id,
                ...(typeof variation.condition_variation_attempt_entity_id === "string"
                  ? [variation.condition_variation_attempt_entity_id]
                  : [])
              ]
            : []
        )
      ]),
      input: {
        task: "condition_recommendation",
        reaction: getReactionFacts(reaction),
        observed_outcome: getOutcomeFacts(outcome, quality),
        design_context: context,
        condition_variations: conditionVariations,
        implicit_condition_facts: implicitConditionFacts
      },
      output: {
        recommendation: getRecommendation(outcome, context),
        preserve: context.controlled_variables,
        review_first: quality?.warnings ?? []
      },
      warnings: quality?.warnings ?? [],
      targetFields: ["recommendation"],
      leakageRisk: "medium",
      usableForEval: false
    })];
  });

const buildExperimentProposalExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.design_contexts.flatMap((context) => {
    const procedure = understanding.procedure_logic.procedure_to_steps[0];
    const outcome = getOutcomeByResult(understanding, context?.linked_result_entity_id);
    if (!context || !outcome) {
      return [];
    }

    const quality = getOutcomeQuality(understanding, outcome.result_entity_id);
    const sourceEntityIds = [
      context.reaction_entity_id,
      outcome.result_entity_id,
      ...(procedure ? [procedure.pair_id] : [])
    ];

    return [createExample({
      understanding,
      taskType: "experiment_proposal",
      suffix: context.context_id,
      sourceEntityIds,
      input: {
        task: "experiment_proposal",
        current_design: context,
        current_outcome: getOutcomeFacts(outcome, quality),
        procedure_step_count: procedure?.steps.length ?? 0
      },
      output: {
        proposal_strategy: getRecommendation(outcome, context),
        assumptions: ["Derived proposal requires human chemistry review before execution."],
        risks: quality?.warnings ?? []
      },
      warnings: quality?.warnings ?? [],
      targetFields: ["proposal_strategy"],
      leakageRisk: "medium",
      usableForEval: false
    })];
  });

const buildFailureAnalysisExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.failure_signals.flatMap((failure) => {
    const outcome = getOutcomeByResult(understanding, failure.result_entity_id);
    if (!outcome) {
      return [];
    }

    const context = outcome.reaction_entity_id
      ? getDesignContext(understanding, outcome.reaction_entity_id)
      : undefined;
    const quality = getOutcomeQuality(understanding, outcome.result_entity_id);
    const sourceEntityIds = uniqueStrings([
      failure.result_entity_id,
      ...(failure.reaction_entity_id ? [failure.reaction_entity_id] : []),
      ...failure.evidence_entity_ids
    ]);

    return [createExample({
      understanding,
      taskType: "failure_analysis",
      suffix: outcome.result_entity_id,
      sourceEntityIds,
      input: {
        task: "failure_analysis",
        design_context: context,
        observed_outcome: getOutcomeFacts(outcome, quality),
        failure_signal: failure,
        missing_logic: understanding.knowledge_graph.missing_logic
      },
      output: {
        failure_modes: failure.failure_modes,
        evidence: failure.warnings,
        recommended_checks: failure.recommended_checks,
        hypothesis: "Failure analysis is derived from status labels, outcome quality, and linked evidence only."
      },
      warnings: uniqueStrings([...(quality?.warnings ?? []), ...failure.warnings]),
      targetFields: ["failure_modes", "recommended_checks"],
      leakageRisk: "medium",
      usableForEval: failure.warnings.length === 0,
      derivedLabelConfidence: failure.confidence
    })];
  });

const buildExperimentComparisonExamples = (
  understanding: ChemdTrainingUnderstandingV1
): TrainingTaskExampleV1[] =>
  understanding.experiment_logic.design_contexts.flatMap((context) => {
    if (!context.baseline_reaction_entity_id) {
      return [];
    }

    const baselineOutcome = getOutcomeByReaction(understanding, context.baseline_reaction_entity_id);
    const candidateOutcome = getOutcomeByReaction(understanding, context.reaction_entity_id);
    if (!baselineOutcome || !candidateOutcome) {
      return [];
    }

    const delta = typeof baselineOutcome.yield_percent === "number" && typeof candidateOutcome.yield_percent === "number"
      ? Number((candidateOutcome.yield_percent - baselineOutcome.yield_percent).toFixed(4))
      : null;
    const baselineQuality = getOutcomeQuality(understanding, baselineOutcome.result_entity_id);
    const candidateQuality = getOutcomeQuality(understanding, candidateOutcome.result_entity_id);
    const conditionVariations = getConditionVariationFacts(understanding, context.reaction_entity_id);
    const implicitConditionFacts = getImplicitConditionFacts(understanding, context.reaction_entity_id);
    const warnings = uniqueStrings([
      ...(baselineQuality?.warnings ?? []),
      ...(candidateQuality?.warnings ?? [])
    ]);

    return [createExample({
      understanding,
      taskType: "experiment_comparison",
      suffix: context.reaction_entity_id,
      sourceEntityIds: uniqueStrings([
        context.baseline_reaction_entity_id,
        context.reaction_entity_id,
        baselineOutcome.result_entity_id,
        candidateOutcome.result_entity_id,
        ...conditionVariations.flatMap((variation) =>
          typeof variation.condition_variation_entity_id === "string"
            ? [
                variation.condition_variation_entity_id,
                ...(typeof variation.condition_variation_attempt_entity_id === "string"
                  ? [variation.condition_variation_attempt_entity_id]
                  : [])
              ]
            : []
        )
      ]),
      input: {
        task: "experiment_comparison",
        changed_variables: context.changed_variables,
        controlled_variables: context.controlled_variables,
        condition_variations: conditionVariations,
        implicit_condition_facts: implicitConditionFacts,
        baseline_reaction: getReactionFacts(getReaction(understanding, context.baseline_reaction_entity_id)),
        candidate_reaction: getReactionFacts(getReaction(understanding, context.reaction_entity_id))
      },
      output: {
        baseline_outcome: getOutcomeFacts(baselineOutcome, baselineQuality),
        candidate_outcome: getOutcomeFacts(candidateOutcome, candidateQuality),
        yield_delta_percent: delta
      },
      warnings,
      targetFields: ["yield_delta_percent"],
      leakageRisk: "medium",
      usableForEval: warnings.length === 0 && delta !== null,
      derivedLabelConfidence: warnings.length === 0 ? "medium" : "low"
    })];
  });

const countEligible = (
  examples: TrainingTaskExampleV1[],
  key: "usable_for_sft" | "usable_for_eval"
): number => examples.filter((example) => example.quality[key]).length;

const countHoldoutEligible = (examples: TrainingTaskExampleV1[]): number =>
  examples.filter((example) => example.evaluation.holdout_eligible).length;

export const buildTrainingTaskDatasetFromUnderstanding = (
  understanding: ChemdTrainingUnderstandingV1
): ChemdTrainingTaskDatasetV1 => {
  const examples = [
    ...buildRecordToChemdExamples(understanding),
    ...buildChemdRepairExamples(understanding),
    ...buildNormalizationExplanationExamples(understanding),
    ...buildProcedureReasoningExamples(understanding),
    ...buildObservationEventExamples(understanding),
    ...buildEvidenceTracingExamples(understanding),
    ...buildEvidenceInterpretationExamples(understanding),
    ...buildReferenceResolutionExamples(understanding),
    ...buildRelationExtractionExamples(understanding),
    ...buildQaWithContextExamples(understanding),
    ...buildExperimentIntentExamples(understanding),
    ...buildMaterialFlowReasoningExamples(understanding),
    ...buildReactionClassificationExamples(understanding),
    ...buildExpertRoutingExamples(understanding),
    ...buildYieldPredictionExamples(understanding),
    ...buildConditionRecommendationExamples(understanding),
    ...buildExperimentProposalExamples(understanding),
    ...buildFailureAnalysisExamples(understanding),
    ...buildExperimentComparisonExamples(understanding)
  ];

  return {
    schema_version: "chemd-training-task-dataset/v0.1",
    document: understanding.document,
    examples,
    quality: {
      example_count: examples.length,
      task_types: uniqueStrings(examples.map((example) => example.task_type)) as ExperimentDecisionTaskTypeV1[],
      sft_eligible_count: countEligible(examples, "usable_for_sft"),
      eval_eligible_count: countEligible(examples, "usable_for_eval"),
      holdout_eligible_count: countHoldoutEligible(examples),
      warnings: understanding.quality.warnings
    }
  };
};

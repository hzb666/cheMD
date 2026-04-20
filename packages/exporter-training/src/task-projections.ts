import type {
  ChemdTrainingTaskDatasetV1,
  ChemdTrainingUnderstandingV1,
  ExperimentDecisionTaskTypeV1,
  TrainingExpertRoutingV1,
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

const getReactionFacts = (reaction: TrainingReactionV1 | undefined): JsonObject => ({
  reaction_entity_id: reaction?.entity_id,
  name: reaction?.name,
  reactants: reaction?.reactants,
  products: reaction?.products,
  conditions_raw: reaction?.conditions_raw,
  normalized_conditions: reaction?.normalized_conditions
});

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

    return [createExample({
      understanding,
      taskType: "condition_recommendation",
      suffix: outcome.result_entity_id,
      sourceEntityIds: [context.reaction_entity_id, outcome.result_entity_id],
      input: {
        task: "condition_recommendation",
        reaction: getReactionFacts(reaction),
        observed_outcome: getOutcomeFacts(outcome, quality),
        design_context: context
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
    const warnings = uniqueStrings([
      ...(baselineQuality?.warnings ?? []),
      ...(candidateQuality?.warnings ?? [])
    ]);

    return [createExample({
      understanding,
      taskType: "experiment_comparison",
      suffix: context.reaction_entity_id,
      sourceEntityIds: [
        context.baseline_reaction_entity_id,
        context.reaction_entity_id,
        baselineOutcome.result_entity_id,
        candidateOutcome.result_entity_id
      ],
      input: {
        task: "experiment_comparison",
        changed_variables: context.changed_variables,
        controlled_variables: context.controlled_variables,
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

import type {
  ChemdTrainingCampaignTaskDatasetV1,
  ChemdTrainingCampaignV1,
  ChemdTrainingUnderstandingV1,
  TrainingExperimentVariableDeltaV1,
  TrainingCampaignRunV1,
  TrainingCampaignTaskExampleV1,
  TrainingCrossDocumentTrajectoryV1,
  TrainingCampaignTrajectoryKindV1,
  TrainingInferenceConfidenceV1,
  TrainingReactionFamilyV1,
  TrainingReactionV1,
  TrainingTaskMessageV1
} from "./projection-types";

type JsonObject = Record<string, unknown>;
type ComparableValue = string | number | boolean | null;
type CampaignRunWithFields = TrainingCampaignRunV1 & {
  reaction_fields: Record<string, ComparableValue>;
};

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));
const isDefined = <T>(value: T | undefined | null): value is T => value !== undefined && value !== null;

const toJson = (value: JsonObject): string => JSON.stringify(value, null, 2);

const getReaction = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string
): TrainingReactionV1 | undefined =>
  understanding.entities.reactions.find((reaction) => reaction.entity_id === reactionEntityId);

const getReactionFamily = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string
): TrainingReactionFamilyV1 | undefined =>
  understanding.experiment_logic.reaction_taxonomy.find((item) => item.reaction_entity_id === reactionEntityId)?.reaction_family;

const getReactionSignature = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string
): string => {
  const reaction = getReaction(understanding, reactionEntityId);
  const taxonomy = understanding.experiment_logic.reaction_taxonomy.find((item) => item.reaction_entity_id === reactionEntityId);
  const reactants = reaction?.reactants.map((item) => item.target_original_id ?? item.raw).join("+") ?? "unknown-reactants";
  const products = reaction?.products.map((item) => item.target_original_id ?? item.raw).join("+") ?? "unknown-products";
  return `${taxonomy?.reaction_family ?? "unknown"}::${reactants}=>${products}`;
};

const getProcedureSignature = (understanding: ChemdTrainingUnderstandingV1): string | undefined => {
  const families = understanding.procedure_logic.procedure_to_steps
    .flatMap((pair) => pair.steps.map((step) => step.family));

  return families.length > 0 ? families.join(">") : undefined;
};

const joinParticipants = (
  participants: TrainingReactionV1["reactants"] | TrainingReactionV1["products"] | undefined
): string | null => participants?.map((item) => item.target_original_id ?? item.raw).join("+") ?? null;

const formatNormalizedQuantity = (
  value: TrainingReactionV1["normalized_conditions"]["temperature"]
  | TrainingReactionV1["normalized_conditions"]["time"]
  | TrainingReactionV1["normalized_conditions"]["pressure"]
): string | null => value ? `${value.value} ${value.unit}` : null;

const getReactionName = (reaction: TrainingReactionV1 | undefined): string | null => reaction?.name ?? null;

const getReactionSolvent = (reaction: TrainingReactionV1 | undefined): string | null =>
  reaction?.normalized_conditions.solvent?.normalized ?? null;

const getReactionCatalyst = (reaction: TrainingReactionV1 | undefined): string | null =>
  reaction?.normalized_conditions.catalyst?.normalized ?? null;

const getReactionReagents = (reaction: TrainingReactionV1 | undefined): string | null =>
  reaction?.normalized_conditions.reagents?.normalized.join(", ") ?? null;

const getReactionAtmosphere = (reaction: TrainingReactionV1 | undefined): string | null =>
  reaction?.normalized_conditions.atmosphere?.normalized ?? null;

const getReactionTemperature = (reaction: TrainingReactionV1 | undefined): string | null =>
  formatNormalizedQuantity(reaction?.normalized_conditions.temperature);

const getReactionTime = (reaction: TrainingReactionV1 | undefined): string | null =>
  formatNormalizedQuantity(reaction?.normalized_conditions.time);

const getReactionPressure = (reaction: TrainingReactionV1 | undefined): string | null =>
  formatNormalizedQuantity(reaction?.normalized_conditions.pressure);

const getReactionVariableMap = (reaction: TrainingReactionV1 | undefined): Record<string, ComparableValue> => ({
  reaction_name: getReactionName(reaction),
  reactants: joinParticipants(reaction?.reactants),
  products: joinParticipants(reaction?.products),
  solvent: getReactionSolvent(reaction),
  catalyst: getReactionCatalyst(reaction),
  reagents: getReactionReagents(reaction),
  atmosphere: getReactionAtmosphere(reaction),
  temperature: getReactionTemperature(reaction),
  time: getReactionTime(reaction),
  pressure: getReactionPressure(reaction)
});

const compareReactionFields = (
  baseline: Record<string, ComparableValue>,
  candidate: Record<string, ComparableValue>
): {
  changed: TrainingExperimentVariableDeltaV1[];
  controlled: string[];
} =>
  Object.keys(candidate).reduce(
    (result, field) => {
      if (baseline[field] === candidate[field]) {
        return baseline[field] === null
          ? result
          : { ...result, controlled: [...result.controlled, field] };
      }

      return {
        ...result,
        changed: [
          ...result.changed,
          {
            field,
            baseline_value: baseline[field],
            candidate_value: candidate[field]
          }
        ]
      };
    },
    { changed: [] as TrainingExperimentVariableDeltaV1[], controlled: [] as string[] }
  );

const getSeriesKey = (
  understanding: ChemdTrainingUnderstandingV1,
  reactionEntityId: string,
  baselineReactionEntityId?: string
): string => getReactionSignature(understanding, baselineReactionEntityId ?? reactionEntityId);

const buildCampaignRuns = (
  understandings: ChemdTrainingUnderstandingV1[]
): CampaignRunWithFields[] =>
  understandings.flatMap((understanding) =>
    understanding.experiment_logic.design_contexts.map((context) => {
      const outcome = understanding.experiment_logic.outcomes.find((item) =>
        item.result_entity_id === context.linked_result_entity_id
      );
      const intents = understanding.experiment_logic.intent_hypotheses
        .filter((item) => item.reaction_entity_id === context.reaction_entity_id)
        .map((item) => item.intent_kind);
      const failureModes = understanding.experiment_logic.failure_signals
        .filter((item) => item.reaction_entity_id === context.reaction_entity_id)
        .flatMap((item) => item.failure_modes);

      return {
        run_id: `${understanding.document.document_id}::${context.context_id}`,
        document_id: understanding.document.document_id,
        reaction_entity_id: context.reaction_entity_id,
        ...(context.linked_result_entity_id ? { result_entity_id: context.linked_result_entity_id } : {}),
        series_key: getSeriesKey(understanding, context.reaction_entity_id, context.baseline_reaction_entity_id),
        date: understanding.document.date,
        reaction_signature: getReactionSignature(understanding, context.reaction_entity_id),
        reaction_family: getReactionFamily(understanding, context.reaction_entity_id),
        procedure_signature: getProcedureSignature(understanding),
        changed_variables: context.changed_variables,
        controlled_variables: context.controlled_variables,
        ...(outcome?.status_label ? { status_label: outcome.status_label } : {}),
        ...(outcome ? { yield_percent: outcome.yield_percent } : {}),
        intent_kinds: uniqueStrings(intents) as TrainingCampaignRunV1["intent_kinds"],
        failure_modes: uniqueStrings(failureModes) as TrainingCampaignRunV1["failure_modes"],
        evidence_entity_ids: context.evidence_entity_ids,
        reaction_fields: getReactionVariableMap(getReaction(understanding, context.reaction_entity_id))
      };
    })
  );

const rankRunsByYield = (runs: TrainingCampaignRunV1[]): Map<string, number> => {
  const ranked = runs
    .filter((run): run is TrainingCampaignRunV1 & { yield_percent: number } => typeof run.yield_percent === "number")
    .sort((left, right) => right.yield_percent - left.yield_percent);

  return new Map(ranked.map((run, index) => [run.run_id, index + 1]));
};

const getOptimizationStrategyLabels = (runs: TrainingCampaignRunV1[]): string[] => uniqueStrings([
  ...(runs.some((run) => run.changed_variables.length > 1) ? ["multifactor_screen"] : []),
  ...(runs.some((run) => run.changed_variables.length === 1) ? ["single_factor_optimization"] : []),
  ...(runs.some((run) => run.failure_modes.includes("failed_status")) && runs.length > 1 ? ["failure_recovery"] : []),
  ...(runs.every((run) => run.changed_variables.length === 0) && runs.length > 1 ? ["reproducibility_check"] : [])
]);

const getFamilyStrategyLabels = (
  kind: Exclude<TrainingCampaignTrajectoryKindV1, "optimization">,
  runs: TrainingCampaignRunV1[]
): string[] => uniqueStrings([
  "procedure_template_reuse",
  ...(kind === "substrate_expansion" ? ["substrate_expansion"] : []),
  ...(runs.some((run) => run.failure_modes.includes("failed_status")) ? ["family_failure_comparison"] : [])
]);

const getTrajectoryRationale = (
  kind: TrainingCampaignTrajectoryKindV1,
  runs: TrainingCampaignRunV1[]
): string[] => {
  const changedFields = uniqueStrings(runs.flatMap((run) => run.changed_variables.map((item) => item.field)));
  const bestRun = runs
    .filter((run): run is TrainingCampaignRunV1 & { yield_percent: number } => typeof run.yield_percent === "number")
    .sort((left, right) => right.yield_percent - left.yield_percent)[0];
  const reactionFamilies = uniqueStrings(runs.map((run) => run.reaction_family).filter(isDefined));
  const procedureSignatures = uniqueStrings(runs.map((run) => run.procedure_signature).filter(isDefined));
  const reactionSignatures = uniqueStrings(runs.map((run) => run.reaction_signature).filter(isDefined));

  return uniqueStrings([
    `trajectory_kind:${kind}`,
    `documents:${uniqueStrings(runs.map((run) => run.document_id)).length}`,
    ...(reactionFamilies.length > 0 ? [`reaction_family:${reactionFamilies.join(",")}`] : []),
    ...(procedureSignatures.length > 0 ? [`procedure_signature:${procedureSignatures[0]}`] : []),
    ...(reactionSignatures.length > 0 ? [`reaction_signatures:${reactionSignatures.length}`] : []),
    ...(changedFields.length > 0 ? [`changed_fields:${changedFields.join(",")}`] : []),
    ...(bestRun ? [`best_yield:${bestRun.yield_percent}`] : [])
  ]);
};

const buildTrajectory = (
  kind: TrainingCampaignTrajectoryKindV1,
  seriesKey: string,
  runs: CampaignRunWithFields[]
): TrainingCrossDocumentTrajectoryV1 => {
  const orderedRuns = [...runs].sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.document_id.localeCompare(right.document_id)
    || left.run_id.localeCompare(right.run_id)
  );
  const baselineRun = kind === "optimization"
    ? orderedRuns.find((run) => run.changed_variables.length === 0) ?? orderedRuns[0]
    : undefined;
  const normalizedRuns = orderedRuns.map((run) => {
    if (kind !== "optimization" || run.run_id === baselineRun?.run_id || run.changed_variables.length > 0) {
      return run;
    }

    if (!baselineRun) {
      return run;
    }

    const recomputed = compareReactionFields(baselineRun.reaction_fields, run.reaction_fields);
    return {
      ...run,
      changed_variables: recomputed.changed,
      controlled_variables: recomputed.controlled
    };
  });
  const rankByYield = rankRunsByYield(normalizedRuns);
  const bestRun = normalizedRuns.find((run) => rankByYield.get(run.run_id) === 1);
  const strategyLabels = kind === "optimization"
    ? getOptimizationStrategyLabels(normalizedRuns)
    : getFamilyStrategyLabels(kind, normalizedRuns);
  const sharedFeatures = uniqueStrings([
    ...normalizedRuns.map((run) => run.reaction_family).filter(isDefined),
    ...normalizedRuns.map((run) => run.procedure_signature).filter(isDefined)
  ]);
  const reactionFamily = normalizedRuns.find((run) => run.reaction_family)?.reaction_family;
  const procedureSignature = normalizedRuns.find((run) => run.procedure_signature)?.procedure_signature;

  return {
    trajectory_id: `campaign-trajectory::${kind}::${seriesKey}`,
    trajectory_kind: kind,
    series_key: seriesKey,
    document_ids: uniqueStrings(normalizedRuns.map((run) => run.document_id)),
    ...(reactionFamily ? { reaction_family: reactionFamily } : {}),
    ...(procedureSignature ? { procedure_signature: procedureSignature } : {}),
    ...(baselineRun ? { baseline_run_id: baselineRun.run_id } : {}),
    ...(bestRun ? { best_run_id: bestRun.run_id } : {}),
    runs: normalizedRuns.map(({ reaction_fields: _reactionFields, ...run }) => run),
    shared_features: sharedFeatures,
    strategy_labels: strategyLabels,
    rationale: getTrajectoryRationale(kind, normalizedRuns),
    warnings: strategyLabels.length === 0 ? ["no_cross_document_strategy_inferred"] : []
  };
};

const buildOptimizationTrajectories = (runs: CampaignRunWithFields[]): TrainingCrossDocumentTrajectoryV1[] => {
  const grouped = new Map<string, CampaignRunWithFields[]>();
  runs.forEach((run) => {
    grouped.set(run.series_key, [...(grouped.get(run.series_key) ?? []), run]);
  });

  return Array.from(grouped.entries())
    .map(([seriesKey, seriesRuns]) => buildTrajectory("optimization", seriesKey, seriesRuns))
    .filter((trajectory) => uniqueStrings(trajectory.document_ids).length > 1);
};

const buildFamilyTrajectories = (runs: CampaignRunWithFields[]): TrainingCrossDocumentTrajectoryV1[] => {
  const grouped = new Map<string, CampaignRunWithFields[]>();

  runs.forEach((run) => {
    if (!run.reaction_family || !run.procedure_signature) {
      return;
    }

    const seriesKey = `family::${run.reaction_family}::${run.procedure_signature}`;
    grouped.set(seriesKey, [...(grouped.get(seriesKey) ?? []), run]);
  });

  return Array.from(grouped.entries()).flatMap(([seriesKey, seriesRuns]) => {
    const documentIds = uniqueStrings(seriesRuns.map((run) => run.document_id));
    const reactionSignatures = uniqueStrings(seriesRuns.map((run) => run.reaction_signature).filter((value): value is string => Boolean(value)));

    if (documentIds.length < 2 || reactionSignatures.length < 2) {
      return [];
    }

    const reactants = uniqueStrings(seriesRuns.map((run) => String(run.reaction_fields.reactants ?? "")).filter(Boolean));
    const products = uniqueStrings(seriesRuns.map((run) => String(run.reaction_fields.products ?? "")).filter(Boolean));
    const kind: Exclude<TrainingCampaignTrajectoryKindV1, "optimization"> =
      reactants.length > 1 || products.length > 1
        ? "substrate_expansion"
        : "procedure_template";

    return [buildTrajectory(kind, seriesKey, seriesRuns)];
  });
};

export const buildTrainingCampaignFromUnderstandings = (
  understandings: ChemdTrainingUnderstandingV1[]
): ChemdTrainingCampaignV1 => {
  const runs = buildCampaignRuns(understandings);
  const trajectories = Array.from(new Map([
    ...buildOptimizationTrajectories(runs),
    ...buildFamilyTrajectories(runs)
  ].map((trajectory) => [trajectory.trajectory_id, trajectory])).values());

  return {
    schema_version: "chemd-training-campaign/v0.1",
    campaign_id: uniqueStrings(understandings.map((item) => item.document.document_id)).join("+") || "empty-campaign",
    documents: understandings.map((item) => ({
      document_id: item.document.document_id,
      title: item.document.title,
      date: item.document.date
    })),
    trajectories
  };
};

const SYSTEM_PROMPT =
  "Infer cross-document experiment strategy from ordered Chemd experiment runs without inventing unsupported chemistry.";

const createCampaignExample = (
  trajectory: TrainingCrossDocumentTrajectoryV1,
  confidence: TrainingInferenceConfidenceV1
): TrainingCampaignTaskExampleV1 => {
  const input: JsonObject = {
    task: "cross_document_strategy",
    trajectory_kind: trajectory.trajectory_kind,
    series_key: trajectory.series_key,
    reaction_family: trajectory.reaction_family,
    procedure_signature: trajectory.procedure_signature,
    shared_features: trajectory.shared_features,
    documents: trajectory.document_ids,
    runs: trajectory.runs.map((run) => ({
      run_id: run.run_id,
      document_id: run.document_id,
      date: run.date,
      reaction_signature: run.reaction_signature,
      reaction_family: run.reaction_family,
      procedure_signature: run.procedure_signature,
      changed_variables: run.changed_variables,
      controlled_variables: run.controlled_variables,
      status_label: run.status_label,
      yield_percent: run.yield_percent,
      intent_kinds: run.intent_kinds,
      failure_modes: run.failure_modes
    }))
  };
  const output: JsonObject = {
    trajectory_kind: trajectory.trajectory_kind,
    strategy_labels: trajectory.strategy_labels,
    rationale: trajectory.rationale,
    baseline_run_id: trajectory.baseline_run_id,
    best_run_id: trajectory.best_run_id
  };

  return {
    example_id: `cross-document-strategy::${trajectory.trajectory_id}`,
    task_type: "cross_document_strategy",
    source_document_ids: trajectory.document_ids,
    source_entity_ids: uniqueStrings(trajectory.runs.flatMap((run) => [
      run.reaction_entity_id,
      ...(run.result_entity_id ? [run.result_entity_id] : [])
    ])),
    messages: [
      { role: "system", content: SYSTEM_PROMPT } as TrainingTaskMessageV1,
      { role: "user", content: toJson(input) } as TrainingTaskMessageV1,
      { role: "assistant", content: toJson(output) } as TrainingTaskMessageV1
    ],
    quality: {
      supervision: "derived_from_training_understanding",
      usable_for_sft: trajectory.warnings.length === 0,
      usable_for_eval: trajectory.warnings.length === 0,
      derived_label_confidence: confidence,
      warnings: trajectory.warnings
    },
    evaluation: {
      holdout_eligible: trajectory.warnings.length === 0,
      leakage_risk: "medium",
      target_fields: ["strategy_labels", "best_run_id"]
    }
  };
};

const countEligible = (
  examples: TrainingCampaignTaskExampleV1[],
  key: "usable_for_sft" | "usable_for_eval"
): number => examples.filter((example) => example.quality[key]).length;

export const buildTrainingCampaignTaskDataset = (
  understandings: ChemdTrainingUnderstandingV1[]
): ChemdTrainingCampaignTaskDatasetV1 => {
  const campaign = buildTrainingCampaignFromUnderstandings(understandings);
  const examples = campaign.trajectories.map((trajectory) =>
    createCampaignExample(trajectory, trajectory.warnings.length === 0 ? "medium" : "low")
  );

  return {
    schema_version: "chemd-training-campaign-task-dataset/v0.1",
    campaign_id: campaign.campaign_id,
    examples,
    quality: {
      example_count: examples.length,
      task_types: uniqueStrings(examples.map((example) => example.task_type)) as Array<TrainingCampaignTaskExampleV1["task_type"]>,
      sft_eligible_count: countEligible(examples, "usable_for_sft"),
      eval_eligible_count: countEligible(examples, "usable_for_eval"),
      holdout_eligible_count: examples.filter((example) => example.evaluation.holdout_eligible).length,
      warnings: campaign.trajectories.flatMap((trajectory) => trajectory.warnings)
    }
  };
};

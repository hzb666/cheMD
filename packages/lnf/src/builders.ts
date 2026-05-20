import type { Diagnostic } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode, ObservationEventNode, StepGraph } from "@chemd/step-ontology";
import type {
  TypedReactionNode,
  TypedResultNode,
  TypedSemanticNode
} from "@chemd/typechecker";
import type { PreflightResult, RunPlan, RuntimeStep } from "@chemd/runtime-lab";

import type {
  BuildLnfInput,
  ChemdLnf,
  LnfDocumentInfo,
  LnfMigrationSummary,
  LnfReaction,
  LnfResult,
  LnfRuntimePlanSummary,
  LnfRuntimeStepSummary,
  LnfRuntimeSummary,
  LnfStep,
  LnfStepSourceIndex
} from "./types";

const toDocumentInfo = (document: BuildLnfInput["document"]): LnfDocumentInfo => {
  if ("meta" in document) {
    return {
      id: document.meta.id,
      title: document.meta.title,
      date: document.meta.date
    };
  }

  return document;
};

const isReactionNode = (node: TypedSemanticNode): node is TypedReactionNode =>
  node.kind === "reaction";

const isResultNode = (node: TypedSemanticNode): node is TypedResultNode =>
  node.kind === "result";

const toLnfStep = (step: CanonicalStepNode): LnfStep => ({
  stepId: step.stepId,
  family: step.family,
  stage: step.stage,
  purpose: step.purpose,
  params: step.params,
  inputs: step.inputs,
  outputs: step.outputs,
  dependsOn: step.dependsOn,
  evidence: step.evidence,
  artifacts: step.artifacts,
  effects: step.effects,
  controlPath: step.controlPath,
  source: step.source,
  provenance: step.provenance,
  sourceNodeId: step.source.sourceNodeId,
  sourceType: step.source.sourceType,
  rawText: step.source.rawText,
  loweringConfidence: step.loweringConfidence
});

const toLnfReaction = (node: TypedReactionNode): LnfReaction => ({
  nodeId: node.nodeId,
  syntaxOrigin: node.syntaxOrigin,
  declaredKind: node.declaredKind,
  reactants: node.reactants,
  products: node.products,
  conditions: {
    solvent: node.solvent,
    catalyst: node.catalyst,
    reagents: node.reagents,
    atmosphere: node.atmosphere,
    temperature: node.temperature,
    time: node.time,
    pressure: node.pressure
  },
  normalizedConditions: node.normalizedConditions
});

const toLnfResult = (node: TypedResultNode): LnfResult => ({
  nodeId: node.nodeId,
  status: node.status,
  outcome: {
    yield: node.yield,
    conversion: node.conversion,
    selectivity: node.selectivity,
    purity: node.purity,
    isolatedMass: node.isolatedMass
  },
  notes: node.notes
});

const toObservationEvents = (stepGraph: StepGraph): ObservationEventNode[] =>
  stepGraph.observations.flatMap((observation) => observation.events);

const countDiagnostics = (
  diagnostics: Array<Diagnostic | V03Diagnostic>,
  code: string
): number => diagnostics.filter((diagnostic) => diagnostic.code === code).length;

const buildMigrationSummary = (
  diagnostics: Array<Diagnostic | V03Diagnostic>
): LnfMigrationSummary => ({
  legacyBlockCount: 0,
  missingKindCount: countDiagnostics(diagnostics, "W_CHEMD_KIND_AMBIGUOUS"),
  conflictCount: countDiagnostics(diagnostics, "E_CHEMD_KIND_CONFLICT")
});

const toRuntimeStepStates = (
  runtimeState: BuildLnfInput["runtimeState"]
): LnfRuntimeSummary["stepStates"] =>
  runtimeState?.stepStates.map((step) => ({
    stepId: step.stepId,
    status: step.status,
    startedAt: step.startedAt,
    endedAt: step.endedAt
  })) ?? [];

const countRuntimeSteps = (input: BuildLnfInput): number =>
  input.runPlan?.steps.length ?? input.runtimeState?.stepStates.length ?? 0;

const toRuntimeSummary = (input: BuildLnfInput): LnfRuntimeSummary | undefined => {
  if (!input.runtimeState) {
    return undefined;
  }

  const runtimeState = input.runtimeState;
  return {
    planId: runtimeState?.planId ?? input.runPlan?.planId,
    runId: runtimeState?.runId,
    mode: runtimeState?.mode,
    status: runtimeState?.status ?? input.runPlan?.status,
    currentStepId: runtimeState?.currentStepId,
    stepCount: countRuntimeSteps(input),
    traceCount: runtimeState?.trace.length ?? 0,
    stepStates: toRuntimeStepStates(runtimeState),
    controlStates: runtimeState.controlStates.map((control) => ({
      controlId: control.controlId,
      kind: control.kind,
      status: control.status,
      dynamic: control.dynamic
    }))
  };
};

const toStepSourceIndex = (
  steps: LnfStep[],
  observations: ObservationEventNode[]
): LnfStepSourceIndex => ({
  explicitStepIds: steps
    .filter((step) => step.sourceType === "explicit_step")
    .map((step) => step.stepId),
  loweredStepIds: steps
    .filter((step) => step.sourceType === "lowered_step")
    .map((step) => step.stepId),
  observationEvents: observations.map((observation) => ({
    observationId: observation.observationId,
    eventId: observation.eventId
  }))
});

const toRuntimeStepSummary = (step: RuntimeStep): LnfRuntimeStepSummary => ({
  stepId: step.stepId,
  order: step.order,
  status: step.status,
  requiredCapabilities: step.requiredCapabilities,
  requiresConfirmation: step.requiresConfirmation,
  confirmationStrategy: step.confirmationStrategy,
  sourceType: step.sourceType,
  dependsOn: step.dependsOn
});

const toRuntimePlanSummary = (runPlan: RunPlan): LnfRuntimePlanSummary => ({
  planId: runPlan.planId,
  documentId: runPlan.documentId,
  status: runPlan.status,
  stepCount: runPlan.steps.length,
  controlCount: runPlan.controls.length,
  diagnostics: runPlan.diagnostics,
  controls: runPlan.controls.map((control) => ({
    controlId: control.controlId,
    kind: control.kind,
    params: control.params,
    dynamic: control.dynamic,
    controlPath: control.controlPath,
    source: {
      sourceNodeType: "procedure",
      rawText: `control: ${control.kind}`
    }
  })),
  steps: runPlan.steps.map(toRuntimeStepSummary)
});

const shouldEmitRuntime = (
  runPlan: RunPlan | undefined,
  runtimeSummary: LnfRuntimeSummary | undefined,
  runtimePreflight: PreflightResult | undefined
): boolean => Boolean(runPlan || runtimeSummary || runtimePreflight);

export const buildCanonicalLnf = (input: BuildLnfInput): ChemdLnf => {
  const steps = input.stepGraph.steps.map(toLnfStep);
  const observations = toObservationEvents(input.stepGraph);
  const runtimeSummary = toRuntimeSummary(input);
  const runtime = shouldEmitRuntime(input.runPlan, runtimeSummary, input.runtimePreflight)
    ? {
        ...(input.runPlan ? { planSummary: toRuntimePlanSummary(input.runPlan) } : {}),
        ...(runtimeSummary ? { stateSummary: runtimeSummary } : {}),
        ...(input.runtimePreflight ? { preflight: input.runtimePreflight } : {})
      }
    : undefined;

  return {
    schemaVersion: "chemd-lnf/v0.5",
    experiment: {
      document: toDocumentInfo(input.document),
      entities: {
        reactions: input.typedGraph.nodes.filter(isReactionNode).map(toLnfReaction),
        results: input.typedGraph.nodes.filter(isResultNode).map(toLnfResult)
      },
      semantic: {
        typedGraph: input.typedGraph,
        quantities: input.typedGraph.quantities
      },
      workflow: {
        steps,
        controls: input.stepGraph.controls,
        observations,
        diagnostics: input.stepGraph.diagnostics,
        stepSources: toStepSourceIndex(steps, observations)
      },
      ...(runtime ? { runtime } : {}),
      quality: {
        diagnostics: input.diagnostics,
        migration: buildMigrationSummary(input.diagnostics)
      }
    }
  };
};

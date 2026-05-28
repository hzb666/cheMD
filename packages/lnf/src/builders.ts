import type { ObservationEventNode, CanonicalStepNode, StepGraph } from "@chemd/step-ontology";
import type { PreflightResult, RunPlan, RuntimeStep } from "@chemd/runtime-lab";

import {
  buildSourceCompleteness,
  declarationsOfKind,
  toAgentSection,
  toDeclarationIndexEntry,
  toDocumentInfo,
  toDocumentationLink,
  toLnfEntity,
  toProcedures
} from "./program-source";
import type {
  BuildLnfInput,
  ChemdLnf,
  LnfRuntimePlanSummary,
  LnfRuntimeStepSummary,
  LnfRuntimeSummary,
  LnfStep,
  LnfStepSourceIndex
} from "./types";

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

const toObservationEvents = (stepGraph: StepGraph): ObservationEventNode[] =>
  stepGraph.observations.flatMap((observation) => observation.events);

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
    planId: runtimeState.planId ?? input.runPlan?.planId,
    runId: runtimeState.runId,
    mode: runtimeState.mode,
    status: runtimeState.status ?? input.runPlan?.status,
    currentStepId: runtimeState.currentStepId,
    stepCount: countRuntimeSteps(input),
    traceCount: runtimeState.trace.length,
    stepStates: toRuntimeStepStates(runtimeState),
    controlStates: runtimeState.controlStates.map((control) => ({
      controlId: control.controlId,
      kind: control.kind,
      status: control.status,
      dynamic: control.dynamic
    }))
  };
};

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
  const agent = toAgentSection(input.document);

  return {
    schemaVersion: "chemd-lnf/v1.0",
    experiment: {
      document: toDocumentInfo(input),
      source: {
        module: input.document.module,
        meta: input.document.meta,
        declarationIndex: input.document.declarations.map(toDeclarationIndexEntry),
        documentation: input.document.docs
      },
      entities: {
        molecules: declarationsOfKind(input, "molecule")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "molecule")),
        materials: declarationsOfKind(input, "material")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "material")),
        batches: declarationsOfKind(input, "batch")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "batch")),
        reactions: declarationsOfKind(input, "reaction")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "reaction")),
        results: declarationsOfKind(input, "result")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "result")),
        analyses: declarationsOfKind(input, "analysis")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "analysis")),
        samples: declarationsOfKind(input, "sample")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "sample")),
        artifacts: declarationsOfKind(input, "artifact")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "artifact")),
        conditionScreens: declarationsOfKind(input, "condition_screen")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "condition_screen"))
      },
      semantic: {
        typedGraph: input.typedGraph,
        quantities: input.typedGraph.quantities,
        documentationLinks: input.document.docs.map(toDocumentationLink)
      },
      workflow: {
        procedures: toProcedures(input.stepGraph),
        steps,
        controls: input.stepGraph.controls,
        observations,
        traces: declarationsOfKind(input, "trace")
          .map((declaration) => toLnfEntity(declaration, input.typedGraph.nodes, "trace")),
        diagnostics: input.stepGraph.diagnostics,
        stepSources: toStepSourceIndex(steps, observations)
      },
      ...(agent ? { agent } : {}),
      ...(runtime ? { runtime } : {}),
      quality: {
        diagnostics: input.diagnostics,
        sourceCompleteness: buildSourceCompleteness(input)
      }
    }
  };
};

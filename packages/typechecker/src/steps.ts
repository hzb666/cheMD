import type { ProcedureNode } from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import {
  lowerProcedureToSteps,
  type CanonicalStepNode,
  type ProcedureLoweringResult,
  type StepInputNode,
  type StepFamily
} from "@chemd/step-ontology";

import {
  applyStepDefaults,
  createStepDiagnostic,
  isStepFamily,
  normalizeStepParams,
  validateAllowedParams,
  validateDependencyCycles,
  validateDependencyRefs,
  validateRequiredParams,
  validateStepIds
} from "./step-rules";
import { resolveStepInputs, resolveStepOutputs, resolveStepParamReferences } from "./step-references";
import type { ObjectNode, ProcedureMode, QuantityType } from "./types";

interface ExplicitProcedureResult {
  result: ProcedureLoweringResult;
  quantities: QuantityType[];
}

interface ExplicitStepContext {
  node: ProcedureNode;
  stepIndex: number;
  step: NonNullable<ProcedureNode["steps"]>[number];
  objectIndex?: Map<string, ObjectNode>;
}

interface ExplicitStepInputs {
  inputs?: StepInputNode[];
  diagnostics: V03Diagnostic[];
}

interface ResolvedStepParams {
  family: StepFamily;
  params: Record<string, unknown>;
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

interface ResolvedStepIo {
  inputs?: StepInputNode[];
  outputs?: CanonicalStepNode["outputs"];
  diagnostics: V03Diagnostic[];
}

const readStepId = (node: ProcedureNode, index: number, stepId: string | undefined): string =>
  stepId ?? `${node.id ?? "procedure"}:s${index + 1}`;

const buildExplicitStepInputs = (
  rawInputs: string[] | undefined,
  objectIndex: Map<string, ObjectNode> | undefined,
  stepId: string
): ExplicitStepInputs => {
  if (!rawInputs) {
    return { diagnostics: [] };
  }

  if (!objectIndex) {
    return { inputs: rawInputs.map((raw) => ({ raw })), diagnostics: [] };
  }

  return resolveStepInputs(rawInputs, objectIndex, stepId);
};

const buildExplicitStepOutputs = (
  rawOutputs: string[] | undefined,
  objectIndex: Map<string, ObjectNode> | undefined,
  stepId: string
): { outputs?: CanonicalStepNode["outputs"]; diagnostics: V03Diagnostic[] } => {
  if (!rawOutputs) {
    return { diagnostics: [] };
  }

  if (!objectIndex) {
    return { outputs: rawOutputs.map((raw) => ({ raw })), diagnostics: [] };
  }

  return resolveStepOutputs(rawOutputs, objectIndex, stepId);
};

const resolveExplicitStepParams = (
  stepId: string,
  step: NonNullable<ProcedureNode["steps"]>[number],
  objectIndex: Map<string, ObjectNode> | undefined
): ResolvedStepParams | { diagnostics: V03Diagnostic[]; quantities: QuantityType[] } => {
  if (!isStepFamily(step.family)) {
    return {
      quantities: [],
      diagnostics: [
        createStepDiagnostic(
          "E_STEP_INVALID_FAMILY",
          `Invalid procedure step family: ${step.family}`,
          stepId,
          { family: step.family }
        )
      ]
    };
  }

  const family: StepFamily = step.family;
  const normalized = normalizeStepParams(stepId, step.params);
  const defaultedParams = applyStepDefaults(family, normalized.params);
  const resolvedParams = objectIndex
    ? resolveStepParamReferences(defaultedParams, objectIndex, stepId)
    : { params: defaultedParams, diagnostics: [] };

  return {
    family,
    params: resolvedParams.params,
    quantities: normalized.quantities,
    diagnostics: [
      ...normalized.diagnostics,
      ...resolvedParams.diagnostics,
      ...validateAllowedParams(stepId, family, resolvedParams.params),
      ...validateRequiredParams(stepId, family, resolvedParams.params)
    ]
  };
};

const resolveExplicitStepIo = (
  stepId: string,
  step: NonNullable<ProcedureNode["steps"]>[number],
  objectIndex: Map<string, ObjectNode> | undefined
): ResolvedStepIo => {
  const stepInputs = buildExplicitStepInputs(step.inputs, objectIndex, stepId);
  const stepOutputs = buildExplicitStepOutputs(step.outputs, objectIndex, stepId);

  return {
    ...(stepInputs.inputs ? { inputs: stepInputs.inputs } : {}),
    ...(stepOutputs.outputs ? { outputs: stepOutputs.outputs } : {}),
    diagnostics: [...stepInputs.diagnostics, ...stepOutputs.diagnostics]
  };
};

const toExplicitStep = ({
  node,
  stepIndex,
  step,
  objectIndex
}: ExplicitStepContext): { step?: CanonicalStepNode; quantities: QuantityType[]; diagnostics: V03Diagnostic[] } => {
  const stepId = readStepId(node, stepIndex, step.stepId);
  const resolvedParams = resolveExplicitStepParams(stepId, step, objectIndex);
  if (!("family" in resolvedParams)) {
    return resolvedParams;
  }

  const resolvedIo = resolveExplicitStepIo(stepId, step, objectIndex);
  const diagnostics = [...resolvedParams.diagnostics, ...resolvedIo.diagnostics];

  return {
    quantities: resolvedParams.quantities,
    diagnostics,
    step: {
      stepId,
      family: resolvedParams.family,
      ...(step.stage ? { stage: step.stage } : {}),
      ...(step.purpose ? { purpose: step.purpose } : {}),
      params: resolvedParams.params,
      ...(resolvedIo.inputs ? { inputs: resolvedIo.inputs } : {}),
      ...(resolvedIo.outputs ? { outputs: resolvedIo.outputs } : {}),
      ...(step.dependsOn ? { dependsOn: step.dependsOn } : {}),
      ...(step.evidence ? { evidence: step.evidence } : {}),
      source: {
        sourceNodeType: "procedure",
        sourceNodeId: node.id,
        sourceType: "explicit_step",
        sentenceIndex: stepIndex,
        rawText: step.raw ?? `step: ${step.family}`,
        ...(step.sourceSpan ? { sourceSpan: step.sourceSpan } : {}),
        ...(step.provenance ? { provenance: step.provenance } : {})
      },
      ...(step.provenance ? { provenance: step.provenance } : {}),
      loweringConfidence: typeof step.confidence === "number" ? step.confidence : 1
    }
  };
};

const buildMissingExplicitProcedureResult = (node: ProcedureNode): ProcedureLoweringResult => ({
  procedureId: node.id,
  structureHint: "explicit_steps",
  sourceType: "explicit_steps",
  steps: [],
  diagnostics: [
    createV03Diagnostic({
      code: "E_STEP_MISSING_FIELD",
      severity: "error",
      message: "procedureMode=explicit requires procedure step entries.",
      sourceLayer: "typechecker",
      sourceNodeType: "procedure",
      sourceNodeId: node.id,
      sourceField: "step",
      facts: { field: "step" }
    })
  ],
  loweringConfidence: 0
});

const buildExplicitProcedureResult = (
  node: ProcedureNode,
  objectIndex?: Map<string, ObjectNode>
): ExplicitProcedureResult => {
  const diagnostics: V03Diagnostic[] = [];
  const quantities: QuantityType[] = [];
  const steps: CanonicalStepNode[] = [];

  node.steps?.forEach((step, index) => {
    const converted = toExplicitStep({ node, stepIndex: index, step, objectIndex });
    diagnostics.push(...converted.diagnostics);
    quantities.push(...converted.quantities);
    if (converted.step) {
      steps.push(converted.step);
    }
  });
  diagnostics.push(...validateStepIds(steps), ...validateDependencyRefs(steps), ...validateDependencyCycles(steps));

  return {
    quantities,
    result: {
      procedureId: node.id,
      structureHint: "explicit_steps",
      sourceType: "explicit_steps",
      steps,
      diagnostics,
      loweringConfidence: steps.length > 0 ? 1 : 0
    }
  };
};

export const resolveProcedureSteps = (
  node: ProcedureNode,
  procedureMode: ProcedureMode,
  objectIndex?: Map<string, ObjectNode>
): ExplicitProcedureResult => {
  if (procedureMode === "lowered") {
    return { result: lowerProcedureToSteps({ procedureId: node.id, body: node.body }), quantities: [] };
  }

  if (node.steps && node.steps.length > 0) {
    return buildExplicitProcedureResult(node, objectIndex);
  }

  if (procedureMode === "explicit") {
    return { result: buildMissingExplicitProcedureResult(node), quantities: [] };
  }

  return { result: lowerProcedureToSteps({ procedureId: node.id, body: node.body }), quantities: [] };
};

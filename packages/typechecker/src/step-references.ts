import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import type {
  StepInputNode,
  StepInputReference,
  StepOutputNode,
  StepReferenceTargetKind
} from "@chemd/step-ontology";

import { toReferenceOrLiteral } from "./references";
import type { ExternalTargetIndex, ObjectNode, ReferenceType } from "./types";

interface ResolvedStepInputs {
  inputs: StepInputNode[];
  diagnostics: V03Diagnostic[];
}

interface ResolvedStepOutputs {
  outputs: StepOutputNode[];
  diagnostics: V03Diagnostic[];
}

interface ResolvedStepParams {
  params: Record<string, unknown>;
  diagnostics: V03Diagnostic[];
}

const EXPECTED_STEP_INPUT_TARGET_KINDS = new Set(["molecule", "material", "batch"]);
const EXPECTED_STEP_INPUT_TARGET_KIND = "molecule|material|batch";

const toStepReferenceTargetKind = (
  targetKind: ReferenceType["targetKind"]
): StepReferenceTargetKind => {
  switch (targetKind) {
    case "molecule":
    case "material":
    case "batch":
    case "reaction":
    case "result":
    case "analysis":
    case "sample":
    case "artifact":
    case "condition_varies":
    case "condition_variation_attempt":
    case "template":
    case "unknown":
      return targetKind;
    default:
      return "unknown";
  }
};

const toStepInputReference = (reference: ReferenceType): StepInputReference => ({
  kind: "reference",
  refId: reference.refId,
  targetKind: toStepReferenceTargetKind(reference.targetKind),
  resolved: reference.resolved
});

const isValidStepInputReference = (reference: ReferenceType): boolean =>
  reference.resolved && EXPECTED_STEP_INPUT_TARGET_KINDS.has(reference.targetKind);

const isValidStepOutputReference = (reference: ReferenceType): boolean =>
  reference.resolved;

const createTypedReferenceMismatchDiagnostic = (
  stepId: string,
  raw: string,
  reference: ReferenceType,
  field = "inputs"
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_TYPED_REFERENCE_MISMATCH",
    severity: "error",
    message: field === "inputs"
      ? `Step input ${raw} must reference molecule, material, or batch.`
      : `Step ${field} references a missing object: ${raw}`,
    sourceLayer: "typechecker",
    sourceNodeType: "step",
    sourceNodeId: stepId,
    sourceField: field,
    facts: {
      field,
      raw_value: raw,
      ref_id: reference.refId,
      expected_target_kind: field === "inputs" ? EXPECTED_STEP_INPUT_TARGET_KIND : "object",
      actual_target_kind: reference.targetKind,
      resolved: reference.resolved
    }
  });

const resolveStepIo = (
  rawValues: string[],
  objectIndex: Map<string, ObjectNode>,
  externalTargetIndex: ExternalTargetIndex | undefined,
  stepId: string,
  field: "inputs" | "outputs"
): { values: StepInputNode[]; diagnostics: V03Diagnostic[] } => {
  const values: StepInputNode[] = [];
  const diagnostics: V03Diagnostic[] = [];

  for (const raw of rawValues) {
    const referenceOrLiteral = toReferenceOrLiteral(raw, objectIndex, externalTargetIndex);
    if (referenceOrLiteral.kind === "literal") {
      values.push({ raw });
      continue;
    }

    values.push({ raw, reference: toStepInputReference(referenceOrLiteral) });
    const validReference = field === "inputs"
      ? isValidStepInputReference(referenceOrLiteral)
      : isValidStepOutputReference(referenceOrLiteral);
    if (!validReference) {
      diagnostics.push(createTypedReferenceMismatchDiagnostic(stepId, raw, referenceOrLiteral, field));
    }
  }

  return { values, diagnostics };
};

export const resolveStepInputs = (
  rawInputs: string[],
  objectIndex: Map<string, ObjectNode>,
  externalTargetIndex: ExternalTargetIndex | undefined,
  stepId: string
): ResolvedStepInputs => {
  const resolved = resolveStepIo(rawInputs, objectIndex, externalTargetIndex, stepId, "inputs");

  return { inputs: resolved.values, diagnostics: resolved.diagnostics };
};

export const resolveStepOutputs = (
  rawOutputs: string[],
  objectIndex: Map<string, ObjectNode>,
  externalTargetIndex: ExternalTargetIndex | undefined,
  stepId: string
): ResolvedStepOutputs => {
  const resolved = resolveStepIo(rawOutputs, objectIndex, externalTargetIndex, stepId, "outputs");

  return { outputs: resolved.values, diagnostics: resolved.diagnostics };
};

export const resolveStepParamReferences = (
  params: Record<string, unknown>,
  objectIndex: Map<string, ObjectNode>,
  externalTargetIndex: ExternalTargetIndex | undefined,
  stepId: string
): ResolvedStepParams => {
  const resolvedParams: Record<string, unknown> = {};
  const diagnostics: V03Diagnostic[] = [];

  for (const [field, value] of Object.entries(params)) {
    if (typeof value !== "string" || !value.trim().startsWith("@")) {
      resolvedParams[field] = value;
      continue;
    }

    const reference = toReferenceOrLiteral(value, objectIndex, externalTargetIndex);
    resolvedParams[field] = reference;
    if (reference.kind === "reference" && !reference.resolved) {
      diagnostics.push(createTypedReferenceMismatchDiagnostic(stepId, value, reference, field));
    }
  }

  return { params: resolvedParams, diagnostics };
};

import type {
  ChemdValue,
  ProcedureDeclaration,
  ProcedureStatement
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalStepNode,
  StepFamily
} from "@chemd/step-ontology";
import { getEffectsForStep } from "@chemd/step-ontology";

import { collectQuantities } from "./program-field-graph";
import {
  createProgramDiagnostic,
  type ProgramSymbolTable
} from "./program-utils";
import {
  referenceToStepRef,
  valueToPrimitive,
  valuesToRawRecord,
  valuesToRecord
} from "./program-procedure-values";
import {
  applyStepDefaults,
  createStepDiagnostic,
  isStepFamily,
  normalizeStepParams,
  validateAllowedParams,
  validateRequiredParams
} from "./step-rules";
import type {
  ExternalTargetIndex,
  QuantityType,
  TypedStepNode
} from "./types";

export const buildProgramStep = (
  step: Extract<ProcedureStatement, { kind: "step" }>,
  procedure: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  diagnostics: V03Diagnostic[],
  controlPath: string[]
): CanonicalStepNode => {
  const family = isStepFamily(step.family) ? step.family : "observe";
  const params = buildProgramStepParams(step, family);
  if (family === "observe" && step.family !== "observe") {
    diagnostics.push(createProgramDiagnostic(
      "E_STEP_INVALID_FAMILY",
      `Invalid procedure step family: ${step.family}.`,
      procedure
    ));
  }
  diagnostics.push(...validateProgramStepSchema(step, family));
  return {
    stepId: step.id,
    family,
    params,
    effects: getEffectsForStep({ family, params }),
    inputs: step.inputs?.map((item) => ({
      raw: item.raw,
      reference: referenceToStepRef(item, symbols, externalTargetIndex)
    })),
    outputs: step.outputs?.map((item) => ({
      raw: item.raw,
      reference: referenceToStepRef(item, symbols, externalTargetIndex)
    })),
    dependsOn: step.dependsOn,
    evidence: step.evidence?.map((item) => item.target),
    ...(controlPath.length > 0 ? { controlPath } : {}),
    source: {
      sourceNodeType: "procedure",
      sourceNodeId: procedure.id,
      sourceType: "explicit_step",
      rawText: step.sourceSpan ? step.id : step.family,
      sourceSpan: step.sourceSpan
    },
    loweringConfidence: typeof step.confidence === "number" ? step.confidence : 1
  };
};

export const buildTypedStep = (
  step: CanonicalStepNode,
  procedure: ProcedureDeclaration,
  sourceSpan: ProcedureStatement["sourceSpan"]
): TypedStepNode => ({
  nodeId: step.stepId,
  kind: "step",
  sourceNodeType: "procedure",
  sourceMetadata: {
    sourceKind: "procedure_step",
    declarationKind: "procedure",
    declarationId: procedure.id,
    sourceSpan
  },
  stepId: step.stepId,
  family: step.family,
  params: step.params,
  effects: step.effects,
  inputs: step.inputs,
  outputs: step.outputs,
  dependsOn: step.dependsOn,
  evidence: step.evidence,
  source: step.source,
  confidence: step.loweringConfidence
});

export const collectProcedureQuantities = (
  declaration: ProcedureDeclaration
): QuantityType[] =>
  declaration.children.flatMap((statement) =>
    collectProcedureStatementQuantities(statement, declaration.id)
  );

const validateProgramStepSchema = (
  step: Extract<ProcedureStatement, { kind: "step" }>,
  family: StepFamily
): V03Diagnostic[] => {
  const normalized = normalizeStepParams(step.id, family, valuesToRawRecord(step.args));
  const defaultedParams = applyStepDefaults(family, {
    ...valuesToRecord(step.args),
    ...normalized.params
  });

  return [
    ...normalizeStepSchemaDiagnostics(step, normalized.diagnostics),
    ...validateAllowedParams(step.id, family, defaultedParams),
    ...validateRequiredParams(step.id, family, {
      params: defaultedParams,
      inputs: step.inputs,
      outputs: step.outputs
    })
  ];
};

const normalizeStepSchemaDiagnostics = (
  step: Extract<ProcedureStatement, { kind: "step" }>,
  diagnostics: V03Diagnostic[]
): V03Diagnostic[] => {
  const hasStepTypeMismatch = diagnostics.some((diagnostic) =>
    diagnostic.code === "E_STEP_PARAM_TYPE_MISMATCH"
  );
  const quantityDiagnostics = diagnostics.filter((diagnostic) =>
    diagnostic.code === "E403" && typeof diagnostic.sourceField === "string"
  );
  if (hasStepTypeMismatch || quantityDiagnostics.length === 0) {
    return diagnostics;
  }
  return [
    ...diagnostics,
    ...quantityDiagnostics.map((diagnostic) =>
      createStepDiagnostic(
        "E_STEP_PARAM_TYPE_MISMATCH",
        `Step ${step.id} parameter ${diagnostic.sourceField} has invalid quantity syntax`,
        step.id,
        {
          expected: diagnostic.facts?.expected_quantity_class ?? "quantity",
          field: diagnostic.sourceField,
          raw_value: diagnostic.facts?.raw_value
        }
      )
    )
  ];
};

const buildProgramStepParams = (
  step: Extract<ProcedureStatement, { kind: "step" }>,
  family: StepFamily
): Record<string, unknown> => {
  const normalized = normalizeStepParams(step.id, family, valuesToRawRecord(step.args));
  return applyStepDefaults(family, {
    ...valuesToRecord(step.args),
    ...normalized.params,
    ...preserveStructuredStepParams(step.args)
  });
};

const preserveStructuredStepParams = (
  args: Record<string, ChemdValue>
): Record<string, unknown> => {
  const preserved: Record<string, unknown> = {};
  for (const key of ["inputs", "outputs", "evidence"]) {
    if (args[key]) {
      preserved[key] = valueToPrimitive(args[key]);
    }
  }
  return preserved;
};

const collectProcedureStatementQuantities = (
  statement: ProcedureStatement,
  declarationId: string
): QuantityType[] => {
  if (statement.kind !== "step" && statement.kind !== "control") return [];
  const ownQuantities = Object.entries(statement.args).flatMap(([field, value]) =>
    collectQuantities(value, declarationId, field)
  );
  return statement.kind === "control"
    ? [
        ...ownQuantities,
        ...statement.children.flatMap((child) =>
          collectProcedureStatementQuantities(child, declarationId)
        )
      ]
    : ownQuantities;
};

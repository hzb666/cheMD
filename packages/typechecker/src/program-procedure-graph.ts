import type {
  ChemdDeclaration,
  ChemdValue,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalProcedureControlNode,
  CanonicalStepNode,
  ProcedureLoweringResult,
  StepFamily
} from "@chemd/step-ontology";

import { collectQuantities } from "./program-field-graph";
import {
  createProgramDiagnostic,
  sourceForDeclaration,
  valueToText,
  type ProgramSymbolTable
} from "./program-utils";
import type {
  QuantityType,
  TypedSemanticNode,
  TypedStepNode
} from "./types";

export interface ProcedureBuildResult {
  lowering: ProcedureLoweringResult;
  typedSteps: TypedStepNode[];
  quantities: QuantityType[];
}

const STEP_FAMILIES = new Set<StepFamily>([
  "charge",
  "add",
  "transfer",
  "mix",
  "cool",
  "heat",
  "hold",
  "purge",
  "quench",
  "extract",
  "wash",
  "separate_layers",
  "filter",
  "dry",
  "concentrate",
  "purify",
  "sample",
  "analyze",
  "observe",
  "store"
]);

export const buildProcedureDeclaration = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable
) => {
  const built = lowerProgramProcedure(declaration, symbols);
  const node: TypedSemanticNode = {
    nodeId: declaration.id,
    kind: "procedure_narrative",
    sourceNodeType: "procedure",
    sourceMetadata: sourceForDeclaration(declaration),
    declaredKind: declaration.kind,
    rawText: "",
    structureHint: "explicit_steps"
  };
  return {
    nodes: [node],
    quantities: [],
    diagnostics: [],
    procedure: built
  };
};

const lowerProgramProcedure = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable
): ProcedureBuildResult => {
  const diagnostics: V03Diagnostic[] = [];
  const steps: CanonicalStepNode[] = [];
  const typedSteps: TypedStepNode[] = [];
  const controls: CanonicalProcedureControlNode[] = [];
  for (const statement of declaration.children) {
    appendProcedureStatement(statement, declaration, symbols, steps, typedSteps, controls, diagnostics, []);
  }
  return {
    lowering: {
      procedureId: declaration.id,
      structureHint: "explicit_steps",
      sourceType: "explicit_steps",
      steps,
      controls,
      diagnostics,
      loweringConfidence: diagnostics.length > 0 ? 0.5 : 1
    },
    typedSteps,
    quantities: collectProcedureQuantities(declaration)
  };
};

const appendProcedureStatement = (
  statement: ProcedureStatement,
  procedure: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  steps: CanonicalStepNode[],
  typedSteps: TypedStepNode[],
  controls: CanonicalProcedureControlNode[],
  diagnostics: V03Diagnostic[],
  controlPath: string[]
): void => {
  if (statement.kind === "step") {
    const step = buildProgramStep(statement, procedure, symbols, diagnostics, controlPath);
    steps.push(step);
    typedSteps.push(buildTypedStep(step, procedure, statement.sourceSpan));
  } else if (statement.kind === "control") {
    const control = buildProgramControl(statement, procedure, controlPath);
    controls.push(control);
    const nestedPath = [...controlPath, control.controlId];
    for (const child of statement.children) {
      appendProcedureStatement(child, procedure, symbols, steps, typedSteps, controls, diagnostics, nestedPath);
    }
  }
};

const buildProgramStep = (
  step: Extract<ProcedureStatement, { kind: "step" }>,
  procedure: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: V03Diagnostic[],
  controlPath: string[]
): CanonicalStepNode => {
  const family = STEP_FAMILIES.has(step.family as StepFamily)
    ? step.family as StepFamily
    : "observe";
  if (family === "observe" && step.family !== "observe") {
    diagnostics.push(createProgramDiagnostic(
      "E_STEP_INVALID_FAMILY",
      `Invalid procedure step family: ${step.family}.`,
      procedure
    ));
  }
  return {
    stepId: step.id,
    family,
    params: valuesToRecord(step.args),
    inputs: step.inputs?.map((item) => ({ raw: item.raw, reference: referenceToStepRef(item, symbols) })),
    outputs: step.outputs?.map((item) => ({ raw: item.raw, reference: referenceToStepRef(item, symbols) })),
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

const buildProgramControl = (
  control: ProcedureControlDeclaration,
  procedure: ProcedureDeclaration,
  parentPath: string[]
): CanonicalProcedureControlNode => ({
  controlId: control.id ?? `${procedure.id}:${control.controlKind}`,
  kind: control.controlKind,
  params: valuesToRecord(control.args),
  controlPath: parentPath,
  dynamic: true,
  source: {
    sourceNodeType: "procedure",
    sourceNodeId: procedure.id,
    rawText: control.controlKind,
    sourceSpan: control.sourceSpan
  }
});

const buildTypedStep = (
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
  inputs: step.inputs,
  outputs: step.outputs,
  dependsOn: step.dependsOn,
  evidence: step.evidence,
  source: step.source,
  confidence: step.loweringConfidence
});

const collectProcedureQuantities = (
  declaration: ProcedureDeclaration
): QuantityType[] =>
  declaration.children.flatMap((statement) =>
    collectProcedureStatementQuantities(statement, declaration.id)
  );

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

const valuesToRecord = (values: Record<string, ChemdValue>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, valueToPrimitive(value)]));

const valueToPrimitive = (value: ChemdValue): unknown => {
  if (value.type === "list") return value.items.map(valueToPrimitive);
  if (value.type === "record") {
    return Object.fromEntries(value.fields.map((field) => [field.key, valueToPrimitive(field.value)]));
  }
  if (value.type === "reference") return `@${value.target}`;
  if (value.type === "call") {
    return {
      callee: value.callee,
      args: valuesToRecord(Object.fromEntries(value.args.map((arg) => [arg.name, arg.value])))
    };
  }
  if (value.type === "patch") return { target: value.target, value: valueToPrimitive(value.value) };
  return valueToText(value);
};

const referenceToStepRef = (
  reference: Extract<ChemdValue, { type: "reference" }>,
  symbols: ProgramSymbolTable
): NonNullable<CanonicalStepNode["inputs"]>[number]["reference"] => {
  const target = symbols.get(reference.target);
  return {
    kind: "reference",
    refId: reference.target,
    targetKind: toStepReferenceTargetKind(target?.kind),
    resolved: Boolean(target)
  };
};

const toStepReferenceTargetKind = (
  kind: ChemdDeclaration["kind"] | undefined
): NonNullable<NonNullable<CanonicalStepNode["inputs"]>[number]["reference"]>["targetKind"] => {
  if (kind === "condition_screen") return "condition_varies";
  if (
    kind === "molecule"
    || kind === "material"
    || kind === "batch"
    || kind === "reaction"
    || kind === "result"
    || kind === "analysis"
    || kind === "sample"
    || kind === "artifact"
  ) {
    return kind;
  }
  return "unknown";
};

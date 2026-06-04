import type {
  ChemdDeclaration,
  ChemdReferenceExpr,
  ChemdValue,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement,
  ReferenceTargetKind
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalProcedureControlNode,
  CanonicalStepNode,
  ProcedureLoweringResult,
  StepFamily,
  StepReferenceTargetKind
} from "@chemd/step-ontology";

import { collectQuantities } from "./program-field-graph";
import {
  createProgramDiagnostic,
  sourceForDeclaration,
  valueToText,
  type ProgramSymbolTable
} from "./program-utils";
import { createExternalTargetIndex } from "./references";
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
import type {
  ExternalTargetIndex,
  QuantityType,
  TypecheckOptions,
  TypedSemanticNode,
  TypedStepNode
} from "./types";

export interface ProcedureBuildResult {
  lowering: ProcedureLoweringResult;
  typedSteps: TypedStepNode[];
  quantities: QuantityType[];
}

const DYNAMIC_CONTROL_KINDS = new Set<ProcedureControlDeclaration["controlKind"]>([
  "until",
  "branch",
  "wait",
  "abort_if"
]);

export const buildProcedureDeclaration = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  options: Pick<TypecheckOptions, "procedureMode" | "referenceContext" | "reactionRouteContext"> = {}
) => {
  const built = lowerProgramProcedure(declaration, symbols, options);
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
    nodes: options.procedureMode === "lowered" ? [] : [node],
    quantities: [],
    diagnostics: [],
    procedure: built
  };
};

const lowerProgramProcedure = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  options: Pick<TypecheckOptions, "procedureMode" | "referenceContext" | "reactionRouteContext">
): ProcedureBuildResult => {
  const externalTargetIndex = createExternalTargetIndex(
    options.referenceContext,
    options.reactionRouteContext
  );
  const diagnostics: V03Diagnostic[] = [];
  const steps: CanonicalStepNode[] = [];
  const typedSteps: TypedStepNode[] = [];
  const controls: CanonicalProcedureControlNode[] = [];
  for (const statement of declaration.children) {
    appendProcedureStatement(statement, declaration, symbols, externalTargetIndex, steps, typedSteps, controls, diagnostics, []);
  }
  diagnostics.push(...validateProgramProcedure(declaration, steps, controls, options));
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

const validateProgramProcedure = (
  declaration: ProcedureDeclaration,
  steps: CanonicalStepNode[],
  controls: CanonicalProcedureControlNode[],
  options: Pick<TypecheckOptions, "procedureMode">
): V03Diagnostic[] => [
  ...(options.procedureMode === "explicit" && steps.length === 0
    ? [createProgramDiagnostic(
        "E_STEP_MISSING_FIELD",
        "procedureMode=explicit requires procedure step entries.",
        declaration,
        "step",
        "error",
        { field: "step" }
      )]
    : []),
  ...validateStepIds(steps),
  ...validateDependencyRefs(steps, controls.map((control) => control.controlId)),
  ...validateProgramControlIds(declaration, controls),
  ...validateProgramStepControlIdCollisions(declaration, steps, controls),
  ...validateDependencyCycles(steps)
];

const appendProcedureStatement = (
  statement: ProcedureStatement,
  procedure: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  steps: CanonicalStepNode[],
  typedSteps: TypedStepNode[],
  controls: CanonicalProcedureControlNode[],
  diagnostics: V03Diagnostic[],
  controlPath: string[],
  parentControlKind?: ProcedureControlDeclaration["controlKind"]
): void => {
  if (statement.kind === "step") {
    if (parentControlKind === "branch" || parentControlKind === "parallel") {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONTEXT",
        "error",
        `${parentControlKind} cannot contain direct step entries.`,
        procedure,
        undefined,
        { control_kind: parentControlKind, step_id: statement.id }
      ));
    }
    const step = buildProgramStep(statement, procedure, symbols, externalTargetIndex, diagnostics, controlPath);
    steps.push(step);
    typedSteps.push(buildTypedStep(step, procedure, statement.sourceSpan));
  } else if (statement.kind === "control") {
    const control = buildProgramControl(statement, procedure, controlPath);
    controls.push(control);
    diagnostics.push(...validateProgramControlShape(procedure, statement, symbols, externalTargetIndex, parentControlKind));
    const nestedPath = control.controlPath;
    for (const child of statement.children) {
      appendProcedureStatement(child, procedure, symbols, externalTargetIndex, steps, typedSteps, controls, diagnostics, nestedPath, statement.controlKind);
    }
  }
};

const buildProgramStep = (
  step: Extract<ProcedureStatement, { kind: "step" }>,
  procedure: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  diagnostics: V03Diagnostic[],
  controlPath: string[]
): CanonicalStepNode => {
  const family = isStepFamily(step.family)
    ? step.family
    : "observe";
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
    params: buildProgramStepParams(step, family),
    inputs: step.inputs?.map((item) => ({ raw: item.raw, reference: referenceToStepRef(item, symbols, externalTargetIndex) })),
    outputs: step.outputs?.map((item) => ({ raw: item.raw, reference: referenceToStepRef(item, symbols, externalTargetIndex) })),
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
): CanonicalProcedureControlNode => {
  const localId = readProgramControlId(control);
  const controlId = parentPath.length > 0 ? `${parentPath.join(".")}.${localId}` : localId;
  return {
    controlId,
    kind: control.controlKind,
    params: valuesToRecord(control.args),
    controlPath: [...parentPath, controlId],
    dynamic: DYNAMIC_CONTROL_KINDS.has(control.controlKind),
    source: {
      sourceNodeType: "procedure",
      sourceNodeId: procedure.id,
      rawText: `${control.controlKind}${control.id ? ` ${control.id}` : ""}`.trim(),
      sourceSpan: control.sourceSpan
    }
  };
};

const readProgramControlId = (control: ProcedureControlDeclaration): string =>
  control.id
  ?? (control.controlKind === "default" ? "default" : undefined)
  ?? `${control.controlKind}_${control.sourceSpan?.start ?? "auto"}`;

const validateProgramControlShape = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  parentControlKind?: ProcedureControlDeclaration["controlKind"]
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  const children = control.children.filter((child) => child.kind !== "doc");

  if (["case", "default"].includes(control.controlKind) && parentControlKind !== "branch") {
    diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONTEXT",
      "error",
      `${control.controlKind} control must be nested inside branch.`,
      procedure,
      control,
      { control_kind: control.controlKind, expected_parent: "branch", parent_control_kind: parentControlKind }
    ));
  }
  if (control.controlKind === "path" && parentControlKind !== "parallel") {
    diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONTEXT",
      "error",
      "path control must be nested inside parallel.",
      procedure,
      control,
      { control_kind: control.controlKind, expected_parent: "parallel", parent_control_kind: parentControlKind }
    ));
  }

  if (!control.id && !["case", "default", "path"].includes(control.controlKind)) {
    diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_ID",
      "error",
      `Procedure control ${control.controlKind} requires an id.`,
      procedure,
      control,
      { control_kind: control.controlKind }
    ));
  }

  if (control.controlKind === "repeat") {
    const count = readNumericControlParam(control, "count");
    if (!Number.isInteger(count) || (count ?? 0) <= 0) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_COUNT",
        "error",
        "repeat control requires a positive integer count.",
        procedure,
        control,
        { count: readControlParamText(control, "count") }
      ));
    }
    if (children.length === 0) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BODY",
        "error",
        "repeat body cannot be empty.",
        procedure,
        control
      ));
    }
  }

  if (control.controlKind === "until") {
    diagnostics.push(
      ...validateControlCondition(procedure, control, symbols, externalTargetIndex, "until requires condition.")
    );
    if (children.length === 0) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BODY",
        "error",
        "until body cannot be empty.",
        procedure,
        control
      ));
    }
    if (!control.args.max_iterations) {
      diagnostics.push(createProgramControlDiagnostic(
        "W_PROCEDURE_CONTROL_DYNAMIC",
        "warning",
        "until without max_iterations requires runtime review.",
        procedure,
        control
      ));
    }
  }

  if (control.controlKind === "branch") {
    const cases = children.filter(isProgramControlKind("case"));
    const defaults = children.filter(isProgramControlKind("default"));
    if (cases.length === 0 || defaults.length !== 1) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BRANCH",
        "error",
        "branch requires at least one case and exactly one default.",
        procedure,
        control
      ));
    }
    const defaultIndex = children.findIndex((child) =>
      child.kind === "control" && child.controlKind === "default"
    );
    if (defaultIndex >= 0 && defaultIndex !== children.length - 1) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BRANCH",
        "error",
        "branch default must be last.",
        procedure,
        control
      ));
    }
    diagnostics.push(...children
      .filter((child) => child.kind !== "control" || !["case", "default"].includes(child.controlKind))
      .map((child) => createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONTEXT",
        "error",
        "branch can only contain case/default controls.",
        procedure,
        control,
        { control_kind: "branch", child_kind: child.kind === "control" ? child.controlKind : child.kind }
      )));
    diagnostics.push(...validateSiblingProgramControlIds(procedure, cases));
  }

  if (control.controlKind === "case") {
    diagnostics.push(
      ...validateControlCondition(procedure, control, symbols, externalTargetIndex, "case requires condition.")
    );
  }
  if (control.controlKind === "default" && control.args.condition) {
    diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONDITION",
      "error",
      "default cannot define condition.",
      procedure,
      control,
      { condition: readControlParamText(control, "condition") }
    ));
  }

  if (control.controlKind === "parallel") {
    const paths = children.filter(isProgramControlKind("path"));
    if (paths.length < 2) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_PARALLEL",
        "error",
        "parallel requires at least two path blocks.",
        procedure,
        control
      ));
    }
    for (const path of paths) {
      if (!path.children.some((child) => child.kind !== "doc")) {
        diagnostics.push(createProgramControlDiagnostic(
          "E_PROCEDURE_CONTROL_BODY",
          "error",
          "parallel path body cannot be empty.",
          procedure,
          path
        ));
      }
    }
    diagnostics.push(...children
      .filter((child) => child.kind !== "control" || child.controlKind !== "path")
      .map((child) => createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONTEXT",
        "error",
        "parallel can only contain path controls.",
        procedure,
        control,
        { control_kind: "parallel", child_kind: child.kind === "control" ? child.controlKind : child.kind }
      )));
    diagnostics.push(...validateSiblingProgramControlIds(procedure, paths));
  }

  if (control.controlKind === "wait") {
    diagnostics.push(
      ...validateControlCondition(procedure, control, symbols, externalTargetIndex, "wait requires condition.")
    );
    if (children.length > 0) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BODY",
        "error",
        "wait cannot define a body.",
        procedure,
        control
      ));
    }
  }
  if (control.controlKind === "abort_if") {
    diagnostics.push(
      ...validateControlCondition(procedure, control, symbols, externalTargetIndex, "abort_if requires condition.")
    );
    if (children.length > 0) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BODY",
        "error",
        "abort_if cannot define a body.",
        procedure,
        control
      ));
    }
  }

  return diagnostics;
};

const isProgramControlKind = (
  controlKind: ProcedureControlDeclaration["controlKind"]
) => (
  statement: ProcedureStatement
): statement is ProcedureControlDeclaration =>
  statement.kind === "control" && statement.controlKind === controlKind;

const validateSiblingProgramControlIds = (
  procedure: ProcedureDeclaration,
  controls: ProcedureControlDeclaration[]
): V03Diagnostic[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const control of controls) {
    if (!control.id) continue;
    if (seen.has(control.id)) {
      duplicates.add(control.id);
    }
    seen.add(control.id);
  }

  return [...duplicates].map((controlId) =>
    createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_ID_DUPLICATE",
      "error",
      `Duplicate sibling control id: ${controlId}`,
      procedure,
      undefined,
      { control_id: controlId }
    )
  );
};

const validateControlCondition = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  missingMessage: string
): V03Diagnostic[] => {
  const condition = readControlParamText(control, "condition");
  if (!condition) {
    return [
      createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONDITION",
        "error",
        missingMessage,
        procedure,
        control
      )
    ];
  }

  const diagnostics: V03Diagnostic[] = [];
  const hasOperator = /(?:==|!=|<=|>=|<|>|\bexists\b|\bin\b|\bmatches\b|\band\b|\bor\b|\bnot\b)/.test(condition);
  const isRuntimeBoolean = /^(?:operator|sensor|time|run)\.[A-Za-z0-9_.-]+$/.test(condition.trim());
  if (!hasOperator && !isRuntimeBoolean) {
    diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONDITION",
      "error",
      `Control condition must be structured: ${condition}`,
      procedure,
      control,
      { condition }
    ));
  }

  const conditionWithoutRefs = condition.replace(/@[A-Za-z0-9_.#:-]+/g, "");
  const refs = Array.from(condition.matchAll(/@([A-Za-z0-9_.#:-]+)/g), (match) => match[1] ?? "");
  for (const ref of refs) {
    if (!isKnownConditionReference(ref, symbols, externalTargetIndex)) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONDITION",
        "error",
        `Control condition references unknown target: @${ref}`,
        procedure,
        control,
        { condition, ref }
      ));
    }
  }
  const runtimeNamespaces = Array.from(
    conditionWithoutRefs.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\.[A-Za-z0-9_.-]+/g),
    (match) => match[1] ?? ""
  );
  for (const namespace of runtimeNamespaces) {
    if (!["operator", "sensor", "time", "run"].includes(namespace)) {
      diagnostics.push(createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONDITION",
        "error",
        `Unknown runtime condition namespace: ${namespace}`,
        procedure,
        control,
        { condition, namespace }
      ));
    }
  }

  return diagnostics;
};

const isKnownConditionReference = (
  ref: string,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): boolean => {
  const externalKey = ref.includes("#")
    ? ref.split(".")[0] ?? ref
    : undefined;
  if (externalKey && externalTargetIndex.has(externalKey)) {
    return true;
  }
  const baseRef = ref.includes(".") ? ref.split(".")[0] : ref;
  return Boolean(baseRef && symbols.has(baseRef));
};

const readNumericControlParam = (
  control: ProcedureControlDeclaration,
  field: string
): number | undefined => {
  const value = control.args[field];
  return value?.type === "number" ? value.value : undefined;
};

const readControlParamText = (
  control: ProcedureControlDeclaration,
  field: string
): string | undefined =>
  valueToText(control.args[field]);

const createProgramControlDiagnostic = (
  code: string,
  severity: V03Diagnostic["severity"],
  message: string,
  procedure: ProcedureDeclaration,
  control?: ProcedureControlDeclaration,
  facts: Record<string, unknown> = {}
): V03Diagnostic =>
  createProgramDiagnostic(
    code,
    message,
    procedure,
    control?.controlKind ?? "control",
    severity,
    facts,
    control?.sourceSpan
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
  const quantityDiagnostic = diagnostics.find((diagnostic) =>
    diagnostic.code === "E403" && typeof diagnostic.sourceField === "string"
  );
  if (hasStepTypeMismatch || !quantityDiagnostic?.sourceField) {
    return diagnostics;
  }
  return [
    ...diagnostics,
    createStepDiagnostic(
      "E_STEP_PARAM_TYPE_MISMATCH",
      `Step ${step.id} parameter ${quantityDiagnostic.sourceField} has invalid quantity syntax`,
      step.id,
      {
        expected: quantityDiagnostic.facts?.expected_quantity_class ?? "quantity",
        field: quantityDiagnostic.sourceField,
        raw_value: quantityDiagnostic.facts?.raw_value
      }
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

const valuesToRawRecord = (values: Record<string, ChemdValue>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.raw]));

const validateProgramControlIds = (
  procedure: ProcedureDeclaration,
  controls: CanonicalProcedureControlNode[]
): V03Diagnostic[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const control of controls) {
    if (seen.has(control.controlId)) {
      duplicates.add(control.controlId);
    }
    seen.add(control.controlId);
  }

  return [...duplicates].map((controlId) =>
    createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_ID_DUPLICATE",
      "error",
      `Duplicate procedure control id: ${controlId}`,
      procedure,
      undefined,
      { control_id: controlId }
    )
  );
};

const validateProgramStepControlIdCollisions = (
  procedure: ProcedureDeclaration,
  steps: CanonicalStepNode[],
  controls: CanonicalProcedureControlNode[]
): V03Diagnostic[] => {
  const stepIds = new Set(steps.map((step) => step.stepId));
  return controls
    .filter((control) => stepIds.has(control.controlId))
    .map((control) =>
      createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_ID_DUPLICATE",
        "error",
        `Procedure step and control share id: ${control.controlId}`,
        procedure,
        undefined,
        { control_id: control.controlId }
      )
    );
};

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
  if (value.type === "reference") return referenceRaw(value);
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
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): NonNullable<CanonicalStepNode["inputs"]>[number]["reference"] => {
  if (reference.refKind === "external_document") {
    const refId = `${reference.externalDocumentId}#${reference.target}`;
    const target = externalTargetIndex.get(refId);
    return {
      kind: "reference",
      refId,
      targetKind: toStepReferenceTargetKind(target?.targetKind),
      resolved: Boolean(target)
    };
  }
  if (reference.refKind === "module") {
    const refId = `${reference.moduleName}.${reference.target}`;
    const target = symbols.get(refId);
    return {
      kind: "reference",
      refId,
      targetKind: toStepReferenceTargetKind(target?.kind),
      resolved: Boolean(target) || reference.resolved?.status === "resolved"
    };
  }
  const target = symbols.get(reference.target);
  return {
    kind: "reference",
    refId: reference.target,
    targetKind: toStepReferenceTargetKind(target?.kind),
    resolved: Boolean(target)
  };
};

const referenceRaw = (reference: ChemdReferenceExpr): string =>
  reference.raw
  || (reference.refKind === "external_document"
    ? `@${reference.externalDocumentId}#${reference.target}${reference.field ? `.${reference.field}` : ""}`
    : reference.refKind === "module"
      ? `@${reference.moduleName}.${reference.target}`
      : reference.refKind === "field"
        ? `@${reference.target}.${reference.field}`
        : `@${reference.target}`);

const toStepReferenceTargetKind = (
  kind: ChemdDeclaration["kind"] | ReferenceTargetKind | undefined
): StepReferenceTargetKind => {
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
    || kind === "condition_varies"
    || kind === "condition_variation_attempt"
    || kind === "template"
  ) {
    return kind;
  }
  return "unknown";
};

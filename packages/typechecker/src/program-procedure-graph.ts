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
import {
  validateDependencyCycles,
  validateDependencyRefs,
  validateStepIds
} from "./step-rules";
import type {
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

const DYNAMIC_CONTROL_KINDS = new Set<ProcedureControlDeclaration["controlKind"]>([
  "until",
  "branch",
  "wait",
  "abort_if"
]);

export const buildProcedureDeclaration = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  options: Pick<TypecheckOptions, "procedureMode"> = {}
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
  options: Pick<TypecheckOptions, "procedureMode">
): ProcedureBuildResult => {
  const diagnostics: V03Diagnostic[] = [];
  const steps: CanonicalStepNode[] = [];
  const typedSteps: TypedStepNode[] = [];
  const controls: CanonicalProcedureControlNode[] = [];
  for (const statement of declaration.children) {
    appendProcedureStatement(statement, declaration, symbols, steps, typedSteps, controls, diagnostics, []);
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
    diagnostics.push(...validateProgramControlShape(procedure, statement));
    const nestedPath = control.controlPath;
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
  control: ProcedureControlDeclaration
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  const children = control.children.filter((child) => child.kind !== "doc");

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
      ...validateControlCondition(procedure, control, "until requires condition.")
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
    diagnostics.push(...validateSiblingProgramControlIds(procedure, cases));
  }

  if (control.controlKind === "case") {
    diagnostics.push(
      ...validateControlCondition(procedure, control, "case requires condition.")
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
    diagnostics.push(...validateSiblingProgramControlIds(procedure, paths));
  }

  if (control.controlKind === "wait") {
    diagnostics.push(
      ...validateControlCondition(procedure, control, "wait requires condition.")
    );
  }
  if (control.controlKind === "abort_if") {
    diagnostics.push(
      ...validateControlCondition(procedure, control, "abort_if requires condition.")
    );
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

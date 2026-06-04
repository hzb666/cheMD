import type {
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { readNumericControlParam, readControlParamText } from "./program-procedure-control-conditions";
import { createProgramControlDiagnostic } from "./program-procedure-diagnostics";

export const validateControlPlacement = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  parentControlKind: ProcedureControlDeclaration["controlKind"] | undefined
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  if (["case", "default"].includes(control.controlKind) && parentControlKind !== "branch") {
    diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONTEXT",
      "error",
      `${control.controlKind} control must be nested inside branch.`,
      procedure,
      control,
      {
        control_kind: control.controlKind,
        expected_parent: "branch",
        parent_control_kind: parentControlKind
      }
    ));
  }
  if (control.controlKind === "path" && parentControlKind !== "parallel") {
    diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONTEXT",
      "error",
      "path control must be nested inside parallel.",
      procedure,
      control,
      {
        control_kind: control.controlKind,
        expected_parent: "parallel",
        parent_control_kind: parentControlKind
      }
    ));
  }
  return diagnostics;
};

export const validateControlId = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration
): V03Diagnostic[] =>
  !control.id && !["case", "default", "path"].includes(control.controlKind)
    ? [createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_ID",
        "error",
        `Procedure control ${control.controlKind} requires an id.`,
        procedure,
        control,
        { control_kind: control.controlKind }
      )]
    : [];

export const validateRepeatControl = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  children: ProcedureStatement[]
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
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
  return diagnostics;
};

export const validateUntilControl = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  children: ProcedureStatement[]
): V03Diagnostic[] => [
  ...(children.length === 0
    ? [createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BODY",
        "error",
        "until body cannot be empty.",
        procedure,
        control
      )]
    : []),
  ...(!control.args.max_iterations
    ? [createProgramControlDiagnostic(
        "W_PROCEDURE_CONTROL_DYNAMIC",
        "warning",
        "until without max_iterations requires runtime review.",
        procedure,
        control
      )]
    : [])
];

export const validateBranchControl = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  children: ProcedureStatement[]
): V03Diagnostic[] => {
  const cases = children.filter(isProgramControlKind("case"));
  const defaults = children.filter(isProgramControlKind("default"));
  const diagnostics = validateBranchCardinality(procedure, control, children, cases, defaults);
  return [
    ...diagnostics,
    ...children
      .filter((child) =>
        child.kind !== "control" || !["case", "default"].includes(child.controlKind)
      )
      .map((child) => createInvalidChildDiagnostic(procedure, control, child, "branch", "branch can only contain case/default controls.")),
    ...validateSiblingProgramControlIds(procedure, cases)
  ];
};

export const validateParallelControl = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  children: ProcedureStatement[]
): V03Diagnostic[] => {
  const paths = children.filter(isProgramControlKind("path"));
  return [
    ...(paths.length < 2
      ? [createProgramControlDiagnostic(
          "E_PROCEDURE_CONTROL_PARALLEL",
          "error",
          "parallel requires at least two path blocks.",
          procedure,
          control
        )]
      : []),
    ...paths
      .filter((path) => !path.children.some((child) => child.kind !== "doc"))
      .map((path) => createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BODY",
        "error",
        "parallel path body cannot be empty.",
        procedure,
        path
      )),
    ...children
      .filter((child) => child.kind !== "control" || child.controlKind !== "path")
      .map((child) => createInvalidChildDiagnostic(procedure, control, child, "parallel", "parallel can only contain path controls.")),
    ...validateSiblingProgramControlIds(procedure, paths)
  ];
};

export const validateBodylessControl = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  children: ProcedureStatement[],
  message: string
): V03Diagnostic[] =>
  children.length > 0
    ? [createProgramControlDiagnostic(
        "E_PROCEDURE_CONTROL_BODY",
        "error",
        message,
        procedure,
        control
      )]
    : [];

const validateBranchCardinality = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  children: ProcedureStatement[],
  cases: ProcedureControlDeclaration[],
  defaults: ProcedureControlDeclaration[]
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
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
  return diagnostics;
};

const createInvalidChildDiagnostic = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  child: ProcedureStatement,
  controlKind: string,
  message: string
): V03Diagnostic =>
  createProgramControlDiagnostic(
    "E_PROCEDURE_CONTROL_CONTEXT",
    "error",
    message,
    procedure,
    control,
    {
      control_kind: controlKind,
      child_kind: child.kind === "control" ? child.controlKind : child.kind
    }
  );

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

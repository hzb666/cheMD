import type {
  ChemdImportDeclaration,
  ProcedureControlDeclaration,
  ProcedureDeclaration
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalProcedureControlNode,
  CanonicalStepNode
} from "@chemd/step-ontology";

import { createProgramDiagnostic, type ProgramSymbolTable } from "./program-utils";
import { validateControlCondition, readControlParamText } from "./program-procedure-control-conditions";
import {
  validateBodylessControl,
  validateBranchControl,
  validateControlId,
  validateControlPlacement,
  validateParallelControl,
  validateRepeatControl,
  validateUntilControl
} from "./program-procedure-control-shapes";
import { createProgramControlDiagnostic } from "./program-procedure-diagnostics";
import { valuesToRecord } from "./program-procedure-values";
import {
  validateDependencyCycles,
  validateDependencyRefs,
  validateStepIds
} from "./step-rules";
import type {
  ExternalTargetIndex,
  TypecheckOptions
} from "./types";

const DYNAMIC_CONTROL_KINDS = new Set<ProcedureControlDeclaration["controlKind"]>([
  "until",
  "branch",
  "wait",
  "abort_if"
]);

export const buildProgramControl = (
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

export const validateProgramProcedure = (
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

export const validateProgramControlShape = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  parentControlKind: ProcedureControlDeclaration["controlKind"] | undefined,
  moduleImports: ChemdImportDeclaration[]
): V03Diagnostic[] => {
  const children = control.children.filter((child) => child.kind !== "doc");
  const diagnostics = [
    ...validateControlPlacement(procedure, control, parentControlKind),
    ...validateControlId(procedure, control)
  ];

  if (control.controlKind === "repeat") {
    diagnostics.push(...validateRepeatControl(procedure, control, children));
  }
  if (control.controlKind === "until") {
    diagnostics.push(
      ...conditionDiagnostics(procedure, control, symbols, externalTargetIndex, moduleImports, "until requires condition."),
      ...validateUntilControl(procedure, control, children)
    );
  }
  if (control.controlKind === "branch") {
    diagnostics.push(...validateBranchControl(procedure, control, children));
  }
  if (control.controlKind === "case") {
    diagnostics.push(...conditionDiagnostics(procedure, control, symbols, externalTargetIndex, moduleImports, "case requires condition."));
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
    diagnostics.push(...validateParallelControl(procedure, control, children));
  }
  if (control.controlKind === "wait") {
    diagnostics.push(
      ...conditionDiagnostics(procedure, control, symbols, externalTargetIndex, moduleImports, "wait requires condition."),
      ...validateBodylessControl(procedure, control, children, "wait cannot define a body.")
    );
  }
  if (control.controlKind === "abort_if") {
    diagnostics.push(
      ...conditionDiagnostics(procedure, control, symbols, externalTargetIndex, moduleImports, "abort_if requires condition."),
      ...validateBodylessControl(procedure, control, children, "abort_if cannot define a body.")
    );
  }

  return diagnostics;
};

const conditionDiagnostics = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  moduleImports: ChemdImportDeclaration[],
  missingMessage: string
): V03Diagnostic[] =>
  validateControlCondition(
    procedure,
    control,
    symbols,
    externalTargetIndex,
    moduleImports,
    missingMessage
  );

const readProgramControlId = (control: ProcedureControlDeclaration): string =>
  control.id
  ?? (control.controlKind === "default" ? "default" : undefined)
  ?? `${control.controlKind}_${control.sourceSpan?.start ?? "auto"}`;

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

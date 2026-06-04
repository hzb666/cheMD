import type {
  ChemdImportDeclaration,
  ProgramConditionExpression,
  ProcedureControlDeclaration,
  ProcedureDeclaration
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { valueToText, type ProgramSymbolTable } from "./program-utils";
import { validateConditionExpressionTypes } from "./program-procedure-condition-types";
import { createProgramControlDiagnostic } from "./program-procedure-diagnostics";
import type { ExternalTargetIndex } from "./types";

export const validateControlCondition = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  moduleImports: ChemdImportDeclaration[],
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
  const hasStructuredExpression = control.condition
    ? isStructuredCondition(control.condition)
    : /(?:==|!=|<=|>=|<|>|\bexists\b|\bin\b|\bmatches\b|\band\b|\bor\b|\bnot\b)/.test(condition);
  const isRuntimeBoolean = control.condition?.kind === "runtime_reference"
    || /^(?:operator|sensor|time|run)\.[A-Za-z0-9_.-]+$/.test(condition.trim());
  if (!hasStructuredExpression && !isRuntimeBoolean) {
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
  const refs = control.condition
    ? collectConditionReferences(control.condition)
    : Array.from(condition.matchAll(/@([A-Za-z0-9_.#:-]+)/g), (match) => match[1] ?? "");
  for (const ref of refs) {
    if (!isKnownConditionReference(ref, symbols, externalTargetIndex, moduleImports)) {
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

  return [
    ...diagnostics,
    ...validateRuntimeNamespaces(procedure, control, condition, conditionWithoutRefs),
    ...validateConditionExpressionTypes(procedure, control)
  ];
};

const isStructuredCondition = (
  expression: ProgramConditionExpression
): boolean =>
  expression.kind === "binary" || expression.kind === "unary";

const collectConditionReferences = (
  expression: ProgramConditionExpression
): string[] => {
  if (expression.kind === "reference") return [expression.refId];
  if (expression.kind === "binary") {
    return [
      ...collectConditionReferences(expression.left),
      ...collectConditionReferences(expression.right)
    ];
  }
  if (expression.kind === "unary") {
    return collectConditionReferences(expression.argument);
  }
  return [];
};

export const readNumericControlParam = (
  control: ProcedureControlDeclaration,
  field: string
): number | undefined => {
  const value = control.args[field];
  return value?.type === "number" ? value.value : undefined;
};

export const readControlParamText = (
  control: ProcedureControlDeclaration,
  field: string
): string | undefined =>
  valueToText(control.args[field]);

const validateRuntimeNamespaces = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  condition: string,
  conditionWithoutRefs: string
): V03Diagnostic[] => {
  const runtimeNamespaces = Array.from(
    conditionWithoutRefs.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\.[A-Za-z0-9_.-]+/g),
    (match) => match[1] ?? ""
  );
  return runtimeNamespaces
    .filter((namespace) => !["operator", "sensor", "time", "run"].includes(namespace))
    .map((namespace) => createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONDITION",
      "error",
      `Unknown runtime condition namespace: ${namespace}`,
      procedure,
      control,
      { condition, namespace }
    ));
};

const isKnownConditionReference = (
  ref: string,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex,
  moduleImports: ChemdImportDeclaration[]
): boolean => {
  const externalKey = ref.includes("#") ? firstReferenceSegment(ref) : undefined;
  if (externalKey && externalTargetIndex.has(externalKey)) {
    return true;
  }
  if (findKnownSymbolPrefix(ref, symbols)) {
    return true;
  }
  return isImportedModuleReference(ref, moduleImports);
};

const firstReferenceSegment = (ref: string): string | undefined =>
  ref.split(".")[0];

const findKnownSymbolPrefix = (
  ref: string,
  symbols: ProgramSymbolTable
): string | undefined => {
  const parts = ref.split(".");
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join(".");
    if (symbols.has(candidate)) return candidate;
  }
  return undefined;
};

const isImportedModuleReference = (
  ref: string,
  moduleImports: ChemdImportDeclaration[]
): boolean => {
  const [namespace, target] = ref.split(".");
  if (!namespace || !target) return false;
  return moduleImports.some((item) =>
    item.moduleName === namespace || item.alias === namespace
  );
};

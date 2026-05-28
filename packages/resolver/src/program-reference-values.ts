import type {
  ChemdCallExpr,
  ChemdRecordValue,
  ChemdReferenceExpr,
  ChemdValue,
  Diagnostic
} from "@chemd/core";

import type { ProgramSymbolTable } from "./program-index";
import { resolveProgramReference } from "./program-references";

export const resolveValueRecord = (
  values: Record<string, ChemdValue>,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): Record<string, ChemdValue> => Object.fromEntries(
  Object.entries(values).map(([key, value]) => [
    key,
    resolveValue(value, symbols, diagnostics)
  ])
);

export const resolveValue = (
  value: ChemdValue,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdValue => {
  if (value.type === "reference") {
    return resolveReference(value, symbols, diagnostics);
  }
  if (value.type === "list") {
    return {
      ...value,
      items: value.items.map((item) => resolveValue(item, symbols, diagnostics))
    };
  }
  if (value.type === "record") {
    return resolveRecordValue(value, symbols, diagnostics);
  }
  if (value.type === "call") {
    return resolveCallValue(value, symbols, diagnostics);
  }
  return value;
};

export const resolveReferenceList = (
  references: ChemdReferenceExpr[],
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdReferenceExpr[] => references.map((reference) =>
  resolveReference(reference, symbols, diagnostics)
);

export const resolveReference = (
  reference: ChemdReferenceExpr,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdReferenceExpr => {
  const resolution = resolveProgramReference(reference, symbols);
  if (resolution.status === "unresolved") {
    diagnostics.push({
      code: "E_UNRESOLVED_PROGRAM_REFERENCE",
      severity: "error",
      message: resolution.message ?? `Unable to resolve reference ${reference.raw}`,
      nodeId: reference.target,
      sourceLayer: "resolver",
      sourceSpan: reference.sourceSpan
    });
  }
  return {
    ...reference,
    resolved: resolution
  };
};

const resolveRecordValue = (
  value: ChemdRecordValue,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdRecordValue => ({
  ...value,
  fields: value.fields.map((field) => ({
    ...field,
    value: resolveValue(field.value, symbols, diagnostics)
  }))
});

const resolveCallValue = (
  value: ChemdCallExpr,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdCallExpr => ({
  ...value,
  args: value.args.map((arg) => ({
    ...arg,
    value: resolveValue(arg.value, symbols, diagnostics)
  }))
});

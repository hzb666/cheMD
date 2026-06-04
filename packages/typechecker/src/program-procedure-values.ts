import type {
  ChemdDeclaration,
  ChemdReferenceExpr,
  ChemdValue,
  ReferenceTargetKind
} from "@chemd/core";
import type {
  CanonicalStepNode,
  StepReferenceTargetKind
} from "@chemd/step-ontology";

import {
  valueToText,
  readImportedModuleReference,
  type ProgramSymbolTable
} from "./program-utils";
import type { ExternalTargetIndex } from "./types";

export const valuesToRawRecord = (
  values: Record<string, ChemdValue>
): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.raw]));

export const valuesToRecord = (
  values: Record<string, ChemdValue>
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, valueToPrimitive(value)]));

export const valueToPrimitive = (value: ChemdValue): unknown => {
  if (value.type === "list") return value.items.map(valueToPrimitive);
  if (value.type === "record") {
    return Object.fromEntries(
      value.fields.map((field) => [field.key, valueToPrimitive(field.value)])
    );
  }
  if (value.type === "reference") return referenceRaw(value);
  if (value.type === "call") {
    return {
      callee: value.callee,
      args: valuesToRecord(Object.fromEntries(
        value.args.map((arg) => [arg.name, arg.value])
      ))
    };
  }
  if (value.type === "patch") {
    return { target: value.target, value: valueToPrimitive(value.value) };
  }
  return valueToText(value);
};

export const referenceToStepRef = (
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
    const imported = readImportedModuleReference(reference);
    const moduleName = imported?.moduleName ?? reference.moduleName;
    const field = imported?.field ?? reference.field;
    const refId = `${moduleName}.${reference.target}${field ? `.${field}` : ""}`;
    const target = symbols.get(`${moduleName}.${reference.target}`);
    return {
      kind: "reference",
      refId,
      targetKind: toStepReferenceTargetKind(target?.kind),
      resolved: Boolean(target) || reference.resolved?.status === "resolved"
    };
  }
  const target = symbols.get(reference.target);
  const refId = reference.refKind === "field"
    ? `${reference.target}.${reference.field}`
    : reference.target;
  return {
    kind: "reference",
    refId,
    targetKind: toStepReferenceTargetKind(target?.kind),
    resolved: Boolean(target)
  };
};

const referenceRaw = (reference: ChemdReferenceExpr): string =>
  reference.raw
  || (reference.refKind === "external_document"
    ? `@${reference.externalDocumentId}#${reference.target}${reference.field ? `.${reference.field}` : ""}`
    : reference.refKind === "module"
      ? `@${reference.moduleName}.${reference.target}${reference.field ? `.${reference.field}` : ""}`
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

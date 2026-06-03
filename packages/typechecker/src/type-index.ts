import {
  getDeclarationFieldSchema,
  getDeclarationSchema,
  resolveDeclarationField,
  type ChemdDeclaration,
  type ChemdProgramDocument,
  type ChemdValue,
  type DeclarationFieldSchema,
  type DeclarationFieldValueSchema
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { hasFields } from "./program-utils";

export interface ProgramFieldTypeInfo {
  declarationKind: string;
  declarationId: string;
  field: string;
  canonicalField?: string;
  isAlias: boolean;
  required: boolean;
  expectedKind?: DeclarationFieldValueSchema["kind"];
  actualKind?: ChemdValue["type"] | "missing" | "property";
  valid: boolean;
  diagnosticCodes: string[];
}

export interface ProgramTypeIndex {
  schemaVersion: "chemd-type-index/v1";
  documentId: string;
  fields: ProgramFieldTypeInfo[];
}

export const buildProgramTypeIndex = (
  program: ChemdProgramDocument,
  diagnostics: readonly V03Diagnostic[] = []
): ProgramTypeIndex => ({
  schemaVersion: "chemd-type-index/v1",
  documentId: program.meta.id,
  fields: program.declarations.flatMap((declaration) =>
    buildDeclarationFieldTypes(declaration, diagnostics)
  )
});

const buildDeclarationFieldTypes = (
  declaration: ChemdDeclaration,
  diagnostics: readonly V03Diagnostic[]
): ProgramFieldTypeInfo[] => {
  const present = hasFields(declaration)
    ? Object.entries(declaration.fields).map(([field, value]) =>
        buildPresentFieldType(declaration, field, value, diagnostics)
      )
    : [];
  return [...present, ...buildMissingRequiredFieldTypes(declaration, diagnostics)];
};

const buildPresentFieldType = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue,
  diagnostics: readonly V03Diagnostic[]
): ProgramFieldTypeInfo => {
  const resolved = resolveDeclarationField(declaration.kind, field);
  const schema = getDeclarationFieldSchema(declaration.kind, field);
  const codes = diagnosticCodesForField(declaration.id, field, resolved?.canonicalName, diagnostics);

  return {
    declarationKind: declaration.kind,
    declarationId: declaration.id,
    field,
    canonicalField: resolved?.canonicalName,
    isAlias: resolved?.isAlias === true,
    required: schema?.required === true,
    expectedKind: schema?.value?.kind,
    actualKind: value.type,
    valid: resolved !== undefined && !hasErrorDiagnostic(codes),
    diagnosticCodes: codes
  };
};

const buildMissingRequiredFieldTypes = (
  declaration: ChemdDeclaration,
  diagnostics: readonly V03Diagnostic[]
): ProgramFieldTypeInfo[] => {
  if (!hasFields(declaration)) return [];
  return (getDeclarationSchema(declaration.kind)?.fields ?? [])
    .filter((field) => field.required && !hasFieldValue(declaration.fields, field))
    .map((field) => ({
      declarationKind: declaration.kind,
      declarationId: declaration.id,
      field: field.name,
      canonicalField: field.name,
      isAlias: false,
      required: true,
      expectedKind: field.value?.kind,
      actualKind: "missing" as const,
      valid: false,
      diagnosticCodes: diagnosticCodesForField(declaration.id, field.name, field.name, diagnostics)
    }));
};

const hasFieldValue = (
  fields: Record<string, ChemdValue>,
  schema: DeclarationFieldSchema
): boolean =>
  fields[schema.name] !== undefined || schema.aliases?.some((alias) => fields[alias] !== undefined) === true;

const diagnosticCodesForField = (
  declarationId: string,
  field: string,
  canonicalField: string | undefined,
  diagnostics: readonly V03Diagnostic[]
): string[] => diagnostics
  .filter((diagnostic) =>
    diagnostic.sourceNodeId === declarationId
      && (diagnostic.sourceField === field || diagnostic.sourceField === canonicalField)
  )
  .map((diagnostic) => diagnostic.code);

const hasErrorDiagnostic = (codes: string[]): boolean => codes.some((code) => code.startsWith("E"));

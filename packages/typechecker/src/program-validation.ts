import {
  getDeclarationFieldSchema,
  getDeclarationSchema,
  resolveDeclarationField,
  type DeclarationFieldSchema,
  type DeclarationFieldValueSchema,
  type DeclarationReferenceTargetKind
} from "@chemd/core";
import type { ChemdDeclaration, ChemdMetaDeclaration, ChemdReferenceExpr, ChemdValue } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { createExternalTargetIndex } from "./references";
import {
  createProgramDiagnostic,
  hasFields,
  type ProgramSymbolTable
} from "./program-utils";
import type { ExternalTargetIndex, TypecheckOptions } from "./types";

const SCALAR_VALUE_TYPES = new Set<ChemdValue["type"]>([
  "string",
  "identifier",
  "boolean",
  "number"
]);

export const validateProgramDeclarationSchemas = (
  declarations: ChemdDeclaration[],
  symbols: ProgramSymbolTable,
  options: Pick<TypecheckOptions, "referenceContext" | "reactionRouteContext"> = {}
): V03Diagnostic[] => {
  const externalTargetIndex = createExternalTargetIndex(
    options.referenceContext,
    options.reactionRouteContext
  );
  return declarations.flatMap((declaration) =>
    validateDeclarationSchema(
      declaration,
      symbols,
      externalTargetIndex
    )
  );
};

export const validateProgramMetaSchema = (
  meta: ChemdMetaDeclaration
): V03Diagnostic[] =>
  ["id", "title", "date"].flatMap((field) =>
    readMetaField(meta, field).trim().length > 0
      ? []
      : [createMetaDiagnostic(
          "E_PROGRAM_META_FIELD_REQUIRED",
          `meta declaration is missing required field '${field}'.`,
          meta,
          field
        )]
  );

const readMetaField = (
  meta: ChemdMetaDeclaration,
  field: string
): string => {
  if (field === "id") return meta.id;
  if (field === "title") return meta.title;
  if (field === "date") return meta.date;
  return "";
};

const validateDeclarationSchema = (
  declaration: ChemdDeclaration,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): V03Diagnostic[] => {
  const schema = getDeclarationSchema(declaration.kind);
  if (!schema) {
    return [
      createProgramDiagnostic(
        "E_PROGRAM_DECLARATION_KIND_UNKNOWN",
        `Unknown declaration kind: ${declaration.kind}.`,
        declaration
      )
    ];
  }

  const fieldDiagnostics = hasFields(declaration)
    ? validateFieldDeclaration(declaration, schema.fields, symbols, externalTargetIndex)
    : validateNonFieldDeclaration(declaration, schema.fields);
  return [...fieldDiagnostics, ...validateUnknownFields(declaration, schema.allowsArbitraryFields === true)];
};

const validateFieldDeclaration = (
  declaration: Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>,
  fields: DeclarationFieldSchema[],
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): V03Diagnostic[] =>
  fields.flatMap((field) => {
    const value = readFieldValue(declaration.fields, field);
    return [
      ...validateRequiredField(declaration, field, value),
      ...validateValueSchema(declaration, field.name, value, field.value, symbols, externalTargetIndex)
    ];
  });

const validateNonFieldDeclaration = (
  declaration: ChemdDeclaration,
  fields: DeclarationFieldSchema[]
): V03Diagnostic[] =>
  fields.flatMap((field) => {
    const value = readDeclarationProperty(declaration, field.name);
    return validateRequiredField(declaration, field, value);
  });

const validateUnknownFields = (
  declaration: ChemdDeclaration,
  allowsArbitraryFields: boolean
): V03Diagnostic[] => {
  if (allowsArbitraryFields || !hasFields(declaration)) return [];
  return Object.keys(declaration.fields)
    .filter((field) => !resolveDeclarationField(declaration.kind, field))
    .map((field) => createProgramDiagnostic(
      "E_PROGRAM_FIELD_UNKNOWN",
      `Unknown field '${field}' on ${declaration.kind} declaration.`,
      declaration,
      field
    ));
};

const readFieldValue = (
  fields: Record<string, ChemdValue>,
  field: DeclarationFieldSchema
): ChemdValue | undefined =>
  fields[field.name] ?? field.aliases?.map((alias) => fields[alias]).find(Boolean);

const readDeclarationProperty = (
  declaration: ChemdDeclaration,
  field: string
): unknown => {
  if (declaration.kind === "agent_run") {
    if (field === "target_files") return declaration.targetFiles;
    return declaration[field as keyof typeof declaration];
  }
  if (declaration.kind === "procedure" && field === "evidence") {
    return declaration.evidence;
  }
  if ("target" in declaration && (field === "ref" || field === "reaction" || field === "plan")) {
    return declaration.target;
  }
  return undefined;
};

const validateRequiredField = (
  declaration: ChemdDeclaration,
  field: DeclarationFieldSchema,
  value: unknown
): V03Diagnostic[] => {
  if (!field.required || value !== undefined && value !== "") return [];
  return [
    createProgramDiagnostic(
      "E301",
      `${declaration.kind} declaration '${declaration.id}' is missing required field '${field.name}'.`,
      declaration,
      field.name
    )
  ];
};

const validateValueSchema = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue | undefined,
  schema: DeclarationFieldValueSchema | undefined,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): V03Diagnostic[] => {
  if (!value || !schema) return [];
  if (schema.kind === "list") return validateListValue(declaration, field, value, schema, symbols, externalTargetIndex);
  if (schema.kind === "record") return validateRecordValue(declaration, field, value, schema, symbols, externalTargetIndex);
  if (!valueMatchesSchema(value, schema)) {
    return [createValueDiagnostic(declaration, field, value, schema.kind)];
  }
  return validateReferenceTargetKind(declaration, field, value, schema, symbols, externalTargetIndex);
};

const validateListValue = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue,
  schema: Extract<DeclarationFieldValueSchema, { kind: "list" }>,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): V03Diagnostic[] => {
  if (value.type !== "list") {
    return [createValueDiagnostic(declaration, field, value, "list")];
  }
  return value.items.flatMap((item) =>
    validateValueSchema(declaration, field, item, schema.item, symbols, externalTargetIndex)
  );
};

const validateRecordValue = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue,
  schema: Extract<DeclarationFieldValueSchema, { kind: "record" }>,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): V03Diagnostic[] => {
  if (value.type !== "record") {
    if (schema.head && recordHeadAcceptsValue(value, schema.head)) {
      return validateValueSchema(declaration, field, value, schema.head, symbols, externalTargetIndex);
    }
    return [createValueDiagnostic(declaration, field, value, "record")];
  }
  return value.fields.flatMap((recordField) => {
    const fieldSchema = schema.params[recordField.key];
    if (!fieldSchema && schema.openParams !== true) {
      return [
        createProgramDiagnostic(
          "E_PROGRAM_RECORD_FIELD_UNKNOWN",
          `Unknown record field '${recordField.key}'.`,
          declaration,
          field,
          "error",
          { recordField: recordField.key },
          recordField.sourceSpan
        )
      ];
    }
    return validateValueSchema(declaration, field, recordField.value, fieldSchema, symbols, externalTargetIndex);
  });
};

const recordHeadAcceptsValue = (
  value: ChemdValue,
  schema: DeclarationFieldValueSchema
): boolean => {
  if (schema.kind === "list") return value.type === "list";
  if (schema.kind === "record") return value.type === "record";
  return valueMatchesSchema(value, schema);
};

const valueMatchesSchema = (
  value: ChemdValue,
  schema: Exclude<DeclarationFieldValueSchema, { kind: "list" | "record" }>
): boolean => {
  if (schema.kind === "quantity") return value.type === "quantity";
  if (schema.kind === "percent") return value.type === "percent";
  if (schema.kind === "boolean") return value.type === "boolean";
  if (schema.kind === "float") return value.type === "number";
  if (schema.kind === "reference") return value.type === "reference";
  if (schema.kind === "ref_or_literal") return value.type === "reference" || SCALAR_VALUE_TYPES.has(value.type);
  if (schema.kind === "enum" || schema.kind === "identifier") return value.type === "identifier" || value.type === "string";
  if (schema.kind === "chemical" || schema.kind === "path" || schema.kind === "string" || schema.kind === "text") {
    return value.type === "string" || value.type === "identifier";
  }
  return value.type === "call" || value.type === "record" || value.type === "list" || SCALAR_VALUE_TYPES.has(value.type);
};

const validateReferenceTargetKind = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue,
  schema: Exclude<DeclarationFieldValueSchema, { kind: "list" | "record" }>,
  symbols: ProgramSymbolTable,
  externalTargetIndex?: ExternalTargetIndex
): V03Diagnostic[] => {
  if (value.type !== "reference") return [];
  if (schema.kind !== "reference" && schema.kind !== "ref_or_literal") return [];
  const actualKind = referenceTargetKind(value, symbols, externalTargetIndex);
  if (!actualKind) return [];
  const expectedKinds = normalizeTargetKinds(schema.targetKind);
  return expectedKinds.includes(actualKind as DeclarationReferenceTargetKind)
    ? []
    : [createReferenceTargetDiagnostic(declaration, field, value, expectedKinds, actualKind)];
};

const normalizeTargetKinds = (
  targetKind: DeclarationReferenceTargetKind | readonly DeclarationReferenceTargetKind[]
): DeclarationReferenceTargetKind[] =>
  typeof targetKind === "string" ? [targetKind] : [...targetKind];

const referenceTargetKind = (
  reference: ChemdReferenceExpr,
  symbols: ProgramSymbolTable,
  externalTargetIndex?: ExternalTargetIndex
): string | undefined => {
  if (reference.refKind === "external_document") {
    return externalTargetIndex?.get(`${reference.externalDocumentId}#${externalObjectId(reference.target)}`)?.targetKind;
  }
  if (reference.refKind === "field") return "field";
  if (reference.refKind === "module") {
    return symbols.get(`${reference.moduleName}.${reference.target}`)?.kind;
  }
  return symbols.get(reference.target)?.kind;
};

const externalObjectId = (target: string): string =>
  target.split(".")[0] ?? target;

const createMetaDiagnostic = (
  code: string,
  message: string,
  meta: ChemdMetaDeclaration,
  field: string
): V03Diagnostic => ({
  code,
  severity: "error",
  message,
  sourceLayer: "typechecker",
  sourceNodeType: "meta",
  sourceNodeId: meta.id || "meta",
  sourceField: field,
  sourceSpan: meta.fieldSpans?.[field] ?? meta.sourceSpan,
  facts: { field }
});

const createReferenceTargetDiagnostic = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdReferenceExpr,
  expectedKinds: DeclarationReferenceTargetKind[],
  actualKind: string
): V03Diagnostic =>
  createProgramDiagnostic(
    "E_PROGRAM_REFERENCE_TARGET_KIND",
    `Field '${field}' on ${declaration.kind} expected reference target ${expectedKinds.join(" or ")}, got ${actualKind}.`,
    declaration,
    field,
    "error",
    {
      expectedTargetKind: expectedKinds,
      actualTargetKind: actualKind,
      referenceTarget: value.target
    },
    value.sourceSpan
  );

const createValueDiagnostic = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue,
  expected: string
): V03Diagnostic =>
  createProgramDiagnostic(
    "E_PROGRAM_FIELD_VALUE_KIND",
    `Field '${field}' on ${declaration.kind} expected ${expected} value, got ${value.type}.`,
    declaration,
    field,
    "error",
    { expectedKind: expected, actualKind: value.type },
    value.sourceSpan
  );

export const fieldValue = (
  declaration: Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>,
  field: string
): ChemdValue | undefined => {
  const schema = getDeclarationFieldSchema(declaration.kind, field);
  return schema ? readFieldValue(declaration.fields, schema) : declaration.fields[field];
};

import {
  getDeclarationFieldSchema,
  getDeclarationSchema,
  resolveDeclarationField,
  type DeclarationFieldSchema,
  type DeclarationFieldValueSchema
} from "@chemd/core";
import type { ChemdDeclaration, ChemdValue } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import {
  createProgramDiagnostic,
  hasFields
} from "./program-utils";

const SCALAR_VALUE_TYPES = new Set<ChemdValue["type"]>([
  "string",
  "identifier",
  "boolean",
  "number"
]);

export const validateProgramDeclarationSchemas = (
  declarations: ChemdDeclaration[]
): V03Diagnostic[] =>
  declarations.flatMap(validateDeclarationSchema);

const validateDeclarationSchema = (declaration: ChemdDeclaration): V03Diagnostic[] => {
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
    ? validateFieldDeclaration(declaration, schema.fields)
    : validateNonFieldDeclaration(declaration, schema.fields);
  return [...fieldDiagnostics, ...validateUnknownFields(declaration, schema.allowsArbitraryFields === true)];
};

const validateFieldDeclaration = (
  declaration: Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>,
  fields: DeclarationFieldSchema[]
): V03Diagnostic[] =>
  fields.flatMap((field) => {
    const value = readFieldValue(declaration.fields, field);
    return [
      ...validateRequiredField(declaration, field, value),
      ...validateValueSchema(declaration, field.name, value, field.value)
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
  schema: DeclarationFieldValueSchema | undefined
): V03Diagnostic[] => {
  if (!value || !schema) return [];
  if (schema.kind === "list") return validateListValue(declaration, field, value, schema);
  if (schema.kind === "record") return validateRecordValue(declaration, field, value, schema);
  return valueMatchesSchema(value, schema)
    ? []
    : [createValueDiagnostic(declaration, field, value, schema.kind)];
};

const validateListValue = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue,
  schema: Extract<DeclarationFieldValueSchema, { kind: "list" }>
): V03Diagnostic[] => {
  if (value.type !== "list") {
    return [createValueDiagnostic(declaration, field, value, "list")];
  }
  return value.items.flatMap((item) => validateValueSchema(declaration, field, item, schema.item));
};

const validateRecordValue = (
  declaration: ChemdDeclaration,
  field: string,
  value: ChemdValue,
  schema: Extract<DeclarationFieldValueSchema, { kind: "record" }>
): V03Diagnostic[] => {
  if (value.type !== "record") {
    if (schema.head && valueMatchesSchema(value, schema.head as Exclude<DeclarationFieldValueSchema, { kind: "list" | "record" }>)) {
      return [];
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
    return validateValueSchema(declaration, field, recordField.value, fieldSchema);
  });
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

import type { ChemdProgramDeclarationKind } from "../program-ast";
import type { FieldValueSchema } from "./block-schema";
import type { QuantityClass } from "./quantity-schema";

export type DeclarationReferenceTargetKind =
  | ChemdProgramDeclarationKind
  | "external_document";

type DeclarationFieldReferenceTargets =
  | DeclarationReferenceTargetKind
  | readonly DeclarationReferenceTargetKind[];

type LegacyNonReferenceValueSchema = Exclude<
  FieldValueSchema,
  | { kind: "reference" }
  | { kind: "ref_or_literal" }
  | { kind: "list" }
  | { kind: "record" }
>;

export type DeclarationFieldValueSchema =
  | LegacyNonReferenceValueSchema
  | { kind: "reference"; targetKind: DeclarationFieldReferenceTargets }
  | { kind: "ref_or_literal"; targetKind: DeclarationFieldReferenceTargets }
  | {
      kind: "list";
      item: DeclarationFieldValueSchema;
      mode: "pipe" | "comma" | "repeat";
    }
  | {
      kind: "record";
      head?: DeclarationFieldValueSchema;
      params: Readonly<Record<string, DeclarationFieldValueSchema>>;
      delimiter?: "|" | ",";
      openParams?: boolean;
    };

export const stringValue = { kind: "string" } satisfies FieldValueSchema;
export const textValue = { kind: "text" } satisfies FieldValueSchema;
export const identifierValue = { kind: "identifier" } satisfies FieldValueSchema;
export const booleanValue = { kind: "boolean" } satisfies FieldValueSchema;
export const floatValue = { kind: "float" } satisfies FieldValueSchema;
export const pathValue = { kind: "path" } satisfies FieldValueSchema;
export const percentValue = { kind: "percent" } satisfies FieldValueSchema;

export const enumValue = (
  values: readonly string[],
  options: Omit<Extract<DeclarationFieldValueSchema, { kind: "enum" }>, "kind" | "values"> = {}
): DeclarationFieldValueSchema => ({ kind: "enum", values, ...options });

export const quantityValue = (
  quantityClass: QuantityClass
): DeclarationFieldValueSchema => ({ kind: "quantity", quantityClass });

export const chemicalValue = (
  chemicalKind: Extract<DeclarationFieldValueSchema, { kind: "chemical" }>["chemicalKind"]
): DeclarationFieldValueSchema => ({ kind: "chemical", chemicalKind });

const fieldTargets = (
  targets: readonly [
    DeclarationReferenceTargetKind,
    ...DeclarationReferenceTargetKind[]
  ]
): DeclarationFieldReferenceTargets => targets.length === 1 ? targets[0] : targets;

export const refOrLiteralValue = (
  ...targetKind: [
    DeclarationReferenceTargetKind,
    ...DeclarationReferenceTargetKind[]
  ]
): DeclarationFieldValueSchema => ({
  kind: "ref_or_literal",
  targetKind: fieldTargets(targetKind)
});

export const listValue = (
  item: DeclarationFieldValueSchema,
  mode: Extract<DeclarationFieldValueSchema, { kind: "list" }>["mode"] = "comma"
): DeclarationFieldValueSchema => ({ kind: "list", item, mode });

export const recordValue = (
  head: DeclarationFieldValueSchema | undefined,
  params: Readonly<Record<string, DeclarationFieldValueSchema>>,
  options: Omit<Extract<DeclarationFieldValueSchema, { kind: "record" }>, "kind" | "head" | "params"> = {}
): DeclarationFieldValueSchema => ({
  kind: "record",
  ...(head ? { head } : {}),
  params,
  ...options
});

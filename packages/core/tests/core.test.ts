import { describe, expect, it } from "vitest";

import type { FieldValueSchema } from "../src/index";
import {
  BLOCK_SCHEMAS,
  buildReactionEntityIdFromReference,
  buildScopedReferenceId,
  CHEMD_KIND_VALUE_ALIASES,
  createDocument,
  createMarkdownNode,
  FIELD_VALUE_SCHEMA_COARSE_FIELDS,
  getBlockFieldSchema,
  getBlockFieldListMode,
  getBlockListFieldSet,
  getCanonicalBlockFields,
  getCompletionBlockFieldSchemas,
  getCoarseFieldValueSchema,
  getDomainFieldKind,
  getEnumFieldValues,
  getFieldValueSchema,
  getFieldValueSuggestions,
  getQuantityFieldClass,
  getRecordFieldHeadSchema,
  getRecordFieldParamSchema,
  getReferenceTargetKinds,
  parseReferenceId
} from "../src/index";

const collectEnumValueSchemas = (
  value: FieldValueSchema | undefined
): Array<Extract<FieldValueSchema, { kind: "enum" }>> => {
  if (!value) {
    return [];
  }
  if (value.kind === "enum") {
    return [value];
  }
  if (value.kind === "list") {
    return collectEnumValueSchemas(value.item);
  }
  if (value.kind === "record") {
    return [
      ...collectEnumValueSchemas(value.head),
      ...Object.values(value.params).flatMap(collectEnumValueSchemas)
    ];
  }

  return [];
};

describe("core AST helpers", () => {
  it("creates a document with stable metadata and children", () => {
    const document = createDocument(
      { id: "exp-core", title: "Core test", date: "2026-04-17" },
      { children: [createMarkdownNode("hello")] }
    );

    expect(document.meta.id).toBe("exp-core");
    expect(document.children[0]).toMatchObject({
      type: "markdown",
      value: "hello"
    });
  });

  it("parses scoped references and derives stable reaction entity ids", () => {
    expect(parseReferenceId("@route-doc#rxn-step-07")).toEqual({
      lookupKey: "route-doc#rxn-step-07",
      documentId: "route-doc",
      objectId: "rxn-step-07",
      baseObjectLookupKey: "route-doc#rxn-step-07"
    });
    expect(parseReferenceId("@route-doc#cv-main.var1")).toEqual({
      lookupKey: "route-doc#cv-main.var1",
      documentId: "route-doc",
      objectId: "cv-main",
      childId: "var1",
      baseObjectLookupKey: "route-doc#cv-main"
    });
    expect(buildScopedReferenceId("route-doc", "rxn-step-07")).toBe("route-doc#rxn-step-07");
    expect(buildReactionEntityIdFromReference("route-doc#rxn-step-07")).toBe("rxn::route-doc::rxn-step-07");
  });
});

describe("block field schema baseline", () => {
  it("keeps canonical field lists and aliases as the field-name source of truth", () => {
    expect(getCanonicalBlockFields("result")).toEqual([
      "status",
      "yield",
      "conversion",
      "selectivity",
      "isolated_mass",
      "product_state",
      "purity",
      "notes",
      "ref",
      "reaction",
      "product"
    ]);
    expect(getCanonicalBlockFields("chemd")).toEqual(expect.arrayContaining([
      "kind",
      "smiles",
      "reactant",
      "product",
      "temperature",
      "yield"
    ]));
    expect(CHEMD_KIND_VALUE_ALIASES).toEqual({
      molecule: "molecule",
      mol: "molecule",
      reaction: "reaction",
      reac: "reaction"
    });
  });

  it("keeps current list and completion behavior stable before value schema work", () => {
    expect([...getBlockListFieldSet("chemd")].sort()).toEqual([
      "chemistry_features",
      "conditions",
      "prev",
      "product",
      "reactant"
    ]);
    expect(getBlockFieldListMode("chemd", "reactant")).toBe("repeat");
    expect(getBlockFieldListMode("chemd", "reactant", "reactants")).toBe("pipe");
    expect(getCompletionBlockFieldSchemas("chemd", "molecule").map((field) => field.name)).toEqual(
      expect.arrayContaining(["smiles", "cas", "mw"])
    );
    expect(getCompletionBlockFieldSchemas("chemd", "molecule").map((field) => field.name)).not.toContain(
      "temperature"
    );
  });

  it("describes field value kinds without changing field-name resolution", () => {
    expect(getBlockFieldSchema("chemd", "reaction_smiles")?.name).toBe("rxn_smiles");
    expect(getBlockFieldSchema("analysis", "analysisType")?.name).toBe("type");

    expect(getFieldValueSchema("chemd", "temperature")).toMatchObject({
      kind: "quantity",
      quantityClass: "temperature"
    });
    expect(getQuantityFieldClass("result", "isolated_mass")).toBe("mass");
    expect(getQuantityFieldClass("result", "yield")).toBe("percent");
    expect(getReferenceTargetKinds("chemd", "reactant")).toEqual([
      "molecule",
      "material",
      "batch"
    ]);
    expect(getReferenceTargetKinds("trace", "plan")).toEqual(["procedure"]);
  });

  it("keeps enum values, aliases, and suggestions explicit for later consumers", () => {
    expect(getEnumFieldValues("chemd", "kind")).toEqual(["molecule", "reaction"]);
    expect(getFieldValueSchema("chemd", "kind")).toMatchObject({
      kind: "enum",
      aliases: CHEMD_KIND_VALUE_ALIASES
    });
    expect(getEnumFieldValues("result", "status")).toEqual([
      "success",
      "partial",
      "failed",
      "unknown"
    ]);
    expect(getFieldValueSuggestions("result", "status")).toContain("pending");
  });

  it("requires value metadata on every canonical block field", () => {
    const missing = BLOCK_SCHEMAS.flatMap((schema) =>
      schema.fields.flatMap((field) =>
        field.value ? [] : [`${schema.blockType}.${field.name}`]
      )
    );

    expect(missing).toEqual([]);
  });

  it("keeps coarse domain value metadata in an explicit exception list", () => {
    const domainFields = BLOCK_SCHEMAS.flatMap((schema) =>
      schema.fields.flatMap((field) =>
        field.value?.kind === "domain"
          ? [`${schema.blockType}.${field.name}:${field.value.domainKind}`]
          : []
      )
    ).sort();
    const exceptions = FIELD_VALUE_SCHEMA_COARSE_FIELDS.map((item) =>
      `${item.blockType}.${item.fieldName}:${item.domainKind}`
    ).sort();

    expect(domainFields).toEqual(exceptions);
  });

  it("keeps legacy value maps aligned with enum value schemas", () => {
    const mismatches = BLOCK_SCHEMAS.flatMap((schema) =>
      schema.fields.flatMap((field) => {
        if (!field.values) {
          return [];
        }

        const uniqueLegacyValues = [...new Set(Object.values(field.values))].sort();
        const enumValues = getEnumFieldValues(schema.blockType, field.name).sort();
        return JSON.stringify(uniqueLegacyValues) === JSON.stringify(enumValues)
          ? []
          : [`${schema.blockType}.${field.name}`];
      })
    );

    expect(mismatches).toEqual([]);
  });

  it("keeps enum aliases resolving to declared enum values", () => {
    const invalidAliases = BLOCK_SCHEMAS.flatMap((schema) =>
      schema.fields.flatMap((field) =>
        collectEnumValueSchemas(field.value).flatMap((value) =>
          Object.entries(value.aliases ?? {}).flatMap(([alias, canonical]) =>
            value.values.includes(canonical)
              ? []
              : [`${schema.blockType}.${field.name}:${alias}->${canonical}`]
          )
        )
      )
    );

    expect(invalidAliases).toEqual([]);
  });

  it("exposes structured record field head and parameter schemas", () => {
    expect(getRecordFieldHeadSchema("chemd", "reactant")).toMatchObject({
      kind: "ref_or_literal",
      targetKind: ["molecule", "material", "batch"]
    });
    expect(getRecordFieldParamSchema("chemd", "reactant", "amount")).toMatchObject({
      kind: "quantity",
      quantityClass: "amount"
    });
    expect(getRecordFieldParamSchema("chemd", "reactant", "limiting")).toMatchObject({
      kind: "boolean"
    });
    expect(getRecordFieldParamSchema("condition-varies", "factor", "quantity")).toMatchObject({
      kind: "enum",
      values: expect.arrayContaining(["temperature", "time", "percent"])
    });
  });

  it("exposes coarse domain field exceptions for later normalizers", () => {
    expect(getDomainFieldKind("analysis", "spot")).toBe("tlc_spot");
    expect(getCoarseFieldValueSchema("analysis", "spot")).toMatchObject({
      domainKind: "tlc_spot",
      reason: expect.stringContaining("shape")
    });
    expect(getCoarseFieldValueSchema("analysis", "type")).toBeUndefined();
  });
});

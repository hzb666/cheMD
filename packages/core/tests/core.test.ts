import { describe, expect, it } from "vitest";

import {
  buildReactionEntityIdFromReference,
  buildScopedReferenceId,
  CHEMD_KIND_VALUE_ALIASES,
  createDocument,
  createMarkdownNode,
  getBlockFieldSchema,
  getBlockFieldListMode,
  getBlockListFieldSet,
  getCanonicalBlockFields,
  getCompletionBlockFieldSchemas,
  getEnumFieldValues,
  getFieldValueSchema,
  getFieldValueSuggestions,
  getQuantityFieldClass,
  getReferenceTargetKinds,
  parseReferenceId
} from "../src/index";

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
});

import { describe, expect, it } from "vitest";

import { applyDiagnosticQuickFix, type DiagnosticWithQuickFixes } from "../src/index";

describe("applyDiagnosticQuickFix", () => {
  it("inserts an inferred chemd kind into the matching block", () => {
    const source = `:::chemd #rxn-main
reactants: @a
products: @b
:::`;
    const diagnostic: DiagnosticWithQuickFixes = {
      code: "W_CHEMD_KIND_INFERRED",
      severity: "warning",
      message: "Chemd kind inferred as reaction; declare kind explicitly.",
      sourceNodeId: "rxn-main",
      facts: { inferred_kind: "reaction" }
    };

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "Insert kind",
      kind: "insert_chemd_kind",
      patch: { source_node_id: "rxn-main", kind: "reaction" }
    })).toBe(`:::chemd #rxn-main
kind: reaction
reactants: @a
products: @b
:::`);
  });

  it("infers a missing chemd kind from block fields when the patch omits kind", () => {
    const source = `:::chemd #mol-main
smiles: CCO
:::`;
    const diagnostic: DiagnosticWithQuickFixes = {
      code: "W_CHEMD_KIND_AMBIGUOUS",
      severity: "warning",
      message: "Chemd block should declare kind.",
      sourceNodeId: "mol-main"
    };

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "Insert kind",
      kind: "insert_chemd_kind",
      patch: { source_node_id: "mol-main" }
    })).toBe(`:::chemd #mol-main
kind: molecule
smiles: CCO
:::`);
  });

  it("does not patch anonymous chemd blocks without a stable target id", () => {
    const source = [
      ":::chemd",
      "smiles: CCO",
      ":::",
      "",
      ":::chemd",
      "reactants: @a",
      "products: @b",
      ":::"
    ].join("\n");
    const diagnostic: DiagnosticWithQuickFixes = {
      code: "W_CHEMD_KIND_INFERRED",
      severity: "warning",
      message: "Chemd kind inferred as reaction; declare kind explicitly.",
      facts: { inferred_kind: "reaction" }
    };

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "Insert kind",
      kind: "insert_chemd_kind",
      patch: { kind: "reaction" }
    })).toBe(source);
  });

  it("converts a targeted legacy molecule block to canonical chemd syntax", () => {
    const source = `:::molecule #legacy-mol
smiles: CCO
:::`;
    const diagnostic: DiagnosticWithQuickFixes = {
      code: "W_UNKNOWN_BLOCK",
      severity: "warning",
      message: "Unknown block type: molecule",
      sourceNodeType: "molecule",
      sourceNodeId: "legacy-mol",
      facts: { legacy_block_kind: "molecule" }
    };

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "Convert this legacy block to canonical chemd syntax",
      kind: "convert_legacy_block",
      patch: {
        source_node_type: "molecule",
        source_node_id: "legacy-mol"
      }
    })).toBe(`:::chemd #legacy-mol
kind: molecule
smiles: CCO
:::`);
  });

  it("applies a conservative authoring patch quick fix", () => {
    const source = `:::result #res-main
status: success
:::`;
    const diagnostic: DiagnosticWithQuickFixes = {
      code: "W_AUTHORING_FIX_AVAILABLE",
      severity: "warning",
      message: "Result block is missing a reaction ref.",
      sourceLayer: "compiler",
      sourceNodeId: "res-main"
    };

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "为 res-main 补 ref",
      kind: "apply_authoring_patch",
      patch: {
        kind: "insert_field_line",
        blockId: "res-main",
        line: "ref: rxn-main"
      }
    })).toBe(`:::result #res-main
ref: rxn-main
status: success
:::`);
  });
});

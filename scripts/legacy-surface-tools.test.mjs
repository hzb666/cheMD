import assert from "node:assert/strict";
import test from "node:test";

import { auditLegacySurfaceUsage } from "./audit-legacy-surface-usage.mjs";
import { migrateLegacySurfaceToChemd } from "./migrate-legacy-surface-to-chemd.mjs";

test("migrates legacy molecule and reaction fences to canonical chemd blocks", () => {
  const source = [
    ":::molecule #mol-a",
    "smiles: CCO",
    ":::",
    "",
    ":::reaction #rxn-a",
    "reactants: @mol-a",
    "products: @mol-b",
    ":::"
  ].join("\n");

  assert.equal(
    migrateLegacySurfaceToChemd(source),
    [
      ":::chemd #mol-a",
      "kind: molecule",
      "smiles: CCO",
      ":::",
      "",
      ":::chemd #rxn-a",
      "kind: reaction",
      "reactants: @mol-a",
      "products: @mol-b",
      ":::"
    ].join("\n")
  );
});

test("audits legacy surface block usage by line", () => {
  const findings = auditLegacySurfaceUsage(":::molecule #mol-a\n:::\n:::reaction #rxn-a\n:::");

  assert.deepEqual(findings, [
    { line: 1, blockType: "molecule", header: ":::molecule #mol-a" },
    { line: 3, blockType: "reaction", header: ":::reaction #rxn-a" }
  ]);
});

test("ignores legacy-looking blocks inside Markdown code fences", () => {
  const source = [
    "```chemd",
    ":::molecule #example",
    "smiles: CCO",
    ":::",
    "```",
    "",
    ":::reaction #rxn-a",
    "reactants: @a",
    "products: @b",
    ":::"
  ].join("\n");

  assert.equal(
    migrateLegacySurfaceToChemd(source),
    [
      "```chemd",
      ":::molecule #example",
      "smiles: CCO",
      ":::",
      "```",
      "",
      ":::chemd #rxn-a",
      "kind: reaction",
      "reactants: @a",
      "products: @b",
      ":::"
    ].join("\n")
  );
  assert.deepEqual(auditLegacySurfaceUsage(source), [
    { line: 7, blockType: "reaction", header: ":::reaction #rxn-a" }
  ]);
});

test("does not close a legacy migration block on colons inside nested code fences", () => {
  const source = [
    ":::molecule #mol-a",
    "```text",
    ":::",
    "```",
    "smiles: CCO",
    ":::"
  ].join("\n");

  assert.equal(
    migrateLegacySurfaceToChemd(source),
    [
      ":::chemd #mol-a",
      "kind: molecule",
      "```text",
      ":::",
      "```",
      "smiles: CCO",
      ":::"
    ].join("\n")
  );
});

test("preserves CRLF line endings and final newline during migration", () => {
  const source = [
    ":::molecule #mol-a",
    "smiles: CCO",
    ":::",
    ""
  ].join("\r\n");

  assert.equal(
    migrateLegacySurfaceToChemd(source),
    [
      ":::chemd #mol-a",
      "kind: molecule",
      "smiles: CCO",
      ":::",
      ""
    ].join("\r\n")
  );
});

test("does not duplicate kind after blank or comment lines", () => {
  const source = [
    ":::molecule #mol-a",
    "",
    "# preserved author note",
    "kind: molecule",
    "smiles: CCO",
    ":::"
  ].join("\n");

  assert.equal(migrateLegacySurfaceToChemd(source), [
    ":::chemd #mol-a",
    "",
    "# preserved author note",
    "kind: molecule",
    "smiles: CCO",
    ":::"
  ].join("\n"));
});

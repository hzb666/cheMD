import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

const readFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("program compiler integration", () => {
  it("keeps the program AST as the compiler source of truth", () => {
    const result = compileChemd(readFixture("program-golden-suzuki-screen.chemd"));

    expect(result.program).toMatchObject({
      type: "program_document",
      schemaVersion: "chemd-program-ast/v1",
      sourceLanguage: "chemd/program-v1",
      meta: { id: "exp-golden-suzuki-screen" }
    });
    expect(result.document.children).toEqual([]);
    expect(result.program.declarations.map((node) => node.kind)).toEqual([
      "molecule",
      "molecule",
      "reaction",
      "result",
      "procedure"
    ]);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.typedSemanticGraph.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining([
      "molecule",
      "reaction",
      "result",
      "procedure_narrative",
      "step"
    ]));
    expect(result.stepGraph.steps.map((step) => step.stepId)).toEqual(["charge", "heat"]);
    expect(result.runtimePreflight.blocking).toBe(false);
    expect(result.lnf.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(result.trainingExport.schema_version).toBe("chemd-training-export/v0.2");
    expect(JSON.parse(result.docxBridge)).toMatchObject({
      semantic: {
        typedGraph: {
          documentId: "exp-golden-suzuki-screen"
        }
      }
    });
  });

  it("reports removed legacy source as explicit parser diagnostics", () => {
    const result = compileChemd(`---
id: exp-legacy
title: Legacy
date: 2026-05-29
---

:::chemd #rxn-main
reactants: a
products: b
:::`);

    expect(result.program.declarations).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_LEGACY_FRONTMATTER_REMOVED" }),
      expect.objectContaining({ code: "E_LEGACY_FENCED_BLOCK_REMOVED" })
    ]));
  });
});

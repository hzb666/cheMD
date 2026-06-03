import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd, compileChemdCore } from "../src/index";

const readFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("compileChemd program pipeline", () => {
  it("exposes the resolved program and semantic artifacts from program syntax", () => {
    const result = compileChemd(readFixture("program-golden-suzuki-screen.chemd"));

    expect(result.program).toMatchObject({
      type: "program_document",
      schemaVersion: "chemd-program-ast/v1",
      sourceLanguage: "chemd/program-v1",
      meta: {
        id: "exp-golden-suzuki-screen",
        primary: {
          reaction: expect.objectContaining({
            target: "rxn_var1",
            resolved: expect.objectContaining({ status: "resolved" })
          })
        }
      }
    });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.program.declarations.map((declaration) => declaration.kind)).toEqual([
      "molecule",
      "molecule",
      "reaction",
      "result",
      "procedure"
    ]);
    expect(result.typedSemanticGraph.documentId).toBe("exp-golden-suzuki-screen");
    expect(result.typedSemanticGraph.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining([
      "molecule",
      "reaction",
      "result",
      "procedure_narrative",
      "step"
    ]));
    expect(result.stepGraph.steps.map((step) => step.stepId)).toEqual(["charge", "heat"]);
    expect(result.runPlan.documentId).toBe("exp-golden-suzuki-screen");
    expect(result.lnf.experiment.document.id).toBe("exp-golden-suzuki-screen");
    expect(result.trainingExport.semantic_layer.reactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        original_id: "rxn_var1",
        source_block_type: "reaction",
        syntax_origin: "program_declaration"
      })
    ]));
    expect(result.trainingExport.semantic_layer.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        original_id: "res_var1",
        reaction_ref_raw: "@rxn_var1"
      })
    ]));
    expect(result.trainingUnderstanding.entities.reactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ original_id: "rxn_var1" })
    ]));
    expect(result.html).toEqual(expect.any(String));
    expect(result.json).toEqual(expect.any(String));
    expect(result.docxBridge).toEqual(expect.any(String));
  });

  it("does not duplicate upstream resolver diagnostics in compiler output", () => {
    const result = compileChemd(`module exp_duplicate_diagnostics

meta {
  id: "exp-duplicate-diagnostics"
  title: "Duplicate diagnostics"
  date: "2026-05-29"
  primary_reaction: @missing_rxn
}
`);

    expect(result.diagnostics.filter((diagnostic) =>
      diagnostic.code === "E_UNRESOLVED_PROGRAM_REFERENCE"
        && diagnostic.nodeId === "missing_rxn"
    )).toHaveLength(1);
  });

  it("exposes a pure language core compile result without training outputs", () => {
    const result = compileChemdCore(readFixture("program-golden-suzuki-screen.chemd"));

    expect(result.program).toMatchObject({
      type: "program_document",
      sourceLanguage: "chemd/program-v1"
    });
    expect(result.typedSemanticGraph.documentId).toBe("exp-golden-suzuki-screen");
    expect(result.stepGraph.steps.map((step) => step.stepId)).toEqual(["charge", "heat"]);
    expect(result.runPlan.documentId).toBe("exp-golden-suzuki-screen");
    expect(result.lnf.experiment.document.id).toBe("exp-golden-suzuki-screen");
    expect("trainingExport" in result).toBe(false);
    expect("trainingUnderstanding" in result).toBe(false);
    expect("ragExport" in result).toBe(false);
  });
});

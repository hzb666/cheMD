import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

const docsLanguageContractSource = readFileSync(
  new URL("../fixtures/docs-language-contract.chemd", import.meta.url),
  "utf8"
);

describe("documentation language contract fixture", () => {
  it("compiles documented program syntax without error diagnostics", () => {
    const result = compileChemd(docsLanguageContractSource);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("keeps doc comments, declarations, and procedure steps executable", () => {
    const result = compileChemd(docsLanguageContractSource);
    const reaction = result.program.declarations.find((node) => node.id === "rxn_main");
    const procedure = result.program.declarations.find((node) => node.id === "proc_main");
    const observation = result.program.declarations.find((node) => node.id === "obs_main");

    expect(result.program.docs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        markdown: expect.stringContaining("Documentation language contract"),
        attachment: { kind: "file" }
      }),
      expect.objectContaining({
        markdown: "Reaction doc comments are renderable but do not create facts.",
        attachment: { kind: "declaration", declarationId: "rxn_main" }
      })
    ]));
    expect(reaction).toMatchObject({
      kind: "reaction",
      fields: {
        temperature: expect.objectContaining({ type: "quantity", unit: "C" })
      }
    });
    expect(procedure).toMatchObject({
      kind: "procedure",
      children: expect.arrayContaining([
        expect.objectContaining({ kind: "step", id: "charge", family: "charge" }),
        expect.objectContaining({ kind: "step", id: "heat", family: "heat", dependsOn: ["charge"] })
      ])
    });
    expect(observation).toMatchObject({
      kind: "observation",
      target: expect.objectContaining({ target: "rxn_main" })
    });
  });
});

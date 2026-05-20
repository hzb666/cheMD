import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

const docsLanguageContractSource = readFileSync(
  new URL("../fixtures/docs-language-contract.chemd", import.meta.url),
  "utf8"
);

describe("documentation language contract fixture", () => {
  it("compiles documented syntax without warnings or errors", () => {
    const result = compileChemd(docsLanguageContractSource);

    expect(result.diagnostics).toEqual([]);
  });

  it("keeps template parameters, col children, and nested event/step syntax executable", () => {
    const result = compileChemd(docsLanguageContractSource);
    const col = result.document.children.find((node) => node.type === "col");
    const template = result.document.children.find((node) => node.type === "template");
    const procedure = result.document.children.find((node) => node.type === "procedure");
    const observation = result.document.children.find((node) => node.type === "observation");

    expect(template).toMatchObject({
      type: "template",
      name: "reaction-summary",
      paramSpecs: expect.arrayContaining([
        expect.objectContaining({ name: "rxn", type: expect.objectContaining({ kind: "ref", targetKind: "reaction" }) }),
        expect.objectContaining({ name: "result", type: expect.objectContaining({ kind: "ref", targetKind: "result" }) }),
        expect.objectContaining({ name: "target", type: expect.objectContaining({ kind: "quantity", quantityClass: "temperature" }) })
      ])
    });
    expect(col).toMatchObject({
      type: "col",
      columns: 3,
      children: expect.arrayContaining([
        expect.objectContaining({ type: "analysis", id: "ana-col" })
      ])
    });
    expect(procedure).toMatchObject({
      type: "procedure",
      steps: expect.arrayContaining([
        expect.objectContaining({ type: "step", stepId: "s-add", family: "add" })
      ])
    });
    expect(observation).toMatchObject({
      type: "observation",
      events: expect.arrayContaining([
        expect.objectContaining({ type: "event", eventId: "e-gas", eventType: "gas_evolution" })
      ])
    });
  });
});

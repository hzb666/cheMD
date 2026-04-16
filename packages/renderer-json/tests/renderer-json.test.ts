import { describe, expect, it } from "vitest";

import { createDocument } from "@chemd/core";

import { renderJson } from "../src/index";

describe("renderJson", () => {
  it("serializes reactions with normalized conditions", () => {
    const document = createDocument(
      { id: "exp-json", title: "JSON test", date: "2026-04-17" },
      {
        children: [{
          type: "reaction",
          id: "rxn-main",
          reactants: ["a"],
          products: ["b"],
          solvent: "THF"
        }]
      }
    );
    const payload = JSON.parse(renderJson(document));

    expect(payload.document.body["01_reaction"].normalized_conditions.solvent.normalized).toBe("tetrahydrofuran");
  });
});

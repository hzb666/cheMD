import { describe, expect, it } from "vitest";

import { createDocument } from "@chemd/core";

import { renderJson } from "../src/index";

describe("renderJson", () => {
  it("does not infer normalized conditions without typed graph input", () => {
    const document = createDocument(
      { id: "exp-json", title: "JSON test", date: "2026-04-17" },
      {
        children: [{
          type: "reaction",
          id: "rxn-main",
          reactants: ["a"],
          products: ["b"],
          solvent: "THF",
          syntaxOrigin: "chemd",
          declaredKind: "reaction"
        }]
      }
    );
    const payload = JSON.parse(renderJson(document));

    expect(payload.document.body["01_reaction"].normalized_conditions).toBeUndefined();
  });

  it("serializes typed graph separately instead of enriching author body", () => {
    const document = createDocument(
      { id: "exp-json", title: "JSON test", date: "2026-04-17" },
      {
        children: [{
          type: "reaction",
          id: "rxn-main",
          reactants: ["a"],
          products: ["b"],
          solvent: "THF",
          syntaxOrigin: "chemd",
          declaredKind: "reaction"
        }]
      }
    );
    const payload = JSON.parse(renderJson(document, {
      typedGraph: {
        nodes: [{
          kind: "reaction",
          nodeId: "rxn-main",
          normalizedConditions: {
            solvent: {
              raw: "THF",
              normalized: "tetrahydrofuran"
            }
          }
        }]
      }
    }));

    expect(payload.document.body["01_reaction"].normalized_conditions).toBeUndefined();
    expect(payload.semantic.typedGraph.nodes["01_node"].normalizedConditions.solvent.normalized).toBe("tetrahydrofuran");
    expect(payload.document.body["01_reaction"].syntax_origin).toBe("chemd");
    expect(payload.document.body["01_reaction"].declared_kind).toBe("reaction");
  });

  it("uses semantic array names for typed step graph fields", () => {
    const document = createDocument(
      { id: "exp-json-steps", title: "JSON steps", date: "2026-04-18" },
      { children: [] }
    );
    const payload = JSON.parse(renderJson(document, {
      typedGraph: {
        nodes: [{
          kind: "step",
          nodeId: "s1",
          stepId: "s1",
          inputs: [{ raw: "@mol-a" }],
          outputs: [{ raw: "intermediate" }],
          artifacts: [{ artifactId: "art-1", kind: "material" }]
        }]
      }
    }));
    const step = payload.semantic.typedGraph.nodes["01_node"];

    expect(step.inputs["01_input"].raw).toBe("@mol-a");
    expect(step.outputs["01_output"].raw).toBe("intermediate");
    expect(step.artifacts["01_artifact"].artifactId).toBe("art-1");
  });

  it("records the col flattening strategy while preserving nested content", () => {
    const document = createDocument(
      { id: "exp-json-col", title: "JSON col", date: "2026-04-19" },
      {
        children: [{
          type: "col",
          columns: 2,
          children: [
            { type: "molecule", id: "mol-a", smiles: "CCO" },
            { type: "reaction", id: "rxn-a", reactants: ["@mol-a"], products: ["product"] }
          ]
        }]
      }
    );
    const payload = JSON.parse(renderJson(document));

    expect(payload.document.layout.col_strategy).toBe("flatten_children");
    expect(payload.document.body["01_molecule"].id).toBe("mol-a");
    expect(payload.document.body["02_reaction"].id).toBe("rxn-a");
  });
});

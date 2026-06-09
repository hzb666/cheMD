import { describe, expect, it } from "vitest";

import { parseChemdProgram } from "@chemd/parser";

import {
  buildTypedSemanticGraph,
  typecheckDocument,
  typecheckProgram
} from "../src/index";

const parse = (source: string) => parseChemdProgram(source);

describe("program typechecker", () => {
  it("builds a typed semantic graph from program declarations", () => {
    const program = parse(`module exp_program

meta {
  id: "exp-program"
  title: "Program"
  date: "2026-05-28"
  primary_molecule: @mol_a
}

molecule mol_a {
  name: "aryl bromide"
}

molecule mol_b {
  name: "product"
}

reaction rxn_1 {
  route: "route-main"
  reactants: [@primary_molecule]
  products: [@mol_b]
  solvent: "MeCN"
  temperature: 40 C
}

result res_1 for @rxn_1 {
  status: success
  yield: 78%
}

analysis ana_1 for @res_1 {
  type: nmr
  ref: @res_1
}

sample sample_1 {
  name: "crude sample"
  derived_from: @res_1
}

artifact art_1 {
  kind: nmr
  ref: @res_1
  path: "data/nmr.dx"
}

observation obs_1 for @rxn_1 {
  notes: "yellow solution"
}

procedure proc_1 for @rxn_1 {
  step charge = charge(inputs: [@mol_a])
}

trace trace_1 for @proc_1 {
  plan: @proc_1
  mode: planned
}
`);

    const result = typecheckProgram(program);
    const graph = buildTypedSemanticGraph(program);

    expect(result.diagnostics).toEqual([]);
    expect(graph.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining([
      "molecule",
      "reaction",
      "result",
      "analysis",
      "sample",
      "artifact",
      "observation_narrative",
      "procedure_narrative",
      "trace"
    ]));
    expect(graph.nodes.find((node) => node.nodeId === "rxn_1")).toMatchObject({
      sourceMetadata: {
        sourceKind: "declaration",
        declarationKind: "reaction",
        declarationId: "rxn_1"
      },
      reactants: [
        {
          kind: "reference",
          refId: "primary_molecule",
          targetKind: "molecule",
          resolved: true
        }
      ]
    });
    expect(result.typedGraph.quantities.map((item) => item.raw)).toEqual(expect.arrayContaining(["40 C", "78%"]));
  });

  it("validates required fields unknown fields and value kinds through declaration schema", () => {
    const result = typecheckDocument(parse(`module exp_schema

meta {
  id: "exp-schema"
  title: "Schema"
  date: "2026-05-28"
}

molecule mol_missing {
  role: substrate
  unexpected: "not allowed"
}

reaction rxn_bad {
  temperature: "warm"
}

analysis ana_arbitrary {
  custom_signal: { kind: "allowed" }
}
`));

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E301", sourceNodeId: "mol_missing", sourceField: "name" }),
      expect.objectContaining({ code: "E_PROGRAM_FIELD_UNKNOWN", sourceNodeId: "mol_missing", sourceField: "unexpected" }),
      expect.objectContaining({ code: "E403", sourceNodeId: "rxn_bad", sourceField: "temperature" })
    ]));
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "E_PROGRAM_FIELD_UNKNOWN", sourceNodeId: "ana_arbitrary" })
    );
  });

  it("accepts symbolic reaction temperature conditions without inventing numeric values", () => {
    const result = typecheckProgram(parse(`module exp_symbolic_temperature

meta {
  id: "exp-symbolic-temperature"
  title: "Symbolic temperature"
  date: "2026-06-09"
}

reaction rxn_reflux {
  reactants: ["substrate"]
  temperature: reflux
}

reaction rxn_rt {
  reactants: ["substrate"]
  temperature: rt
}

reaction rxn_room {
  reactants: ["substrate"]
  temperature: "room temperature"
}
`));

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.typedGraph.quantities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        raw: "reflux",
        valueKind: "shorthand",
        shorthand: "reflux",
        normalizedText: "reflux"
      }),
      expect.objectContaining({
        raw: "rt",
        valueKind: "shorthand",
        shorthand: "room_temperature",
        normalizedText: "room temperature"
      }),
      expect.objectContaining({
        raw: "room temperature",
        valueKind: "shorthand",
        shorthand: "room_temperature",
        normalizedText: "room temperature"
      })
    ]));
  });

  it("treats reaction reagents catalyst and solvent as list fields with scalar singleton shorthand", () => {
    const result = typecheckProgram(parse(`module exp_reaction_condition_lists

meta {
  id: "exp-reaction-condition-lists"
  title: "Reaction condition lists"
  date: "2026-06-09"
}

molecule mol_a {
  name: "A"
}

molecule mol_product {
  name: "product"
}

molecule mol_k2co3 {
  name: "K2CO3"
}

molecule mol_dioxane {
  name: "dioxane"
}

molecule mol_water {
  name: "water"
}

material cat_pd {
  notes: "Pd catalyst"
}

reaction rxn_list {
  reactants: @mol_a
  products: @mol_product
  reagents: [@mol_k2co3, "A, B"]
  catalyst: "Pd(OAc)2, SPhos"
  solvent: [@mol_dioxane, @mol_water]
}
`));

    const reaction = result.typedGraph.nodes.find((node) => node.kind === "reaction" && node.nodeId === "rxn_list");

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(reaction).toMatchObject({
      reactants: [expect.objectContaining({ refId: "mol_a", targetKind: "molecule" })],
      products: [expect.objectContaining({ refId: "mol_product", targetKind: "molecule" })],
      reagents: [
        expect.objectContaining({ refId: "mol_k2co3", targetKind: "molecule" }),
        { kind: "literal", raw: "A, B" }
      ],
      catalyst: [{ kind: "literal", raw: "Pd(OAc)2, SPhos" }],
      solvent: [
        expect.objectContaining({ refId: "mol_dioxane", targetKind: "molecule" }),
        expect.objectContaining({ refId: "mol_water", targetKind: "molecule" })
      ]
    });
  });

  it("maps nested value schema diagnostics to nested source spans", () => {
    const result = typecheckDocument(parse(`module exp_nested_schema

meta {
  id: "exp-nested-schema"
  title: "Nested schema"
  date: "2026-05-28"
}

molecule mol_a {
  name: "A"
}

reaction rxn_nested {
  reactants: [{material: @mol_a, mystery: 1}]
}
`));

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_PROGRAM_RECORD_FIELD_UNKNOWN",
        sourceNodeId: "rxn_nested",
        sourceField: "reactants",
        sourceSpan: expect.objectContaining({
          startLine: 14,
          startColumn: 34
        }),
        facts: expect.objectContaining({
          recordField: "mystery"
        })
      })
    );
  });

  it("validates reference target kinds declared by field schemas", () => {
    const result = typecheckDocument(parse(`module exp_ref_kind

meta {
  id: "exp-ref-kind"
  title: "Reference kind"
  date: "2026-06-04"
}

molecule mol_a {
  name: "A"
}

reaction rxn_1 {
  reactants: [@mol_a]
}

result res_bad for @rxn_1 {
  reaction: @mol_a
}
`));

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_PROGRAM_REFERENCE_TARGET_KIND",
        sourceNodeId: "res_bad",
        sourceField: "reaction",
        facts: expect.objectContaining({
          actualTargetKind: "molecule",
          expectedTargetKind: ["reaction"]
        })
      })
    );
  });

  it("validates reference target kinds inside nested lists", () => {
    const result = typecheckDocument(parse(`module exp_ref_list_kind

meta {
  id: "exp-ref-list-kind"
  title: "Reference list kind"
  date: "2026-06-04"
}

result res_bad {
  status: success
}

reaction rxn_bad {
  reactants: [@res_bad]
}
`));

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_PROGRAM_REFERENCE_TARGET_KIND",
        sourceNodeId: "rxn_bad",
        sourceField: "reactants",
        facts: expect.objectContaining({
          actualTargetKind: "result",
          expectedTargetKind: ["molecule", "material", "batch"]
        })
      })
    );
  });

  it("validates required meta fields with source-aware diagnostics", () => {
    const result = typecheckDocument(parse(`module exp_meta_required

meta {
  id: "exp-meta-required"
  date: "2026-06-04"
}

molecule mol_a {
  name: "A"
}
`));

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_PROGRAM_META_FIELD_REQUIRED",
        sourceNodeType: "meta",
        sourceField: "title",
        sourceSpan: expect.objectContaining({
          startLine: 3
        })
      })
    );
  });

  it("validates external reference target kinds from reference context", () => {
    const result = typecheckDocument(parse(`module exp_external_ref_kind

meta {
  id: "exp-external-ref-kind"
  title: "External reference kind"
  date: "2026-06-04"
}

result res_bad {
  reaction: @route-doc#mol_ext
}
`), {
      referenceContext: {
        externalTargets: [{
          refId: "route-doc#mol_ext",
          targetKind: "molecule"
        }]
      }
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_PROGRAM_REFERENCE_TARGET_KIND",
        sourceNodeId: "res_bad",
        sourceField: "reaction",
        facts: expect.objectContaining({
          actualTargetKind: "molecule",
          expectedTargetKind: ["reaction"]
        })
      })
    );
  });

  it("preserves upstream diagnostic source layers", () => {
    const program = parse(`module exp_upstream_diag

meta {
  id: "exp-upstream-diag"
  title: "Upstream diagnostic"
  date: "2026-05-28"
}

molecule mol_a {
  name: "aryl bromide"
}
`);
    const result = typecheckProgram({
      ...program,
      diagnostics: [
        {
          code: "E_UNRESOLVED_PROGRAM_REFERENCE",
          severity: "error",
          message: "Unable to resolve reference @missing_rxn",
          sourceLayer: "resolver",
          sourceNodeId: "missing_rxn",
          sourceSpan: {
            start: 88,
            end: 100,
            startLine: 9,
            startColumn: 9,
            endLine: 9,
            endColumn: 21
          }
        }
      ]
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_UNRESOLVED_PROGRAM_REFERENCE",
      sourceLayer: "resolver",
      sourceNodeId: "missing_rxn",
      sourceSpan: expect.objectContaining({
        startLine: 9,
        startColumn: 9,
        endLine: 9,
        endColumn: 21
      })
    }));
  });

});

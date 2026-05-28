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
      expect.objectContaining({ code: "E_PROGRAM_FIELD_VALUE_KIND", sourceNodeId: "rxn_bad", sourceField: "temperature" })
    ]));
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "E_PROGRAM_FIELD_UNKNOWN", sourceNodeId: "ana_arbitrary" })
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
          sourceNodeId: "missing_rxn"
        }
      ]
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_UNRESOLVED_PROGRAM_REFERENCE",
      sourceLayer: "resolver",
      sourceNodeId: "missing_rxn"
    }));
  });

});

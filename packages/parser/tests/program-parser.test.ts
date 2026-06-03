import { describe, expect, it } from "vitest";

import { parseChemdProgram } from "../src/program";

describe("parseChemdProgram", () => {
  it("parses documented imports, module references, and grouped declaration docs", () => {
    const document = parseChemdProgram(`module exp_imports

/// Shared solvent route library.
import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-imports"
  title: "Imports"
  date: "2026-05-28"
  primary_reaction: @solvents.rxn_var1
}

/// First doc line.
/// Second doc line.
reaction rxn_local {
  name: "local"
}
`);

    expect(document.imports[0]).toMatchObject({
      moduleName: "shared_solvents",
      alias: "solvents",
      docs: [{ docId: "doc_1" }]
    });
    expect(document.meta.primary?.reaction).toMatchObject({
      type: "reference",
      refKind: "module",
      moduleName: "solvents",
      target: "rxn_var1"
    });
    expect(document.docs).toMatchObject([
      {
        id: "doc_1",
        markdown: "Shared solvent route library.",
        attachment: { kind: "file" }
      },
      {
        id: "doc_2",
        markdown: "First doc line.\nSecond doc line.",
        attachment: { kind: "declaration", declarationId: "rxn_local" }
      }
    ]);
    expect(document.diagnostics).toEqual([]);
  });

  it("parses module imports meta declarations and procedure statements", () => {
    const document = parseChemdProgram(`module exp_golden_suzuki_screen

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-golden-suzuki-screen"
  title: "Suzuki coupling solvent screen"
  date: "2026-04-24"
  primary_reaction: @rxn_var1
  tags: ["suzuki", "screen"]
}

molecule mol_aryl {
  name: "aryl bromide"
  role: substrate
}

/// Selected variant.
reaction rxn_var1 {
  reactants: [@mol_aryl]
  solvent: "MeCN"
  temperature: 40 C
}

result res_var1 for @rxn_var1 {
  status: success
  yield: 78%
}

procedure proc_var1 for @rxn_var1 {
  evidence: [@res_var1]
  step charge = charge(inputs: [@mol_aryl])
  step heat = heat(duration: 2 h, depends_on: [charge])
}
`);

    expect(document).toMatchObject({
      type: "program_document",
      schemaVersion: "chemd-program-ast/v1",
      sourceLanguage: "chemd/program-v1",
      module: { kind: "module", name: "exp_golden_suzuki_screen" },
      imports: [
        {
          kind: "import",
          moduleName: "shared_solvents",
          alias: "solvents",
          from: "./shared-solvents.chemd"
        }
      ],
      meta: {
        kind: "meta",
        id: "exp-golden-suzuki-screen",
        title: "Suzuki coupling solvent screen",
        date: "2026-04-24",
        primary: {
          reaction: expect.objectContaining({ type: "reference", target: "rxn_var1" })
        }
      }
    });

    const reaction = document.declarations.find((item) => item.id === "rxn_var1");
    expect(reaction).toMatchObject({
      kind: "reaction",
      qualifiedId: "exp_golden_suzuki_screen.rxn_var1",
      docs: [{ docId: expect.any(String) }],
      fields: {
        reactants: expect.objectContaining({ type: "list" }),
        solvent: expect.objectContaining({ type: "string", value: "MeCN" }),
        temperature: expect.objectContaining({ type: "quantity", unit: "C" })
      },
      fieldSpans: {
        reactants: expect.any(Object),
        solvent: expect.any(Object),
        temperature: expect.any(Object)
      }
    });

    const result = document.declarations.find((item) => item.id === "res_var1");
    expect(result).toMatchObject({
      kind: "result",
      target: expect.objectContaining({ type: "reference", target: "rxn_var1" }),
      fields: {
        yield: expect.objectContaining({ type: "percent", value: 78 })
      }
    });

    const procedure = document.declarations.find((item) => item.id === "proc_var1");
    expect(procedure).toMatchObject({
      kind: "procedure",
      target: expect.objectContaining({ target: "rxn_var1" }),
      evidence: [expect.objectContaining({ target: "res_var1" })],
      children: [
        {
          kind: "step",
          id: "charge",
          family: "charge",
          inputs: [expect.objectContaining({ target: "mol_aryl" })]
        },
        {
          kind: "step",
          id: "heat",
          family: "heat",
          dependsOn: ["charge"]
        }
      ]
    });
    expect(document.docs[0]).toMatchObject({
      type: "doc_comment",
      attachment: { kind: "declaration", declarationId: "rxn_var1" }
    });
    expect(document.diagnostics).toEqual([]);
  });

  it("emits fatal diagnostics for removed legacy syntax", () => {
    const document = parseChemdProgram(`---
id: legacy
---

:::chemd #rxn-main
reactants: a
:::
`);

    expect(document.declarations).toEqual([]);
    expect(document.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "E_LEGACY_FRONTMATTER_REMOVED",
        "E_LEGACY_FENCED_BLOCK_REMOVED"
      ])
    );
  });

  it("emits diagnostics for unterminated declaration blocks", () => {
    const document = parseChemdProgram(`module exp_bad

meta {
  id: "exp-bad"
  title: "Bad"
  date: "2026-05-28"
}

reaction rxn_open {
  name: "open"
`);

    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_PROGRAM_BLOCK_CLOSE_EXPECTED",
        severity: "error"
      })
    );
  });

  it("maps value diagnostics to full source spans", () => {
    const document = parseChemdProgram(`module exp_bad_value

meta {
  id: "exp-bad-value"
  title: "Bad value"
  date: "2026-05-28"
}

reaction rxn_bad {
  refs: [@]
}
`);
    const diagnostic = document.diagnostics.find((item) =>
      item.message === "Expected reference target after '@'."
    );

    expect(diagnostic).toMatchObject({
      code: "E_PROGRAM_UNEXPECTED_TOKEN",
      sourceSpan: {
        startLine: 10,
        startColumn: 11
      }
    });
  });

  it("recovers later fields after a missing field colon", () => {
    const document = parseChemdProgram(`module exp_recover

meta {
  id: "exp-recover"
  title: "Recover"
  date: "2026-05-28"
}

reaction rxn_recover {
  broken
  solvent: "MeCN"
  temperature: 40 C
}
`);
    const reaction = document.declarations.find((item) => item.kind === "reaction");

    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_PROGRAM_FIELD_COLON_EXPECTED" })
    );
    expect(reaction).toMatchObject({
      fields: {
        solvent: expect.objectContaining({ type: "string", value: "MeCN" }),
        temperature: expect.objectContaining({ type: "quantity", unit: "C" })
      },
      fieldSpans: {
        solvent: { startLine: 11 },
        temperature: { startLine: 12 }
      }
    });
  });
});

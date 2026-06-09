import { describe, expect, it } from "vitest";

import { parseChemdProgram } from "@chemd/parser";

import { buildProgramTypeIndex, typecheckProgram } from "../src/index";

describe("buildProgramTypeIndex", () => {
  it("indexes expected and actual program field types with diagnostics", () => {
    const program = parseChemdProgram(`module exp_type_index

meta {
  id: "exp-type-index"
  title: "Type index"
  date: "2026-06-04"
}

reaction rxn_bad {
  temperature: "warm"
  reaction_smiles: "CCO>>CC=O"
  unexpected: "not allowed"
}
`);
    const checked = typecheckProgram(program);
    const index = buildProgramTypeIndex(checked.program, checked.diagnostics);

    expect(index.schemaVersion).toBe("chemd-type-index/v1");
    expect(index.documentId).toBe("exp-type-index");
    expect(index.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        declarationKind: "reaction",
        declarationId: "rxn_bad",
        field: "temperature",
        canonicalField: "temperature",
        expectedKind: "symbolic_quantity",
        actualKind: "string",
        valid: false,
        diagnosticCodes: ["E403"]
      }),
      expect.objectContaining({
        declarationKind: "reaction",
        declarationId: "rxn_bad",
        field: "reaction_smiles",
        canonicalField: "rxn_smiles",
        isAlias: true,
        expectedKind: "chemical",
        actualKind: "string",
        valid: true,
        diagnosticCodes: []
      }),
      expect.objectContaining({
        declarationKind: "reaction",
        declarationId: "rxn_bad",
        field: "unexpected",
        expectedKind: undefined,
        actualKind: "string",
        valid: false,
        diagnosticCodes: ["E_PROGRAM_FIELD_UNKNOWN"]
      })
    ]));
  });
});

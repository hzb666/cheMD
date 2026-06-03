import { describe, expect, it } from "vitest";

import { CHEMD_LANGUAGE_CONTRACT } from "../src/index";

describe("CHEMD_LANGUAGE_CONTRACT", () => {
  it("describes the program language surface for tools", () => {
    expect(CHEMD_LANGUAGE_CONTRACT).toMatchObject({
      schemaVersion: "chemd-language-contract/v0.5",
      sourceLanguage: "chemd/program-v1"
    });
    expect(CHEMD_LANGUAGE_CONTRACT.program.keywords).toEqual(expect.arrayContaining([
      "module",
      "import",
      "as",
      "from",
      "meta",
      "for",
      "step",
      "repeat",
      "until",
      "branch",
      "parallel",
      "wait",
      "abort_if",
      "timeline"
    ]));
    expect(CHEMD_LANGUAGE_CONTRACT.program.keywords).not.toContain("audit");
    expect(CHEMD_LANGUAGE_CONTRACT.program.tokenTypes).toEqual(expect.arrayContaining([
      "identifier",
      "string",
      "number",
      "at",
      "hash",
      "dot",
      "percent",
      "doc_comment"
    ]));
    expect(CHEMD_LANGUAGE_CONTRACT.program.declarationKinds).toEqual(expect.arrayContaining([
      "molecule",
      "reaction",
      "result",
      "procedure",
      "agent_run"
    ]));
    expect(CHEMD_LANGUAGE_CONTRACT.program.meta.primaryFields).toEqual([
      "primary_molecule",
      "primary_reaction",
      "primary_result",
      "primary_analysis",
      "primary_sample"
    ]);
    expect(CHEMD_LANGUAGE_CONTRACT.program.references.forms).toEqual(expect.arrayContaining([
      "@local",
      "@object.field",
      "@module.object",
      "@document#object"
    ]));
    expect(CHEMD_LANGUAGE_CONTRACT.program.parserCapabilities).toMatchObject({
      sourceSpans: true,
      diagnostics: true,
      recovery: true,
      docComments: true
    });
  });
});

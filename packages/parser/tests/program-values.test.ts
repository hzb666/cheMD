import { describe, expect, it } from "vitest";

import { lexProgram } from "../src/program/lexer";
import { parseProgramValue } from "../src/program/parse-values";

const parseValue = (source: string) => {
  const result = parseProgramValue(source, {
    references: { moduleNames: ["module"] }
  });
  expect(result.diagnostics).toEqual([]);
  expect(result.value).toBeDefined();
  return result.value;
};

describe("program lexer", () => {
  it("tokenizes program syntax with source spans", () => {
    const result = lexProgram("rxn { yield: 78% }\n@rxn.yield");

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.type)).toEqual([
      "identifier",
      "left_brace",
      "identifier",
      "colon",
      "number",
      "percent",
      "right_brace",
      "at",
      "identifier",
      "dot",
      "identifier",
      "eof"
    ]);
    expect(result.tokens[7]).toMatchObject({
      raw: "@",
      line: 2,
      column: 1,
      start: 19
    });
  });
});

describe("program value parser", () => {
  it("parses scalar values and preserves raw source", () => {
    expect(parseValue("\"MeCN\"")).toMatchObject({
      type: "string",
      value: "MeCN",
      raw: "\"MeCN\""
    });
    expect(parseValue("nitrogen")).toMatchObject({
      type: "identifier",
      name: "nitrogen",
      raw: "nitrogen"
    });
    expect(parseValue("true")).toMatchObject({
      type: "boolean",
      value: true,
      raw: "true"
    });
    expect(parseValue("40 C")).toMatchObject({
      type: "quantity",
      value: 40,
      unit: "C",
      raw: "40 C"
    });
    expect(parseValue("78%")).toMatchObject({
      type: "percent",
      value: 78,
      raw: "78%"
    });
  });

  it("parses local, field, module, and external references", () => {
    expect(parseValue("@rxn")).toMatchObject({
      type: "reference",
      refKind: "local",
      target: "rxn"
    });
    expect(parseValue("@rxn.yield")).toMatchObject({
      type: "reference",
      refKind: "field",
      target: "rxn",
      field: "yield"
    });
    expect(parseValue("@module.rxn")).toMatchObject({
      type: "reference",
      refKind: "module",
      moduleName: "module",
      target: "rxn"
    });
    expect(parseValue("@external#anchor")).toMatchObject({
      type: "reference",
      refKind: "external_document",
      externalDocumentId: "external",
      target: "anchor"
    });
  });

  it("parses list, record, and call values", () => {
    expect(parseValue("[@mol_aryl, @mol_boron]")).toMatchObject({
      type: "list",
      items: [
        { type: "reference", target: "mol_aryl" },
        { type: "reference", target: "mol_boron" }
      ]
    });

    expect(parseValue("{temperature: 40 C, solvent: \"MeCN\"}")).toMatchObject({
      type: "record",
      fields: [
        { key: "temperature", value: { type: "quantity", unit: "C" } },
        { key: "solvent", value: { type: "string", value: "MeCN" } }
      ]
    });

    expect(parseValue("heat(temperature: 40 C, duration: 2 h)")).toMatchObject({
      type: "call",
      callee: "heat",
      args: [
        { name: "temperature", value: { type: "quantity", unit: "C" } },
        { name: "duration", value: { type: "quantity", unit: "h" } }
      ]
    });
  });

  it("diagnoses trailing tokens after one complete value", () => {
    const result = parseProgramValue("@rxn @extra");

    expect(result.value).toMatchObject({ type: "reference", target: "rxn" });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_PROGRAM_UNEXPECTED_TRAILING_TOKEN",
        sourceSpan: expect.objectContaining({ startColumn: 6 })
      })
    );
  });
});

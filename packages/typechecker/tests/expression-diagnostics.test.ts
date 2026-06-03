import { describe, expect, it } from "vitest";

import { resolveDerivedField } from "../src/expressions";

const context = {
  objectIndex: new Map(),
  sourceNodeType: "reaction",
  sourceNodeId: "rxn_bad",
  field: "temperature"
};

describe("derived expression diagnostics", () => {
  it("reports tokenizer failures with structured facts", () => {
    const result = resolveDerivedField("=1 ^ 2", context);

    expect(result.diagnostic).toMatchObject({
      code: "E_DERIVED_EXPRESSION_INVALID",
      facts: expect.objectContaining({
        expression_error_code: "E_EXPRESSION_UNSUPPORTED_TOKEN",
        expression_error_message: "Unsupported expression token: ^",
        token: "^",
        index: 2
      })
    });
  });

  it("reports evaluator failures with structured facts", () => {
    const result = resolveDerivedField("=1 / 0", context);

    expect(result.diagnostic).toMatchObject({
      code: "E_DERIVED_EXPRESSION_INVALID",
      facts: expect.objectContaining({
        expression_error_code: "E_EXPRESSION_DIVISION_BY_ZERO",
        expression_error_message: "Division by zero is not allowed",
        operator: "/"
      })
    });
  });

  it("reports function argument failures with structured facts", () => {
    const result = resolveDerivedField("=percent(1)", context);

    expect(result.diagnostic).toMatchObject({
      code: "E_DERIVED_EXPRESSION_INVALID",
      facts: expect.objectContaining({
        expression_error_code: "E_EXPRESSION_MISSING_ARGUMENT",
        expression_error_message: "percent requires argument 2",
        function_name: "percent",
        argument_index: 1
      })
    });
  });
});

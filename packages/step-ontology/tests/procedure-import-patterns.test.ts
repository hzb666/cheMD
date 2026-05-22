import { describe, expect, it } from "vitest";

import {
  PROCEDURE_IMPORT_RULES,
  STEP_FAMILIES,
  getStepParamSchema
} from "../src/index";

describe("procedure import pattern schema drift", () => {
  it("uses unique rule ids with bounded confidence values", () => {
    const ids = PROCEDURE_IMPORT_RULES.map((rule) => rule.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(PROCEDURE_IMPORT_RULES.every((rule) =>
      rule.confidence > 0 && rule.confidence <= 1
    )).toBe(true);
    expect(PROCEDURE_IMPORT_RULES.every((rule) =>
      rule.triggerPatterns.length > 0
    )).toBe(true);
  });

  it("only references existing step families", () => {
    const unknownFamilies = PROCEDURE_IMPORT_RULES
      .map((rule) => rule.family)
      .filter((family) => !STEP_FAMILIES.has(family));

    expect(unknownFamilies).toEqual([]);
  });

  it("only produces parameters known by the step schema", () => {
    const unknownParams = PROCEDURE_IMPORT_RULES.flatMap((rule) =>
      rule.producedParams
        .filter((param) => getStepParamSchema(rule.family, param) === undefined)
        .map((param) => `${rule.id}:${rule.family}.${param}`)
    );

    expect(unknownParams).toEqual([]);
  });
});

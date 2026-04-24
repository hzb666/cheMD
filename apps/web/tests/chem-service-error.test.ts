import { describe, expect, it } from "vitest";

import { ChemServiceError, isChemServiceError } from "../src/server/chem/chem-service-error";

describe("chem-service-error guards", () => {
  it("accepts typed chem service errors and plain objects with string codes", () => {
    expect(
      isChemServiceError(new ChemServiceError("boom", { status: 502, code: "UPSTREAM_FAILURE" }))
    ).toBe(true);
    expect(
      isChemServiceError({ status: 502, message: "boom", code: "UPSTREAM_FAILURE" })
    ).toBe(true);
    expect(
      isChemServiceError({ status: 502, message: "boom" })
    ).toBe(true);
  });

  it("rejects error-like objects whose optional code is not a string", () => {
    expect(
      isChemServiceError({ status: 502, message: "boom", code: 503 })
    ).toBe(false);
  });
});

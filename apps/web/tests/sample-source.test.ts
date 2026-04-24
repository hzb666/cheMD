import { describe, expect, it } from "vitest";
import { compileChemd } from "@chemd/compiler";

import { sampleSource } from "../src/features/playground/lib/sample-source";

describe("sampleSource", () => {
  it("defaults to explicit chemd kinds and structured procedure steps", () => {
    const result = compileChemd(sampleSource);

    expect(sampleSource).toContain("kind: reaction");
    expect(sampleSource).toContain("kind: molecule");
    expect(sampleSource).toContain(":::step heat-main");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "W_CHEMD_KIND_INFERRED"
    );
    expect(result.stepGraph.procedures[0]).toMatchObject({
      sourceType: "explicit_steps"
    });
  });
});

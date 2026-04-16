import { describe, expect, it } from "vitest";

import {
  buildQuickFixes,
  createV03Diagnostic,
  getDiagnosticSpec,
  getLegacyDiagnosticBand
} from "../src/index";

describe("v0.3 diagnostics registry", () => {
  it("creates stable diagnostics with source-layer metadata", () => {
    const diagnostic = createV03Diagnostic({
      code: "E403",
      severity: "warning",
      message: "Unable to parse quantity",
      sourceLayer: "typechecker",
      sourceNodeId: "rxn-main",
      sourceNodeType: "reaction",
      facts: {
        field: "temperature",
        raw_value: "warm overnight"
      }
    });

    expect(diagnostic.code).toBe("E403");
    expect(diagnostic.sourceLayer).toBe("typechecker");
    expect(getDiagnosticSpec("E403")?.band).toBe("quantity");
    expect(getLegacyDiagnosticBand("E_MISSING_REQUIRED_FIELD")).toBe("type");
  });

  it("builds quick fixes in the existing Markdown syntax", () => {
    const diagnostic = createV03Diagnostic({
      code: "E403",
      severity: "warning",
      message: "Unable to parse quantity",
      sourceLayer: "typechecker",
      facts: {
        field: "temperature",
        raw_value: "warm overnight"
      }
    });

    expect(buildQuickFixes(diagnostic)[0]).toMatchObject({
      kind: "normalize_unit",
      title: expect.stringContaining("temperature")
    });
  });
});

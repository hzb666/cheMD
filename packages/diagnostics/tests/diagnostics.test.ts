import { describe, expect, it } from "vitest";

import {
  buildQuickFixes,
  createV03Diagnostic,
  explainDiagnosticCode,
  getDiagnosticSpec
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

  it("describes spaced percent literal quick fixes without treating % as a unit", () => {
    const diagnostic = createV03Diagnostic({
      code: "E403",
      severity: "error",
      message: "Percent literal must not contain a space before %",
      sourceLayer: "typechecker",
      facts: {
        field: "yield",
        raw_value: "80 %",
        expected_quantity_class: "percent"
      }
    });

    expect(buildQuickFixes(diagnostic)[0]).toMatchObject({
      kind: "normalize_unit",
      title: "Remove the space before % in yield"
    });
  });

  it("classifies compact ordinary unit spacing as a quantity warning", () => {
    const diagnostic = createV03Diagnostic({
      code: "W_QUANTITY_UNIT_SPACING",
      severity: "warning",
      message: "Insert a space between value and unit",
      sourceLayer: "typechecker",
      facts: {
        field: "volume",
        raw_value: "1ml",
        expected_quantity_class: "volume"
      }
    });

    expect(getDiagnosticSpec("W_QUANTITY_UNIT_SPACING")).toMatchObject({
      band: "quantity",
      defaultSeverity: "warning"
    });
    expect(buildQuickFixes(diagnostic)[0]).toMatchObject({
      kind: "normalize_unit",
      title: "Insert a space between value and unit in volume"
    });
  });

  it("classifies explicit step rule diagnostics", () => {
    expect(getDiagnosticSpec("E_STEP_PARAM_MISSING")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_STEP_PARAM_INVALID")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_STEP_DEPENDENCY_CYCLE")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_STEP_ID_DUPLICATE")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_TYPED_REFERENCE_MISMATCH")?.band).toBe("reference");
    expect(getDiagnosticSpec("E_OBSERVATION_EVENT_INVALID_TYPE")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_OBSERVATION_LINKED_STEP_MISSING")?.band).toBe("reference");
  });

  it("classifies program language diagnostics", () => {
    expect(getDiagnosticSpec("E_PROGRAM_META_EXPECTED")?.band).toBe("syntax");
    expect(getDiagnosticSpec("E_PROGRAM_PROCEDURE_STEP_EXPECTED")?.band).toBe("syntax");
    expect(getDiagnosticSpec("E_PROGRAM_PROCEDURE_CONTROL_ARG_EXPECTED")?.band).toBe("syntax");
    expect(getDiagnosticSpec("E_PROGRAM_UNEXPECTED_TRAILING_TOKEN")?.band).toBe("syntax");
    expect(getDiagnosticSpec("E_PROGRAM_META_FIELD_REQUIRED")?.band).toBe("type");
    expect(getDiagnosticSpec("E_PROGRAM_REFERENCE_TARGET_KIND")?.band).toBe("reference");
    expect(getDiagnosticSpec("E_MODULE_ENTRY_NOT_FOUND")?.band).toBe("reference");
    expect(getDiagnosticSpec("E_UNRESOLVED_PROGRAM_REFERENCE")?.band).toBe("reference");
  });

  it("classifies procedure control diagnostics", () => {
    expect(getDiagnosticSpec("E_PROCEDURE_CONTROL_CONTEXT")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_PROCEDURE_CONTROL_CONDITION")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_CONDITION_TYPE_MISMATCH")?.band).toBe("type");
    expect(getDiagnosticSpec("E_PROCEDURE_CONTROL_PARALLEL")?.band).toBe("procedure");
    expect(getDiagnosticSpec("E_PROCEDURE_CONTROL_ID_DUPLICATE")?.band).toBe("procedure");
    expect(getDiagnosticSpec("W_PROCEDURE_CONTROL_DYNAMIC")).toMatchObject({
      band: "procedure",
      defaultSeverity: "warning"
    });
  });

  it("explains registered and unknown diagnostic codes", () => {
    expect(explainDiagnosticCode("E_PROCEDURE_STATE_INVALID")).toMatchObject({
      band: "procedure",
      code: "E_PROCEDURE_STATE_INVALID",
      defaultSeverity: "error",
      known: true,
      source: "registry",
      title: "Invalid procedure state transition"
    });
    expect(explainDiagnosticCode("E_DOES_NOT_EXIST")).toMatchObject({
      code: "E_DOES_NOT_EXIST",
      known: false,
      source: "unknown"
    });
  });

  it("classifies template parameter diagnostics", () => {
    expect(getDiagnosticSpec("E_TEMPLATE_PARAM_MISSING")?.band).toBe("type");
    expect(getDiagnosticSpec("E_TEMPLATE_PARAM_TYPE_MISMATCH")?.band).toBe("type");
  });

  it("classifies derived expression diagnostics", () => {
    expect(getDiagnosticSpec("E_DERIVED_EXPRESSION_INVALID")?.band).toBe("type");
  });

  it("classifies runtime diagnostics", () => {
    expect(getDiagnosticSpec("E_RUNTIME_UNKNOWN_STEP")?.band).toBe("runtime");
    expect(getDiagnosticSpec("E_RUNTIME_STEP_NOT_READY")?.band).toBe("runtime");
    expect(getDiagnosticSpec("E_RUNTIME_CONTROL_DYNAMIC")?.band).toBe("runtime");
    expect(getDiagnosticSpec("E_RUNTIME_CONTROL")?.band).toBe("runtime");
    expect(getDiagnosticSpec("E_RUNTIME_INVENTORY")?.band).toBe("runtime");
    expect(getDiagnosticSpec("E_RUNTIME_ADAPTER")?.band).toBe("runtime");
    expect(getDiagnosticSpec("E_RUNTIME_RESOURCE_CONFLICT")?.band).toBe("runtime");
    expect(getDiagnosticSpec("W_RUNTIME_SAFETY")?.band).toBe("runtime");
  });
});

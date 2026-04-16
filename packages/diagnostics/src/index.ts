import type { DiagnosticSeverity, SourceRange } from "@chemd/core";

export type DiagnosticSourceLayer =
  | "frontmatter"
  | "parser"
  | "resolver"
  | "typechecker"
  | "procedure_lowering"
  | "runtime_preflight"
  | "training_export";

export type QuickFixKind =
  | "replace_text"
  | "insert_field"
  | "normalize_unit"
  | "split_procedure_sentence"
  | "add_block"
  | "link_reference";

export interface QuickFix {
  title: string;
  kind: QuickFixKind;
  patch?: unknown;
}

export interface V03Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  position?: SourceRange;
  nodeId?: string;
  sourceLayer: DiagnosticSourceLayer;
  sourceNodeType?: string;
  sourceNodeId?: string;
  facts?: Record<string, unknown>;
  quickFixes?: QuickFix[];
}

export interface DiagnosticInput extends Omit<V03Diagnostic, "quickFixes"> {
  quickFixes?: QuickFix[];
}

export type DiagnosticBand =
  | "syntax"
  | "reference"
  | "type"
  | "quantity"
  | "procedure"
  | "safety"
  | "runtime"
  | "heuristic"
  | "info";

export interface DiagnosticSpec {
  code: string;
  band: DiagnosticBand;
  title: string;
  defaultSeverity: DiagnosticSeverity;
}

const DIAGNOSTIC_SPECS: DiagnosticSpec[] = [
  { code: "E301", band: "type", title: "Missing required field", defaultSeverity: "error" },
  { code: "E306", band: "type", title: "Invalid status value", defaultSeverity: "warning" },
  { code: "E401", band: "quantity", title: "Invalid unit", defaultSeverity: "warning" },
  { code: "E402", band: "quantity", title: "Invalid percent value", defaultSeverity: "warning" },
  { code: "E403", band: "quantity", title: "Quantity parse failed", defaultSeverity: "warning" },
  { code: "E501", band: "procedure", title: "Procedure lowering failed", defaultSeverity: "error" },
  { code: "E504", band: "procedure", title: "Analysis step unbound", defaultSeverity: "warning" },
  { code: "E505", band: "procedure", title: "Observation stage ambiguous", defaultSeverity: "warning" },
  { code: "E605", band: "safety", title: "Capability required but missing", defaultSeverity: "error" },
  { code: "E701", band: "runtime", title: "Run plan build failed", defaultSeverity: "error" },
  { code: "W805", band: "heuristic", title: "Low confidence step extraction", defaultSeverity: "warning" },
  { code: "W806", band: "heuristic", title: "Observation could be structured", defaultSeverity: "warning" },
  { code: "I903", band: "info", title: "Procedure lowered successfully", defaultSeverity: "info" }
];

const LEGACY_BANDS: Record<string, DiagnosticBand> = {
  E_INVALID_ID: "syntax",
  E_DUPLICATE_ID: "syntax",
  E_MISSING_REQUIRED_FIELD: "type",
  W_UNKNOWN_FIELD: "heuristic",
  W_UNKNOWN_BLOCK: "heuristic",
  W_UNRESOLVED_REFERENCE: "reference",
  E_INVALID_PRIMARY_REFERENCE: "reference",
  E_UNKNOWN_TEMPLATE: "reference",
  E_DUPLICATE_TEMPLATE: "reference",
  E_TEMPLATE_CYCLE: "reference",
  W_INVALID_FRONTMATTER_LINE: "syntax",
  W_UNKNOWN_RENDER_PROFILE: "heuristic",
  E_RENDER_PROFILE_CYCLE: "reference",
  W_UNKNOWN_RENDER_PROFILE_FIELD: "heuristic",
  E_INVALID_RENDER_PROFILE_VALUE: "type"
};

const SPEC_BY_CODE = new Map(DIAGNOSTIC_SPECS.map((spec) => [spec.code, spec]));

const isQuantityDiagnostic = (diagnostic: V03Diagnostic): boolean =>
  ["E401", "E402", "E403"].includes(diagnostic.code);

const createQuantityQuickFix = (diagnostic: V03Diagnostic): QuickFix => {
  const field = typeof diagnostic.facts?.field === "string" ? diagnostic.facts.field : "field";

  return {
    title: `Clarify ${field} using a numeric value and unit in the current block syntax`,
    kind: "normalize_unit",
    patch: {
      field,
      raw_value: diagnostic.facts?.raw_value
    }
  };
};

const createProcedureQuickFix = (): QuickFix => ({
  title: "Rewrite this procedure prose as a numbered list in the existing procedure block",
  kind: "split_procedure_sentence"
});

export const getDiagnosticSpec = (code: string): DiagnosticSpec | undefined => SPEC_BY_CODE.get(code);

export const getLegacyDiagnosticBand = (code: string): DiagnosticBand | undefined => LEGACY_BANDS[code];

export const buildQuickFixes = (diagnostic: V03Diagnostic): QuickFix[] => {
  if (isQuantityDiagnostic(diagnostic)) {
    return [createQuantityQuickFix(diagnostic)];
  }

  if (diagnostic.code === "W805") {
    return [createProcedureQuickFix()];
  }

  return [];
};

export const createV03Diagnostic = (input: DiagnosticInput): V03Diagnostic => {
  const diagnostic: V03Diagnostic = {
    ...input,
    nodeId: input.nodeId ?? input.sourceNodeId
  };
  const quickFixes = input.quickFixes ?? buildQuickFixes(diagnostic);

  return quickFixes.length > 0
    ? {
        ...diagnostic,
        quickFixes
      }
    : diagnostic;
};

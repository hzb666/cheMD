import type { DiagnosticSeverity, SourceRange } from "@chemd/core";

export type DiagnosticSourceLayer =
  | "frontmatter"
  | "parser"
  | "resolver"
  | "typechecker"
  | "lowering"
  | "procedure_lowering"
  | "runtime_preflight"
  | "export"
  | "training_export";

export type QuickFixKind =
  | "replace_text"
  | "insert_field"
  | "convert_legacy_block"
  | "insert_chemd_kind"
  | "insert_step_skeleton"
  | "split_procedure_to_steps"
  | "insert_missing_id"
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
  sourceField?: string;
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
  { code: "W_LEGACY_BLOCK_KIND", band: "syntax", title: "Legacy surface block", defaultSeverity: "warning" },
  { code: "W_UNKNOWN_BLOCK", band: "syntax", title: "Unknown block", defaultSeverity: "error" },
  { code: "W_CHEMD_KIND_AMBIGUOUS", band: "syntax", title: "Ambiguous chemd kind", defaultSeverity: "error" },
  { code: "E_CHEMD_KIND_CONFLICT", band: "syntax", title: "Conflicting chemd kind", defaultSeverity: "error" },
  { code: "E_STEP_INVALID_FAMILY", band: "procedure", title: "Invalid step family", defaultSeverity: "error" },
  { code: "E_STEP_MISSING_FIELD", band: "procedure", title: "Missing step field", defaultSeverity: "error" },
  { code: "E_STEP_PARAM_MISSING", band: "procedure", title: "Missing step parameter", defaultSeverity: "error" },
  { code: "E_STEP_PARAM_INVALID", band: "procedure", title: "Invalid step parameter", defaultSeverity: "error" },
  { code: "E_STEP_DEPENDENCY_CYCLE", band: "procedure", title: "Step dependency cycle", defaultSeverity: "error" },
  { code: "E_STEP_ID_DUPLICATE", band: "procedure", title: "Duplicate step id", defaultSeverity: "error" },
  { code: "E_STEP_INVALID_REFERENCE", band: "reference", title: "Invalid step reference", defaultSeverity: "error" },
  { code: "E_TYPED_REFERENCE_MISMATCH", band: "reference", title: "Typed reference mismatch", defaultSeverity: "error" },
  { code: "E_RESULT_REACTION_CONFLICT", band: "type", title: "Result reaction conflict", defaultSeverity: "error" },
  { code: "E_TEMPLATE_PARAM_MISSING", band: "type", title: "Missing template parameter", defaultSeverity: "error" },
  { code: "E_TEMPLATE_PARAM_TYPE_MISMATCH", band: "type", title: "Template parameter type mismatch", defaultSeverity: "error" },
  { code: "E_DERIVED_EXPRESSION_INVALID", band: "type", title: "Invalid derived expression", defaultSeverity: "error" },
  { code: "E_OBSERVATION_EVENT_INVALID_TYPE", band: "procedure", title: "Invalid observation event type", defaultSeverity: "error" },
  { code: "E_OBSERVATION_LINKED_STEP_MISSING", band: "reference", title: "Missing linked observation step", defaultSeverity: "error" },
  { code: "W_PROCEDURE_PROSE_LOWERED", band: "procedure", title: "Procedure prose lowered", defaultSeverity: "warning" },
  { code: "W_OBSERVATION_PROSE_LOWERED", band: "procedure", title: "Observation prose lowered", defaultSeverity: "warning" },
  { code: "E_RUNTIME_UNKNOWN_STEP", band: "runtime", title: "Unknown runtime step", defaultSeverity: "error" },
  { code: "E_RUNTIME_STEP_NOT_READY", band: "runtime", title: "Runtime step not ready", defaultSeverity: "error" },
  { code: "E301", band: "type", title: "Missing required field", defaultSeverity: "error" },
  { code: "E306", band: "type", title: "Invalid status value", defaultSeverity: "error" },
  { code: "E401", band: "quantity", title: "Invalid unit", defaultSeverity: "error" },
  { code: "E402", band: "quantity", title: "Invalid percent value", defaultSeverity: "error" },
  { code: "E403", band: "quantity", title: "Quantity parse failed", defaultSeverity: "error" },
  { code: "E501", band: "procedure", title: "Procedure lowering failed", defaultSeverity: "error" },
  { code: "E504", band: "procedure", title: "Analysis step unbound", defaultSeverity: "error" },
  { code: "E505", band: "procedure", title: "Observation stage ambiguous", defaultSeverity: "error" },
  { code: "E605", band: "safety", title: "Capability required but missing", defaultSeverity: "error" },
  { code: "E701", band: "runtime", title: "Run plan build failed", defaultSeverity: "error" },
  { code: "W805", band: "heuristic", title: "Low confidence step extraction", defaultSeverity: "warning" },
  { code: "W806", band: "heuristic", title: "Observation could be structured", defaultSeverity: "warning" },
  { code: "I903", band: "info", title: "Procedure lowered successfully", defaultSeverity: "info" }
];

const LEGACY_BANDS: Record<string, DiagnosticBand> = {
  E_INVALID_ID: "syntax",
  E_DUPLICATE_ID: "syntax",
  W_LEGACY_BLOCK_KIND: "syntax",
  W_CHEMD_KIND_AMBIGUOUS: "syntax",
  E_CHEMD_KIND_CONFLICT: "syntax",
  E_STEP_INVALID_FAMILY: "procedure",
  E_STEP_MISSING_FIELD: "procedure",
  E_STEP_PARAM_MISSING: "procedure",
  E_STEP_PARAM_INVALID: "procedure",
  E_STEP_DEPENDENCY_CYCLE: "procedure",
  E_STEP_ID_DUPLICATE: "procedure",
  E_STEP_INVALID_REFERENCE: "reference",
  E_TYPED_REFERENCE_MISMATCH: "reference",
  E_RESULT_REACTION_CONFLICT: "type",
  E_TEMPLATE_PARAM_MISSING: "type",
  E_TEMPLATE_PARAM_TYPE_MISMATCH: "type",
  E_DERIVED_EXPRESSION_INVALID: "type",
  E_OBSERVATION_EVENT_INVALID_TYPE: "procedure",
  E_OBSERVATION_LINKED_STEP_MISSING: "reference",
  W_PROCEDURE_PROSE_LOWERED: "procedure",
  W_OBSERVATION_PROSE_LOWERED: "procedure",
  E_RUNTIME_UNKNOWN_STEP: "runtime",
  E_RUNTIME_STEP_NOT_READY: "runtime",
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

const createLegacyBlockQuickFix = (diagnostic: V03Diagnostic): QuickFix => ({
  title: "Convert this legacy block to canonical chemd syntax",
  kind: "convert_legacy_block",
  patch: {
    source_node_type: diagnostic.sourceNodeType,
    source_node_id: diagnostic.sourceNodeId
  }
});

const isLegacySurfaceDiagnostic = (diagnostic: V03Diagnostic): boolean =>
  diagnostic.code === "W_LEGACY_BLOCK_KIND"
  || (
    diagnostic.code === "W_UNKNOWN_BLOCK"
    && (
      diagnostic.sourceNodeType === "molecule"
      || diagnostic.sourceNodeType === "reaction"
      || typeof diagnostic.facts?.legacy_block_kind === "string"
    )
  );

const createInsertChemdKindQuickFix = (
  diagnostic: V03Diagnostic,
  kind: "molecule" | "reaction"
): QuickFix => ({
  title: `Insert kind: ${kind} in this chemd block`,
  kind: "insert_chemd_kind",
  patch: {
    source_node_type: diagnostic.sourceNodeType,
    source_node_id: diagnostic.sourceNodeId,
    kind
  }
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

  if (isLegacySurfaceDiagnostic(diagnostic)) {
    return [createLegacyBlockQuickFix(diagnostic)];
  }

  if (diagnostic.code === "W_CHEMD_KIND_AMBIGUOUS") {
    return diagnostic.sourceNodeId
      ? [
          createInsertChemdKindQuickFix(diagnostic, "molecule"),
          createInsertChemdKindQuickFix(diagnostic, "reaction")
        ]
      : [];
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

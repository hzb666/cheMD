import type { DiagnosticSeverity, SourceRange, SourceSpan } from "@chemd/core";

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
  sourceSpan?: SourceSpan;
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
  { code: "W_UNKNOWN_BLOCK", band: "syntax", title: "Unknown block", defaultSeverity: "error" },
  { code: "E_PROGRAM_MODULE_EXPECTED", band: "syntax", title: "Missing module declaration", defaultSeverity: "error" },
  { code: "E_PROGRAM_MODULE_NAME_EXPECTED", band: "syntax", title: "Missing module name", defaultSeverity: "error" },
  { code: "E_PROGRAM_META_EXPECTED", band: "syntax", title: "Missing meta declaration", defaultSeverity: "error" },
  { code: "E_PROGRAM_DECLARATION_EXPECTED", band: "syntax", title: "Missing program declaration", defaultSeverity: "error" },
  { code: "E_PROGRAM_DECLARATION_ID_EXPECTED", band: "syntax", title: "Missing declaration id", defaultSeverity: "error" },
  { code: "E_PROGRAM_BLOCK_OPEN_EXPECTED", band: "syntax", title: "Missing block open", defaultSeverity: "error" },
  { code: "E_PROGRAM_BLOCK_CLOSE_EXPECTED", band: "syntax", title: "Missing block close", defaultSeverity: "error" },
  { code: "E_PROGRAM_FIELD_NAME_EXPECTED", band: "syntax", title: "Missing field name", defaultSeverity: "error" },
  { code: "E_PROGRAM_FIELD_COLON_EXPECTED", band: "syntax", title: "Missing field colon", defaultSeverity: "error" },
  { code: "E_PROGRAM_EXPECTED_VALUE", band: "syntax", title: "Missing program value", defaultSeverity: "error" },
  { code: "E_PROGRAM_UNEXPECTED_TRAILING_TOKEN", band: "syntax", title: "Unexpected trailing token", defaultSeverity: "error" },
  { code: "E_PROGRAM_UNEXPECTED_TOKEN", band: "syntax", title: "Unexpected token", defaultSeverity: "error" },
  { code: "E_PROGRAM_UNTERMINATED_TOKEN", band: "syntax", title: "Unterminated token", defaultSeverity: "error" },
  { code: "E_PROGRAM_IMPORT_EXPECTED", band: "syntax", title: "Missing import keyword", defaultSeverity: "error" },
  { code: "E_PROGRAM_IMPORT_MODULE_EXPECTED", band: "syntax", title: "Missing import module", defaultSeverity: "error" },
  { code: "E_PROGRAM_IMPORT_ALIAS_EXPECTED", band: "syntax", title: "Missing import alias", defaultSeverity: "error" },
  { code: "E_PROGRAM_IMPORT_FROM_EXPECTED", band: "syntax", title: "Missing import source keyword", defaultSeverity: "error" },
  { code: "E_PROGRAM_IMPORT_SOURCE_EXPECTED", band: "syntax", title: "Missing import source", defaultSeverity: "error" },
  { code: "E_PROGRAM_TARGET_REFERENCE_EXPECTED", band: "syntax", title: "Missing target reference", defaultSeverity: "error" },
  { code: "E_PROGRAM_IDENTIFIER_PATH_EXPECTED", band: "syntax", title: "Missing identifier path", defaultSeverity: "error" },
  { code: "E_PROGRAM_PAREN_CLOSE_EXPECTED", band: "syntax", title: "Missing closing parenthesis", defaultSeverity: "error" },
  { code: "E_PROGRAM_EXPECTED_CALL_ARG_ASSIGNMENT", band: "syntax", title: "Missing call argument assignment", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_EXPECTED", band: "syntax", title: "Missing procedure keyword", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_ID_EXPECTED", band: "syntax", title: "Missing procedure id", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_BLOCK_EXPECTED", band: "syntax", title: "Missing procedure block", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_STATEMENT_EXPECTED", band: "syntax", title: "Missing procedure statement", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_STEP_EXPECTED", band: "syntax", title: "Missing procedure step", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_STEP_ID_EXPECTED", band: "syntax", title: "Missing procedure step id", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_STEP_ASSIGN_EXPECTED", band: "syntax", title: "Missing procedure step assignment", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_STEP_CALL_EXPECTED", band: "syntax", title: "Missing procedure step call", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_CONTROL_ID_EXPECTED", band: "syntax", title: "Missing procedure control id", defaultSeverity: "error" },
  { code: "E_PROGRAM_PROCEDURE_CONTROL_ARG_EXPECTED", band: "syntax", title: "Missing procedure control argument", defaultSeverity: "error" },
  { code: "W_CHEMD_KIND_AMBIGUOUS", band: "syntax", title: "Ambiguous chemd kind", defaultSeverity: "error" },
  { code: "E_CHEMD_KIND_CONFLICT", band: "syntax", title: "Conflicting chemd kind", defaultSeverity: "error" },
  { code: "E_DUPLICATE_IMPORT_ALIAS", band: "reference", title: "Duplicate import alias", defaultSeverity: "error" },
  { code: "E_DUPLICATE_IMPORT_MODULE", band: "reference", title: "Duplicate import module", defaultSeverity: "error" },
  { code: "E_DUPLICATE_DECLARATION", band: "reference", title: "Duplicate declaration", defaultSeverity: "error" },
  { code: "E_DUPLICATE_QUALIFIED_DECLARATION", band: "reference", title: "Duplicate qualified declaration", defaultSeverity: "error" },
  { code: "E_UNRESOLVED_PROGRAM_REFERENCE", band: "reference", title: "Unresolved program reference", defaultSeverity: "error" },
  { code: "E_MODULE_ENTRY_NOT_FOUND", band: "reference", title: "Module entry not found", defaultSeverity: "error" },
  { code: "E_MODULE_IMPORT_NOT_FOUND", band: "reference", title: "Module import not found", defaultSeverity: "error" },
  { code: "E_MODULE_IMPORT_CYCLE", band: "reference", title: "Module import cycle", defaultSeverity: "error" },
  { code: "E_MODULE_SYMBOL_NOT_FOUND", band: "reference", title: "Module symbol not found", defaultSeverity: "error" },
  { code: "E_STEP_INVALID_FAMILY", band: "procedure", title: "Invalid step family", defaultSeverity: "error" },
  { code: "E_STEP_MISSING_FIELD", band: "procedure", title: "Missing step field", defaultSeverity: "error" },
  { code: "E_STEP_PARAM_MISSING", band: "procedure", title: "Missing step parameter", defaultSeverity: "error" },
  { code: "E_STEP_PARAM_INVALID", band: "procedure", title: "Invalid step parameter", defaultSeverity: "error" },
  { code: "E_STEP_DEPENDENCY_CYCLE", band: "procedure", title: "Step dependency cycle", defaultSeverity: "error" },
  { code: "E_STEP_ID_DUPLICATE", band: "procedure", title: "Duplicate step id", defaultSeverity: "error" },
  { code: "E_STEP_INVALID_REFERENCE", band: "reference", title: "Invalid step reference", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_ID", band: "procedure", title: "Missing procedure control id", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_COUNT", band: "procedure", title: "Invalid procedure repeat count", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_BODY", band: "procedure", title: "Invalid procedure control body", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_CONDITION", band: "procedure", title: "Invalid procedure control condition", defaultSeverity: "error" },
  { code: "E_CONDITION_TYPE_MISMATCH", band: "type", title: "Condition expression type mismatch", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_CONTEXT", band: "procedure", title: "Invalid procedure control context", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_BRANCH", band: "procedure", title: "Invalid procedure branch", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_PARALLEL", band: "procedure", title: "Invalid procedure parallel control", defaultSeverity: "error" },
  { code: "E_PROCEDURE_CONTROL_ID_DUPLICATE", band: "procedure", title: "Duplicate procedure control id", defaultSeverity: "error" },
  { code: "W_PROCEDURE_CONTROL_DYNAMIC", band: "procedure", title: "Dynamic procedure control review", defaultSeverity: "warning" },
  { code: "E_TYPED_REFERENCE_MISMATCH", band: "reference", title: "Typed reference mismatch", defaultSeverity: "error" },
  { code: "E_PROGRAM_META_FIELD_REQUIRED", band: "type", title: "Missing meta field", defaultSeverity: "error" },
  { code: "E_PROGRAM_FIELD_UNKNOWN", band: "type", title: "Unknown declaration field", defaultSeverity: "error" },
  { code: "E_PROGRAM_FIELD_VALUE_KIND", band: "type", title: "Invalid declaration field value", defaultSeverity: "error" },
  { code: "E_STEP_PARAM_TYPE_MISMATCH", band: "procedure", title: "Step parameter type mismatch", defaultSeverity: "error" },
  { code: "E_PROGRAM_RECORD_FIELD_UNKNOWN", band: "type", title: "Unknown record field", defaultSeverity: "error" },
  { code: "E_PROGRAM_REFERENCE_TARGET_KIND", band: "reference", title: "Reference target kind mismatch", defaultSeverity: "error" },
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
  { code: "E_RUNTIME_CAPABILITY_MISSING", band: "runtime", title: "Runtime capability missing", defaultSeverity: "error" },
  { code: "E_RUNTIME_DEVICE_RANGE", band: "runtime", title: "Runtime device range violation", defaultSeverity: "error" },
  { code: "E_RUNTIME_INVENTORY_UNAVAILABLE", band: "runtime", title: "Runtime inventory unavailable", defaultSeverity: "error" },
  { code: "E_RUNTIME_INVENTORY_EXPIRED", band: "runtime", title: "Runtime inventory expired", defaultSeverity: "warning" },
  { code: "E_RUNTIME_SAFETY_CONFIRMATION", band: "runtime", title: "Runtime safety confirmation", defaultSeverity: "error" },
  { code: "E_RUNTIME_SAFETY_TAG", band: "runtime", title: "Runtime safety tag", defaultSeverity: "warning" },
  { code: "E_RUNTIME_SAFETY_RULE", band: "runtime", title: "Runtime safety rule", defaultSeverity: "error" },
  { code: "E_RUNTIME_CONTROL_DYNAMIC", band: "runtime", title: "Runtime dynamic control", defaultSeverity: "error" },
  { code: "E_RUNTIME_CONTROL", band: "runtime", title: "Runtime control issue", defaultSeverity: "error" },
  { code: "E_RUNTIME_INVENTORY", band: "runtime", title: "Runtime inventory issue", defaultSeverity: "error" },
  { code: "E_RUNTIME_ADAPTER", band: "runtime", title: "Runtime adapter issue", defaultSeverity: "error" },
  { code: "E_RUNTIME_RESOURCE_CONFLICT", band: "runtime", title: "Runtime resource conflict", defaultSeverity: "error" },
  { code: "W_RUNTIME_SAFETY", band: "runtime", title: "Runtime safety review", defaultSeverity: "warning" },
  { code: "E301", band: "type", title: "Missing required field", defaultSeverity: "error" },
  { code: "E306", band: "type", title: "Invalid status value", defaultSeverity: "error" },
  { code: "E401", band: "quantity", title: "Invalid unit", defaultSeverity: "error" },
  { code: "E402", band: "quantity", title: "Invalid percent value", defaultSeverity: "error" },
  { code: "E403", band: "quantity", title: "Quantity parse failed", defaultSeverity: "error" },
  { code: "W_QUANTITY_UNIT_SPACING", band: "quantity", title: "Missing quantity unit spacing", defaultSeverity: "warning" },
  { code: "W_QUANTITY_UNIT_CASING", band: "quantity", title: "Non-canonical unit casing", defaultSeverity: "warning" },
  { code: "E_MOLECULE_IDENTITY_MISSING", band: "type", title: "Missing molecule identity", defaultSeverity: "error" },
  { code: "E_MOLECULE_REACTION_QUANTITY", band: "type", title: "Molecule reaction quantity", defaultSeverity: "error" },
  { code: "E_REACTION_PARTICIPANT_MISSING", band: "type", title: "Missing reaction participant", defaultSeverity: "error" },
  { code: "E_REACTION_PARTICIPANT_SYNTAX", band: "type", title: "Invalid reaction participant syntax", defaultSeverity: "error" },
  { code: "E_REACTION_PARTICIPANT_PRODUCT_QUANTITY", band: "type", title: "Invalid product participant quantity", defaultSeverity: "error" },
  { code: "E_STOICHIOMETRY_LIMITING", band: "type", title: "Invalid limiting reagent", defaultSeverity: "error" },
  { code: "E_STOICHIOMETRY_QUANTITY_MISSING", band: "type", title: "Missing stoichiometry quantity", defaultSeverity: "error" },
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
  ["E401", "E402", "E403", "W_QUANTITY_UNIT_SPACING", "W_QUANTITY_UNIT_CASING"].includes(diagnostic.code);

const isSpacedPercentLiteralDiagnostic = (diagnostic: V03Diagnostic): boolean =>
  diagnostic.code === "E403"
    && diagnostic.facts?.expected_quantity_class === "percent"
    && typeof diagnostic.facts.raw_value === "string"
    && /\d\s+%/.test(diagnostic.facts.raw_value);

const createQuantityQuickFix = (diagnostic: V03Diagnostic): QuickFix => {
  const field = typeof diagnostic.facts?.field === "string" ? diagnostic.facts.field : "field";

  return {
    title: diagnostic.code === "W_QUANTITY_UNIT_SPACING"
      ? `Insert a space between value and unit in ${field}`
      : isSpacedPercentLiteralDiagnostic(diagnostic)
        ? `Remove the space before % in ${field}`
        : `Clarify ${field} using a numeric value and unit in the current block syntax`,
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

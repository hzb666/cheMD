import type { ProvenanceInfo } from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

import { ExpressionParser } from "./expression-parser";
import type { ExpressionContext } from "./expression-types";
import { serializeValue } from "./expression-types";
import { tokenizeExpression } from "./expression-tokenizer";

const createExpressionDiagnostic = (raw: string, context: ExpressionContext): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_DERIVED_EXPRESSION_INVALID",
    severity: "error",
    message: `Invalid derived expression for ${context.field}: ${raw}`,
    sourceLayer: "typechecker",
    sourceNodeType: context.sourceNodeType,
    sourceNodeId: context.sourceNodeId,
    sourceField: context.field,
    facts: {
      field: context.field,
      raw_expression: raw
    }
  });

const createDerivedProvenance = (context: ExpressionContext): ProvenanceInfo => ({
  origin: "inferred",
  sourceNodeType: context.sourceNodeType,
  sourceNodeId: context.sourceNodeId,
  sourceField: context.field,
  ruleId: "typechecker.derived_expression",
  confidence: 1
});

export const resolveDerivedField = (
  raw: string | undefined,
  context: ExpressionContext
): { value?: string; provenance?: ProvenanceInfo; diagnostic?: V03Diagnostic } => {
  if (!raw?.startsWith("=")) {
    return { value: raw };
  }

  try {
    const tokens = tokenizeExpression(raw.slice(1));
    const value = new ExpressionParser(tokens, context).parse();
    return {
      value: serializeValue(value),
      provenance: createDerivedProvenance(context)
    };
  } catch {
    return { diagnostic: createExpressionDiagnostic(raw, context) };
  }
};

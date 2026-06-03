import type { ProvenanceInfo } from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

import { ExpressionParser } from "./expression-parser";
import type { ExpressionContext } from "./expression-types";
import { ExpressionError, serializeValue } from "./expression-types";
import { tokenizeExpression } from "./expression-tokenizer";

const createExpressionDiagnostic = (
  raw: string,
  context: ExpressionContext,
  error: unknown
): V03Diagnostic =>
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
      raw_expression: raw,
      ...readExpressionErrorFacts(error)
    }
  });

const readExpressionErrorFacts = (error: unknown): Record<string, unknown> =>
  error instanceof ExpressionError
    ? {
        expression_error_code: error.code,
        expression_error_message: error.message,
        ...error.facts
      }
    : {
        expression_error_code: "E_EXPRESSION_UNKNOWN",
        expression_error_message: error instanceof Error ? error.message : String(error)
      };

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
  } catch (error) {
    return { diagnostic: createExpressionDiagnostic(raw, context, error) };
  }
};

import type { SourceSpan } from "@chemd/core";

export type ProgramTokenType =
  | "identifier"
  | "string"
  | "number"
  | "left_brace"
  | "right_brace"
  | "left_paren"
  | "right_paren"
  | "left_bracket"
  | "right_bracket"
  | "colon"
  | "comma"
  | "dot"
  | "hash"
  | "at"
  | "equal"
  | "percent"
  | "comment"
  | "doc_comment"
  | "unknown"
  | "eof";

export interface ProgramToken {
  kind: string;
  value: string;
  span: SourceSpan;
  type: ProgramTokenType;
  raw: string;
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export const tokenSourceSpan = (token: ProgramToken): SourceSpan => token.span;

export const spanFromTokens = (
  startToken: ProgramToken,
  endToken: ProgramToken
): SourceSpan => ({
  start: startToken.span.start,
  end: endToken.span.end,
  startLine: startToken.span.startLine,
  startColumn: startToken.span.startColumn,
  endLine: endToken.span.endLine,
  endColumn: endToken.span.endColumn
});

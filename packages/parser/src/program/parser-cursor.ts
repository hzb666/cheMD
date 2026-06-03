import type {
  ChemdDocComment,
  ChemdDocCommentAttachment,
  ChemdDocCommentExportPolicy,
  ChemdValue,
  Diagnostic,
  SourceSpan
} from "@chemd/core";

import { createProgramDocComment } from "./doc-comments";
import { parseProgramValue } from "./parse-values";
import type { ProgramToken } from "./tokens";
import { spanFromTokens, tokenSourceSpan } from "./tokens";

export class ProgramParserCursor {
  private index = 0;
  private docOrdinal = 0;
  private readonly referenceModuleNames = new Set<string>();

  constructor(
    readonly source: string,
    readonly tokens: ProgramToken[],
    readonly diagnostics: Diagnostic[]
  ) {}

  peek(offset = 0): ProgramToken | undefined {
    this.skipTrivia();
    return this.tokens[this.index + offset];
  }

  peekAfterDocs(): ProgramToken | undefined {
    this.skipTrivia();
    let offset = 0;
    while (this.tokens[this.index + offset]?.type === "doc_comment") {
      offset += 1;
    }
    return this.tokens[this.index + offset];
  }

  consume(): ProgramToken | undefined {
    this.skipTrivia();
    const token = this.tokens[this.index];
    if (token) {
      this.index += 1;
    }
    return token;
  }

  isAtEnd(): boolean {
    const token = this.peek();
    return !token || token.type === "eof";
  }

  matchValue(value: string): ProgramToken | undefined {
    if (tokenValue(this.peek()) !== value) {
      return undefined;
    }
    return this.consume();
  }

  expectValue(value: string, code: string): ProgramToken | undefined {
    const token = this.matchValue(value);
    if (!token) {
      this.syntaxError(code, `Expected '${value}'.`, this.peek());
    }
    return token;
  }

  expectIdentifier(code: string, label = "identifier"): ProgramToken | undefined {
    const token = this.peek();
    if (!token || !isIdentifierToken(token)) {
      this.syntaxError(code, `Expected ${label}.`, token);
      return undefined;
    }
    return this.consume();
  }

  expectString(code: string, label = "string"): ProgramToken | undefined {
    const token = this.peek();
    if (!token || token.type !== "string") {
      this.syntaxError(code, `Expected ${label}.`, token);
      return undefined;
    }
    return this.consume();
  }

  parseValue(): ChemdValue {
    const range = this.consumeValueRange();
    if (!range) {
      return {
        type: "identifier",
        raw: "",
        name: "unknown",
        sourceSpan: {}
      };
    }
    const raw = this.source.slice(range.start.start, range.end.end);
    const result = parseProgramValue(raw, {
      references: { moduleNames: this.referenceModuleNames }
    });
    this.diagnostics.push(
      ...result.diagnostics.map((diagnostic) =>
        offsetDiagnosticSourceSpan(diagnostic, range.start)
      )
    );
    return result.value
      ? offsetValueSourceSpans(result.value, range.start)
      : fallbackIdentifier(raw, range);
  }

  collectDocs(): ChemdDocComment[] {
    const docs: ChemdDocComment[] = [];
    while (this.peek()?.type === "doc_comment") {
      const group = this.consumeDocGroup();
      if (group.length > 0) {
        this.docOrdinal += 1;
        docs.push(this.createDoc(group));
      }
    }
    return docs;
  }

  registerReferenceModuleNames(names: Iterable<string | undefined>): void {
    for (const name of names) {
      if (name) {
        this.referenceModuleNames.add(name);
      }
    }
  }

  syntaxError(code: string, message: string, token?: ProgramToken): void {
    this.diagnostics.push({
      code,
      severity: "error",
      message,
      sourceLayer: "parser",
      sourceSpan: tokenToSourceSpan(token)
    });
  }

  sourceSpanFrom(start?: ProgramToken, end?: ProgramToken | SourceSpan): SourceSpan {
    const startSpan = tokenToSourceSpan(start);
    const endSpan = sourceSpanFromPoint(end);
    return {
      ...startSpan,
      end: endSpan.end ?? startSpan.end,
      endLine: endSpan.endLine ?? startSpan.endLine,
      endColumn: endSpan.endColumn ?? startSpan.endColumn
    };
  }

  private createDoc(group: ProgramToken[]): ChemdDocComment {
    return createProgramDocComment(
      `doc_${this.docOrdinal}`,
      markdownFromDocGroup(group),
      group.length === 1
        ? tokenSourceSpan(group[0])
        : spanFromTokens(group[0], group[group.length - 1]),
      this.diagnostics
    );
  }

  private consumeDocGroup(): ProgramToken[] {
    const first = this.consume();
    if (!first) {
      return [];
    }
    if (!first.raw.startsWith("///")) {
      return [first];
    }
    const group = [first];
    while (isNextLineDoc(group[group.length - 1], this.peek())) {
      const token = this.consume();
      if (token) {
        group.push(token);
      }
    }
    return group;
  }

  private skipTrivia(): void {
    while (isTriviaToken(this.tokens[this.index])) {
      this.index += 1;
    }
  }

  private consumeValueRange(): { start: ProgramToken; end: ProgramToken } | undefined {
    const start = this.peek();
    if (!start) {
      this.syntaxError("E_PROGRAM_EXPECTED_VALUE", "Expected a program value.");
      return undefined;
    }
    let depth = 0;
    let endIndex = this.index;
    let previous = start;

    while (endIndex < this.tokens.length) {
      const token = this.tokens[endIndex];
      if (shouldStopValueScan(token, previous, depth, endIndex > this.index)) {
        break;
      }
      depth += valueDepthDelta(token);
      previous = token;
      endIndex += 1;
    }

    const end = this.tokens[Math.max(this.index, endIndex - 1)] ?? start;
    this.index = Math.max(this.index + 1, endIndex);
    return { start, end };
  }
}

export const tokenToSourceSpan = (token?: ProgramToken): SourceSpan =>
  token ? tokenSourceSpan(token) : {};

export const isIdentifierToken = (token: ProgramToken): boolean =>
  token.type === "identifier";

export const tokenValue = (token?: ProgramToken): string | undefined =>
  token?.value ?? token?.raw;

const fallbackIdentifier = (
  raw: string,
  range: { start: ProgramToken; end: ProgramToken }
): ChemdValue => ({
  type: "identifier",
  raw,
  name: raw,
  sourceSpan: spanFromTokens(range.start, range.end)
});

const offsetDiagnosticSourceSpan = (
  diagnostic: Diagnostic,
  base: ProgramToken
): Diagnostic => ({
  ...diagnostic,
  sourceSpan: offsetSourceSpan(diagnostic.sourceSpan, base)
});

const offsetValueSourceSpans = (
  value: ChemdValue,
  base: ProgramToken
): ChemdValue => {
  switch (value.type) {
    case "list":
      return {
        ...value,
        sourceSpan: offsetSourceSpan(value.sourceSpan, base),
        items: value.items.map((item) => offsetValueSourceSpans(item, base))
      };
    case "record":
      return {
        ...value,
        sourceSpan: offsetSourceSpan(value.sourceSpan, base),
        fields: value.fields.map((field) => ({
          ...field,
          sourceSpan: offsetSourceSpan(field.sourceSpan, base),
          value: offsetValueSourceSpans(field.value, base)
        }))
      };
    case "call":
      return {
        ...value,
        sourceSpan: offsetSourceSpan(value.sourceSpan, base),
        args: value.args.map((arg) => ({
          ...arg,
          sourceSpan: offsetSourceSpan(arg.sourceSpan, base),
          value: offsetValueSourceSpans(arg.value, base)
        }))
      };
    case "patch":
      return {
        ...value,
        sourceSpan: offsetSourceSpan(value.sourceSpan, base),
        value: offsetValueSourceSpans(value.value, base)
      };
    default:
      return {
        ...value,
        sourceSpan: offsetSourceSpan(value.sourceSpan, base)
      };
  }
};

const offsetSourceSpan = (
  span: SourceSpan | undefined,
  base: ProgramToken
): SourceSpan | undefined => {
  if (!span) {
    return undefined;
  }

  return {
    ...span,
    start: span.start === undefined ? undefined : base.start + span.start,
    end: span.end === undefined ? undefined : base.start + span.end,
    startLine: offsetLine(span.startLine, base),
    startColumn: offsetColumn(span.startLine, span.startColumn, base),
    endLine: offsetLine(span.endLine, base),
    endColumn: offsetColumn(span.endLine, span.endColumn, base)
  };
};

const offsetLine = (
  line: number | undefined,
  base: ProgramToken
): number | undefined =>
  line === undefined ? undefined : base.line + line - 1;

const offsetColumn = (
  line: number | undefined,
  column: number | undefined,
  base: ProgramToken
): number | undefined =>
  column === undefined
    ? undefined
    : line === 1
      ? base.column + column - 1
      : column;

const sourceSpanFromPoint = (point?: ProgramToken | SourceSpan): SourceSpan => {
  if (!point) {
    return {};
  }
  return "type" in point ? tokenSourceSpan(point) : point;
};

const isTriviaToken = (token?: ProgramToken): boolean =>
  !!token && token.type === "comment";

const markdownFromDocGroup = (group: ProgramToken[]): string => {
  if (group.length > 1) {
    return group.map(lineDocMarkdown).join("\n");
  }
  const token = group[0];
  return token.raw.startsWith("///")
    ? lineDocMarkdown(token)
    : blockDocMarkdown(token.raw);
};

const lineDocMarkdown = (token: ProgramToken): string =>
  token.raw.replace(/^\/\/\/[ \t]?/, "");

const blockDocMarkdown = (raw: string): string =>
  raw
    .replace(/^\/\*md[ \t]?/, "")
    .replace(/\*\/$/, "")
    .replace(/^\r?\n/, "")
    .replace(/\r?\n$/, "");

const isNextLineDoc = (
  previous: ProgramToken | undefined,
  token: ProgramToken | undefined
): token is ProgramToken =>
  !!previous &&
  !!token &&
  token.type === "doc_comment" &&
  token.raw.startsWith("///") &&
  token.line === previous.endLine + 1;

const shouldStopValueScan = (
  token: ProgramToken,
  previous: ProgramToken,
  depth: number,
  hasConsumed: boolean
): boolean => {
  if (!hasConsumed) {
    return false;
  }
  if (depth === 0 && VALUE_STOP_TOKENS.has(token.type)) {
    return true;
  }
  return depth === 0 && token.line > previous.endLine;
};

const VALUE_STOP_TOKENS = new Set([
  "comma",
  "left_brace",
  "right_brace",
  "right_bracket",
  "right_paren",
  "eof"
]);

const valueDepthDelta = (token: ProgramToken): number => {
  if (["left_brace", "left_bracket", "left_paren"].includes(token.type)) {
    return 1;
  }
  if (["right_brace", "right_bracket", "right_paren"].includes(token.type)) {
    return -1;
  }
  return 0;
};

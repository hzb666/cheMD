import type { Diagnostic } from "@chemd/core";

import type { ProgramToken, ProgramTokenType } from "./tokens";

interface LexerState {
  index: number;
  line: number;
  column: number;
}

interface TokenStart {
  start: number;
  line: number;
  column: number;
}

export interface ProgramLexerResult {
  tokens: ProgramToken[];
  diagnostics: Diagnostic[];
}

const SINGLE_CHAR_TOKENS = new Map<string, ProgramTokenType>([
  ["{", "left_brace"],
  ["}", "right_brace"],
  ["(", "left_paren"],
  [")", "right_paren"],
  ["[", "left_bracket"],
  ["]", "right_bracket"],
  [":", "colon"],
  [",", "comma"],
  [".", "dot"],
  ["#", "hash"],
  ["@", "at"],
  ["=", "equal"],
  ["%", "percent"]
]);

export const lexProgram = (source: string): ProgramLexerResult => {
  const lexer = new ProgramLexer(source);
  return lexer.lex();
};

export const tokenizeProgram = (source: string): ProgramToken[] => lexProgram(source).tokens;

export class ProgramLexer {
  private readonly state: LexerState = { index: 0, line: 1, column: 1 };

  private readonly tokens: ProgramToken[] = [];

  private readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly source: string) {}

  lex(): ProgramLexerResult {
    while (!this.isAtEnd()) {
      this.scanToken();
    }
    this.tokens.push(this.makeToken("eof", this.mark(), ""));
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private scanToken(): void {
    this.skipWhitespace();
    if (this.isAtEnd()) {
      return;
    }
    const start = this.mark();
    const char = this.peek();
    if (this.scanComment(start) || this.scanString(start)) {
      return;
    }
    if (isNumberStart(char, this.peekNext())) {
      this.tokens.push(this.scanNumber(start));
      return;
    }
    if (isIdentifierStart(char)) {
      this.tokens.push(this.scanIdentifier(start));
      return;
    }
    this.tokens.push(this.scanSingleOrUnknown(start));
  }

  private scanComment(start: TokenStart): boolean {
    if (this.peek() !== "/") {
      return false;
    }
    if (this.peekNext() === "/") {
      this.scanLineComment(start);
      return true;
    }
    if (this.peekNext() === "*") {
      this.scanBlockComment(start);
      return true;
    }
    return false;
  }

  private scanLineComment(start: TokenStart): void {
    this.advance();
    this.advance();
    const isDoc = this.peek() === "/";
    if (isDoc) {
      this.advance();
    }
    while (!this.isAtEnd() && this.peek() !== "\n" && this.peek() !== "\r") {
      this.advance();
    }
    this.tokens.push(this.makeToken(isDoc ? "doc_comment" : "comment", start));
  }

  private scanBlockComment(start: TokenStart): void {
    this.advance();
    this.advance();
    const isDoc = this.peek() === "m" && this.peekNext() === "d";
    while (!this.isAtEnd()) {
      if (this.peek() === "*" && this.peekNext() === "/") {
        this.advance();
        this.advance();
        this.tokens.push(this.makeToken(isDoc ? "doc_comment" : "comment", start));
        return;
      }
      this.advance();
    }
    this.diagnostics.push(this.unterminatedDiagnostic(start, "block comment"));
    this.tokens.push(this.makeToken(isDoc ? "doc_comment" : "comment", start));
  }

  private scanString(start: TokenStart): boolean {
    const quote = this.peek();
    if (quote !== "\"" && quote !== "'") {
      return false;
    }
    this.advance();
    let escaped = false;
    while (!this.isAtEnd()) {
      const char = this.advance();
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        this.tokens.push(this.makeToken("string", start));
        return true;
      }
    }
    this.diagnostics.push(this.unterminatedDiagnostic(start, "string"));
    this.tokens.push(this.makeToken("string", start));
    return true;
  }

  private scanNumber(start: TokenStart): ProgramToken {
    if (this.peek() === "-") {
      this.advance();
    }
    this.consumeDigits();
    if (this.peek() === "." && isDigit(this.peekNext())) {
      this.advance();
      this.consumeDigits();
    }
    return this.makeToken("number", start);
  }

  private scanIdentifier(start: TokenStart): ProgramToken {
    while (isIdentifierPart(this.peek())) {
      this.advance();
    }
    return this.makeToken("identifier", start);
  }

  private scanSingleOrUnknown(start: TokenStart): ProgramToken {
    const char = this.advance();
    return this.makeToken(SINGLE_CHAR_TOKENS.get(char) ?? "unknown", start, char);
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r") {
        return;
      }
      this.advance();
    }
  }

  private makeToken(type: ProgramTokenType, start: TokenStart, raw?: string): ProgramToken {
    const tokenRaw = raw ?? this.source.slice(start.start, this.state.index);
    const span = {
      start: start.start,
      end: this.state.index,
      startLine: start.line,
      startColumn: start.column,
      endLine: this.state.line,
      endColumn: this.state.column
    };
    return {
      kind: type,
      type,
      raw: tokenRaw,
      value: tokenValue(type, tokenRaw),
      span,
      start: start.start,
      end: this.state.index,
      line: start.line,
      column: start.column,
      endLine: this.state.line,
      endColumn: this.state.column
    };
  }

  private unterminatedDiagnostic(start: TokenStart, label: string): Diagnostic {
    return {
      code: "E_PROGRAM_UNTERMINATED_TOKEN",
      severity: "error",
      message: `Unterminated ${label}.`,
      sourceLayer: "parser",
      sourceSpan: {
        start: start.start,
        end: this.state.index,
        startLine: start.line,
        startColumn: start.column,
        endLine: this.state.line,
        endColumn: this.state.column
      }
    };
  }

  private consumeDigits(): void {
    while (isDigit(this.peek())) {
      this.advance();
    }
  }

  private mark(): TokenStart {
    return {
      start: this.state.index,
      line: this.state.line,
      column: this.state.column
    };
  }

  private advance(): string {
    const char = this.source[this.state.index] ?? "";
    this.state.index += 1;
    if (char === "\r") {
      if (this.source[this.state.index] === "\n") {
        this.state.index += 1;
      }
      this.state.line += 1;
      this.state.column = 1;
    } else if (char === "\n") {
      this.state.line += 1;
      this.state.column = 1;
    } else {
      this.state.column += 1;
    }
    return char;
  }

  private peek(): string {
    return this.source[this.state.index] ?? "";
  }

  private peekNext(): string {
    return this.source[this.state.index + 1] ?? "";
  }

  private isAtEnd(): boolean {
    return this.state.index >= this.source.length;
  }
}

const isDigit = (char: string): boolean => char >= "0" && char <= "9";

const isNumberStart = (char: string, next: string): boolean =>
  isDigit(char) || (char === "-" && isDigit(next));

const isIdentifierStart = (char: string): boolean =>
  (char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_";

const isIdentifierPart = (char: string): boolean =>
  isIdentifierStart(char) || isDigit(char) || char === "-";

const tokenValue = (type: ProgramTokenType, raw: string): string =>
  type === "string" ? decodeStringToken(raw) : raw;

const decodeStringToken = (raw: string): string => {
  if (raw.startsWith("\"")) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.startsWith("'")) {
    return raw.slice(1, -1).replaceAll("\\'", "'");
  }
  return raw;
};

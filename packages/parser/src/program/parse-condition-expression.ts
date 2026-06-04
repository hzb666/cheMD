import type {
  ProgramConditionBinaryOperator,
  ProgramConditionExpression,
  ProgramConditionUnaryOperator,
  SourceSpan
} from "@chemd/core";

type ConditionTokenKind =
  | "identifier"
  | "number"
  | "operator"
  | "paren"
  | "reference";

interface ConditionToken {
  kind: ConditionTokenKind;
  raw: string;
  start: number;
  end: number;
}

const BINARY_PRECEDENCE: Record<ProgramConditionBinaryOperator, number> = {
  or: 1,
  and: 2,
  "==": 3,
  "!=": 3,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  in: 3,
  matches: 3
};

const UNARY_OPERATORS = new Set<ProgramConditionUnaryOperator>(["not", "exists"]);

export const parseConditionExpression = (
  raw: string,
  sourceSpan?: SourceSpan
): ProgramConditionExpression | undefined => {
  const tokens = tokenizeCondition(raw);
  if (!tokens.length) return undefined;
  const parser = new ConditionParser(raw, tokens, sourceSpan);
  const expression = parser.parseExpression();
  return parser.isAtEnd() ? expression : undefined;
};

const tokenizeCondition = (raw: string): ConditionToken[] => {
  const tokens: ConditionToken[] = [];
  let index = 0;
  while (index < raw.length) {
    const char = raw[index];
    if (!char || /\s/.test(char)) {
      index += 1;
      continue;
    }
    const token = readToken(raw, index);
    if (!token) {
      return [];
    }
    tokens.push(token);
    index = token.end;
  }
  return tokens;
};

const readToken = (
  raw: string,
  start: number
): ConditionToken | undefined => {
  const two = raw.slice(start, start + 2);
  if (["==", "!=", "<=", ">="].includes(two)) {
    return { kind: "operator", raw: two, start, end: start + 2 };
  }
  const char = raw[start];
  if (!char) return undefined;
  if (["<", ">"].includes(char)) {
    return { kind: "operator", raw: char, start, end: start + 1 };
  }
  if (["(", ")"].includes(char)) {
    return { kind: "paren", raw: char, start, end: start + 1 };
  }
  if (char === "@") {
    return readPattern(raw, start, /@[A-Za-z0-9_.#:-]+/y, "reference");
  }
  if (/\d/.test(char)) {
    return readPattern(raw, start, /\d+(?:\.\d+)?/y, "number");
  }
  if (/[A-Za-z_]/.test(char)) {
    return readPattern(raw, start, /[A-Za-z_][A-Za-z0-9_.-]*/y, "identifier");
  }
  return undefined;
};

const readPattern = (
  raw: string,
  start: number,
  pattern: RegExp,
  kind: ConditionTokenKind
): ConditionToken | undefined => {
  pattern.lastIndex = start;
  const match = pattern.exec(raw);
  const token = match?.[0];
  return token ? { kind, raw: token, start, end: start + token.length } : undefined;
};

class ConditionParser {
  private index = 0;

  constructor(
    private readonly raw: string,
    private readonly tokens: ConditionToken[],
    private readonly sourceSpan: SourceSpan | undefined
  ) {}

  isAtEnd(): boolean {
    return this.index >= this.tokens.length;
  }

  parseExpression(minPrecedence = 0): ProgramConditionExpression | undefined {
    let left = this.parseUnary();
    while (left) {
      const operator = this.peekBinaryOperator();
      if (!operator || BINARY_PRECEDENCE[operator] < minPrecedence) break;
      this.advance();
      const right = this.parseExpression(BINARY_PRECEDENCE[operator] + 1);
      if (!right) return undefined;
      left = {
        kind: "binary",
        op: operator,
        left,
        right,
        raw: this.sliceRaw(left.raw, right.raw, operator),
        sourceSpan: this.sourceSpan
      };
    }
    return left;
  }

  private parseUnary(): ProgramConditionExpression | undefined {
    const token = this.peek();
    const operator = token?.kind === "identifier" && UNARY_OPERATORS.has(token.raw as ProgramConditionUnaryOperator)
      ? token.raw as ProgramConditionUnaryOperator
      : undefined;
    if (!operator) return this.parsePrimary();
    this.advance();
    const argument = this.parseUnary();
    return argument
      ? { kind: "unary", op: operator, argument, raw: `${operator} ${argument.raw}`, sourceSpan: this.sourceSpan }
      : undefined;
  }

  private parsePrimary(): ProgramConditionExpression | undefined {
    const token = this.advance();
    if (!token) return undefined;
    if (token.raw === "(") {
      const expression = this.parseExpression();
      return expression && this.match(")") ? expression : undefined;
    }
    if (token.kind === "reference") {
      return { kind: "reference", refId: token.raw.slice(1), raw: token.raw, sourceSpan: this.sourceSpan };
    }
    if (token.kind === "number") {
      return this.parseNumberOrQuantity(token);
    }
    if (token.kind === "identifier") {
      if (token.raw === "true" || token.raw === "false") {
        return { kind: "literal", value: token.raw === "true", valueKind: "boolean", raw: token.raw, sourceSpan: this.sourceSpan };
      }
      if (/^(?:operator|sensor|time|run)\.[A-Za-z0-9_.-]+$/.test(token.raw)) {
        const [namespace, ...path] = token.raw.split(".");
        return { kind: "runtime_reference", namespace: namespace ?? "", path: path.join("."), raw: token.raw, sourceSpan: this.sourceSpan };
      }
      return { kind: "literal", value: token.raw, valueKind: "string", raw: token.raw, sourceSpan: this.sourceSpan };
    }
    return undefined;
  }

  private parseNumberOrQuantity(token: ConditionToken): ProgramConditionExpression {
    const next = this.peek();
    if (next?.kind === "identifier" && !this.peekBinaryOperator()) {
      this.advance();
      return {
        kind: "quantity",
        value: Number(token.raw),
        unit: next.raw,
        raw: `${token.raw} ${next.raw}`,
        sourceSpan: this.sourceSpan
      };
    }
    return {
      kind: "literal",
      value: Number(token.raw),
      valueKind: "number",
      raw: token.raw,
      sourceSpan: this.sourceSpan
    };
  }

  private peekBinaryOperator(): ProgramConditionBinaryOperator | undefined {
    const token = this.peek();
    const raw = token?.raw as ProgramConditionBinaryOperator | undefined;
    return raw && raw in BINARY_PRECEDENCE ? raw : undefined;
  }

  private match(raw: string): boolean {
    if (this.peek()?.raw !== raw) return false;
    this.advance();
    return true;
  }

  private peek(): ConditionToken | undefined {
    return this.tokens[this.index];
  }

  private advance(): ConditionToken | undefined {
    const token = this.peek();
    this.index += token ? 1 : 0;
    return token;
  }

  private sliceRaw(
    leftRaw: string,
    rightRaw: string,
    operatorRaw: string
  ): string {
    const start = this.raw.indexOf(leftRaw);
    const end = this.raw.indexOf(rightRaw, start + leftRaw.length);
    return start >= 0 && end >= 0
      ? this.raw.slice(start, end + rightRaw.length)
      : `${leftRaw} ${operatorRaw} ${rightRaw}`;
  }
}

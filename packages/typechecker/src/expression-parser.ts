import {
  addValues,
  divideValues,
  evaluateFunction,
  multiplyValues,
  resolveReferenceValue,
  subtractValues
} from "./expression-functions";
import type {
  ExpressionContext,
  ExpressionValue,
  SymbolValue,
  Token
} from "./expression-types";

export class ExpressionParser {
  private cursor = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly context: ExpressionContext
  ) {}

  parse(): ExpressionValue {
    const value = this.parseAdditive();
    if (this.peek()) {
      throw new Error("Unexpected trailing expression token");
    }
    return value;
  }

  private parseAdditive(): ExpressionValue {
    let value = this.parseMultiplicative();

    while (this.matchSymbol("+") || this.matchSymbol("-")) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      value = operator === "+" ? addValues(value, right) : subtractValues(value, right);
    }

    return value;
  }

  private parseMultiplicative(): ExpressionValue {
    let value = this.parseUnary();

    while (this.matchSymbol("*") || this.matchSymbol("/")) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      value = operator === "*" ? multiplyValues(value, right) : divideValues(value, right);
    }

    return value;
  }

  private parseUnary(): ExpressionValue {
    if (!this.matchSymbol("-")) {
      return this.parsePrimary();
    }

    const value = this.parseUnary();
    if (value.kind === "number" || value.kind === "quantity") {
      return { ...value, value: -value.value };
    }
    throw new Error("Unary minus only supports numeric expressions");
  }

  private parsePrimary(): ExpressionValue {
    const token = this.advance();

    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    if (token.type === "number") {
      const value = Number(token.value);
      if (!Number.isFinite(value)) {
        throw new Error("Invalid numeric literal");
      }
      return { kind: "number", value };
    }

    if (token.type === "quantity") {
      return this.parseQuantityToken(token.value, token.unit);
    }

    if (token.type === "reference") {
      return resolveReferenceValue(token.value, this.context);
    }

    if (token.type === "identifier") {
      return this.parseIdentifier(token.value);
    }

    if (token.value === "(") {
      const value = this.parseAdditive();
      this.consumeSymbol(")");
      return value;
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }

  private parseQuantityToken(valueRaw: string, unit: string): ExpressionValue {
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) {
      throw new Error("Invalid quantity literal");
    }
    return { kind: "quantity", value, unit };
  }

  private parseIdentifier(name: string): ExpressionValue {
    if (!this.matchSymbol("(")) {
      return { kind: "string", value: name };
    }

    const args = this.parseCallArgs();
    return evaluateFunction(name, args);
  }

  private parseCallArgs(): ExpressionValue[] {
    const args: ExpressionValue[] = [];
    if (this.matchSymbol(")")) {
      return args;
    }

    do {
      args.push(this.parseAdditive());
    } while (this.matchSymbol(","));

    this.consumeSymbol(")");
    return args;
  }

  private consumeSymbol(value: SymbolValue): void {
    if (!this.matchSymbol(value)) {
      throw new Error(`Expected "${value}"`);
    }
  }

  private matchSymbol(value: SymbolValue): boolean {
    const token = this.peek();
    if (token?.type !== "symbol" || token.value !== value) {
      return false;
    }
    this.cursor += 1;
    return true;
  }

  private advance(): Token | undefined {
    const token = this.peek();
    if (token) {
      this.cursor += 1;
    }
    return token;
  }

  private previous(): Token {
    return this.tokens[this.cursor - 1];
  }

  private peek(): Token | undefined {
    return this.tokens[this.cursor];
  }
}

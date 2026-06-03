import { expressionError, type SymbolValue, type Token } from "./expression-types";

const isUnitChar = (char: string | undefined): boolean =>
  Boolean(char && /[a-zA-Z%°℃]/.test(char));

const tokenizeNumber = (expression: string, start: number): { token: Token; nextIndex: number } => {
  let index = start;

  while (index < expression.length && /[\d.]/.test(expression[index])) {
    index += 1;
  }

  let unitStart = index;
  while (unitStart < expression.length && /\s/.test(expression[unitStart])) {
    unitStart += 1;
  }

  if (isUnitChar(expression[unitStart])) {
    return tokenizeQuantity(expression, start, index, unitStart);
  }

  return {
    token: { type: "number", value: expression.slice(start, index) },
    nextIndex: index
  };
};

const tokenizeQuantity = (
  expression: string,
  valueStart: number,
  valueEnd: number,
  unitStart: number
): { token: Token; nextIndex: number } => {
  let unitEnd = unitStart;

  while (unitEnd < expression.length && isUnitChar(expression[unitEnd])) {
    unitEnd += 1;
  }

  return {
    token: {
      type: "quantity",
      value: expression.slice(valueStart, valueEnd),
      unit: expression.slice(unitStart, unitEnd)
    },
    nextIndex: unitEnd
  };
};

const tokenizeReference = (expression: string, start: number): { token: Token; nextIndex: number } => {
  let index = start + 1;

  while (index < expression.length && /[A-Za-z0-9_-]/.test(expression[index])) {
    index += 1;
  }

  if (expression[index] === ".") {
    index += 1;
    while (index < expression.length && /[A-Za-z0-9_-]/.test(expression[index])) {
      index += 1;
    }
  }

  return {
    token: { type: "reference", value: expression.slice(start, index) },
    nextIndex: index
  };
};

const tokenizeIdentifier = (expression: string, start: number): { token: Token; nextIndex: number } => {
  let index = start + 1;

  while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) {
    index += 1;
  }

  return {
    token: { type: "identifier", value: expression.slice(start, index) },
    nextIndex: index
  };
};

export const tokenizeExpression = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
    } else if (/\d/.test(char)) {
      const parsed = tokenizeNumber(expression, index);
      tokens.push(parsed.token);
      index = parsed.nextIndex;
    } else if (char === "@") {
      const parsed = tokenizeReference(expression, index);
      tokens.push(parsed.token);
      index = parsed.nextIndex;
    } else if (/[A-Za-z_]/.test(char)) {
      const parsed = tokenizeIdentifier(expression, index);
      tokens.push(parsed.token);
      index = parsed.nextIndex;
    } else if ("+-*/(),".includes(char)) {
      tokens.push({ type: "symbol", value: char as SymbolValue });
      index += 1;
    } else {
      throw expressionError(
        "E_EXPRESSION_UNSUPPORTED_TOKEN",
        `Unsupported expression token: ${char}`,
        { token: char, index }
      );
    }
  }

  return tokens;
};

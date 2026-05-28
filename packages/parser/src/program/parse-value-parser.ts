import type { ChemdValue, Diagnostic } from "@chemd/core";

import {
  callValue,
  identifierValue,
  listValue,
  numericValue,
  recordValue,
  referenceValue,
  stringValue
} from "./parse-value-nodes";
import type { ProgramValueParseOptions } from "./parse-values";
import type { ProgramToken, ProgramTokenType } from "./tokens";
import { tokenSourceSpan } from "./tokens";

export class ProgramValueParser {
  private index = 0;

  readonly diagnostics: Diagnostic[];

  constructor(
    readonly source: string,
    readonly tokens: ProgramToken[],
    diagnostics: Diagnostic[] = [],
    readonly options: ProgramValueParseOptions = {}
  ) {
    this.diagnostics = [...diagnostics];
  }

  parseValue(): ChemdValue | undefined {
    const token = this.current();
    if (token.type === "string") {
      this.advance();
      return stringValue(token);
    }
    if (token.type === "number") {
      return numericValue(this);
    }
    if (token.type === "identifier") {
      const identifier = this.advance();
      return this.match("left_paren")
        ? callValue(this, identifier)
        : identifierValue(identifier);
    }
    if (token.type === "at") {
      return referenceValue(this);
    }
    if (token.type === "left_bracket") {
      return listValue(this);
    }
    if (token.type === "left_brace") {
      return recordValue(this);
    }
    this.addDiagnostic(token, "E_PROGRAM_EXPECTED_VALUE", "Expected a program value.");
    return undefined;
  }

  consumeClosing(type: ProgramTokenType, fallback: ProgramToken): ProgramToken {
    return this.consume(type, `Expected '${closingRaw(type)}'.`) ?? fallback;
  }

  consume(type: ProgramTokenType, message: string): ProgramToken | undefined {
    if (this.current().type === type) {
      return this.advance();
    }
    this.addDiagnostic(this.current(), "E_PROGRAM_UNEXPECTED_TOKEN", message);
    return undefined;
  }

  addDiagnostic(token: ProgramToken, code: string, message: string): void {
    this.diagnostics.push({
      code,
      severity: "error",
      message,
      sourceLayer: "parser",
      sourceSpan: tokenSourceSpan(token)
    });
  }

  isKnownModuleName(name: string): boolean {
    const moduleNames = this.options.references?.moduleNames;
    if (moduleNames instanceof Set) {
      return moduleNames.has(name);
    }
    if (Array.isArray(moduleNames)) {
      return moduleNames.includes(name);
    }
    return name === "module" || name.endsWith("_module") || name.endsWith("-module");
  }

  match(type: ProgramTokenType): boolean {
    if (this.current().type !== type) {
      return false;
    }
    this.advance();
    return true;
  }

  rawBetween(startToken: ProgramToken, endToken: ProgramToken): string {
    return this.source.slice(startToken.start, endToken.end);
  }

  current(): ProgramToken {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }

  previous(): ProgramToken {
    return this.tokens[Math.max(0, this.index - 1)];
  }

  advance(): ProgramToken {
    const token = this.current();
    if (!this.isAt("eof")) {
      this.index += 1;
    }
    return token;
  }

  isAt(type: ProgramTokenType): boolean {
    return this.current().type === type;
  }
}

const closingRaw = (type: ProgramTokenType): string => {
  if (type === "right_bracket") {
    return "]";
  }
  if (type === "right_brace") {
    return "}";
  }
  return ")";
};

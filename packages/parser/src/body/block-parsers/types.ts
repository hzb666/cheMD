import type { ChemdNode, Diagnostic, StructuredNode } from "@chemd/core";

export interface BlockParserContext {
  headerArg?: string;
  lines: string[];
  diagnostics: Diagnostic[];
  bodyChildren?: ChemdNode[];
  options?: ParserOptions;
}

export type BlockParser = (context: BlockParserContext) => StructuredNode | undefined;

export type ParserOptions = Record<string, never>;

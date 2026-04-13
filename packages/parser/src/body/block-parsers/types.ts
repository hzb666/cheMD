import type { ChemdNode, Diagnostic, StructuredNode } from "@chemd/core";

export interface BlockParserContext {
  headerArg?: string;
  lines: string[];
  diagnostics: Diagnostic[];
  bodyChildren?: ChemdNode[];
}

export type BlockParser = (context: BlockParserContext) => StructuredNode | undefined;

import {
  findTokenAtPosition,
  resolveEditorPosition
} from "./definition-tokens";
import type { ChemdEditorPosition } from "./completion-types";
import type {
  ChemdLanguageCompileOutput,
  ChemdSourceRange,
  ChemdSymbol
} from "./types";

export interface ChemdDefinitionRequest {
  source: string;
  documentUri?: string;
  documentPath?: string;
  cursorOffset?: number;
  position?: ChemdEditorPosition;
}

export interface ChemdDefinitionContext {
  compileOutput?: ChemdLanguageCompileOutput;
}

export interface ChemdDefinitionTarget {
  symbolId: string;
  label: string;
  kind: string;
  sourceNodeType?: string;
}

export interface ChemdDefinitionLocation {
  uri?: string;
  path?: string;
  range: ChemdSourceRange;
  sourceSpan: ChemdSourceRange;
  target: ChemdDefinitionTarget;
}

export const getChemdDefinition = (
  request: ChemdDefinitionRequest,
  context: ChemdDefinitionContext = {}
): ChemdDefinitionLocation[] => {
  const compileOutput = context.compileOutput;
  if (!compileOutput) {
    return [];
  }

  const position = resolveEditorPosition(request);
  const token = findTokenAtPosition(request.source, position);
  const symbol = token ? findSymbol(compileOutput.symbols, token.symbolId) : undefined;
  return symbol ? [createLocation(request, symbol)] : [];
};

const findSymbol = (
  symbols: readonly ChemdSymbol[],
  symbolId: string
): ChemdSymbol | undefined =>
  symbols.find((symbol) => symbol.id === symbolId);

const createLocation = (
  request: ChemdDefinitionRequest,
  symbol: ChemdSymbol
): ChemdDefinitionLocation => ({
  uri: request.documentUri,
  path: request.documentPath,
  range: symbol.range,
  sourceSpan: symbol.range,
  target: {
    symbolId: symbol.id,
    label: symbol.label,
    kind: symbol.kind,
    sourceNodeType: symbol.sourceNodeType
  }
});

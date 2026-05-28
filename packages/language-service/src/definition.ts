import {
  findTokenAtPosition,
  resolveEditorPosition
} from "./definition-tokens";
import { findProgramReferenceAtPosition } from "./program-model";
import type { ChemdEditorPosition } from "./completion-types";
import type {
  ChemdLanguageCompileOutput,
  ChemdSourceRange,
  ChemdSymbol
} from "./types";
import type {
  ChemdWorkspaceSymbol,
  ChemdWorkspaceSymbolIndex
} from "./workspace-symbol-types";

export interface ChemdDefinitionRequest {
  source: string;
  documentUri?: string;
  documentPath?: string;
  cursorOffset?: number;
  position?: ChemdEditorPosition;
}

export interface ChemdDefinitionContext {
  compileOutput?: ChemdLanguageCompileOutput;
  workspaceSymbolIndex?: ChemdWorkspaceSymbolIndex;
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

export interface ChemdDefinitionDiagnostic {
  code: "E_DEFINITION_AMBIGUOUS";
  severity: "error";
  message: string;
  range: ChemdSourceRange;
  targetText: string;
  targetSymbolIds: string[];
}

export interface ChemdDefinitionResult {
  locations: ChemdDefinitionLocation[];
  diagnostics: ChemdDefinitionDiagnostic[];
}

export const getChemdDefinition = (
  request: ChemdDefinitionRequest,
  context: ChemdDefinitionContext = {}
): ChemdDefinitionLocation[] => {
  return getChemdDefinitionResult(request, context).locations;
};

export const getChemdDefinitionResult = (
  request: ChemdDefinitionRequest,
  context: ChemdDefinitionContext = {}
): ChemdDefinitionResult => {
  const position = resolveEditorPosition(request);
  const programReference = context.compileOutput?.status === "ok"
    ? findProgramReferenceAtPosition(context.compileOutput.result, request.source, position)
    : undefined;
  const token = programReference
    ? {
        symbolId: programReference.symbolId,
        range: programReference.range
      }
    : findTokenAtPosition(request.source, position);
  if (!token) {
    return { locations: [], diagnostics: [] };
  }

  const symbol = context.compileOutput
    ? findSymbol(context.compileOutput.symbols, token.symbolId)
    : undefined;
  if (symbol) {
    return { locations: [createLocation(request, symbol)], diagnostics: [] };
  }

  return findWorkspaceLocations(token.symbolId, token.range, context.workspaceSymbolIndex);
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

const findWorkspaceLocations = (
  symbolId: string,
  tokenRange: ChemdSourceRange,
  index: ChemdWorkspaceSymbolIndex | undefined
): ChemdDefinitionResult => {
  if (!index) {
    return { locations: [], diagnostics: [] };
  }

  const matches = index.symbols.filter((symbol) => symbol.localId === symbolId || symbol.name === symbolId);
  if (matches.length === 0) {
    return { locations: [], diagnostics: [] };
  }

  if (matches.length > 1) {
    return {
      locations: [],
      diagnostics: [{
        code: "E_DEFINITION_AMBIGUOUS",
        severity: "error",
        message: `Ambiguous workspace reference: ${symbolId}`,
        range: tokenRange,
        targetText: symbolId,
        targetSymbolIds: matches.map((symbol) => symbol.id)
      }]
    };
  }

  return {
    locations: [createWorkspaceLocation(matches[0])],
    diagnostics: []
  };
};

const createWorkspaceLocation = (
  symbol: ChemdWorkspaceSymbol
): ChemdDefinitionLocation => ({
  uri: symbol.documentUri,
  range: symbol.range,
  sourceSpan: symbol.range,
  target: {
    symbolId: symbol.localId,
    label: symbol.name,
    kind: symbol.kind,
    sourceNodeType: symbol.sourceNodeType
  }
});

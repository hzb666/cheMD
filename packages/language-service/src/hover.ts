import type { ChemdEditorPosition } from "./completion-types";
import {
  findTokenAtPosition,
  rangeContainsPosition,
  readSourceLine,
  resolveEditorPosition
} from "./definition-tokens";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdSourceRange,
  ChemdSymbol
} from "./types";

export interface ChemdHoverRequest {
  source: string;
  documentUri?: string;
  cursorOffset?: number;
  position?: ChemdEditorPosition;
}

export interface ChemdHoverContext {
  compileOutput?: ChemdLanguageCompileOutput;
}

export interface ChemdHoverSymbol {
  id: string;
  label: string;
  kind: string;
  range: ChemdSourceRange;
  sourceNodeType?: string;
}

export interface ChemdHoverDiagnostic {
  code: string;
  severity: ChemdEditorDiagnostic["severity"];
  message: string;
  range: ChemdSourceRange;
  sourceNodeId?: string;
}

export interface ChemdHoverReferenceTarget extends ChemdHoverSymbol {
  tokenRange: ChemdSourceRange;
  explicitReference: boolean;
}

export interface ChemdHoverResult {
  documentUri?: string;
  position: ChemdEditorPosition;
  range: ChemdSourceRange;
  sourceLine: {
    line: number;
    text: string;
  };
  symbol?: ChemdHoverSymbol;
  diagnostic?: ChemdHoverDiagnostic;
  referenceTarget?: ChemdHoverReferenceTarget;
}

export const getChemdHover = (
  request: ChemdHoverRequest,
  context: ChemdHoverContext = {}
): ChemdHoverResult | null => {
  const compileOutput = context.compileOutput;
  if (!compileOutput) {
    return null;
  }

  const position = resolveEditorPosition(request);
  const symbol = findSymbolAtPosition(compileOutput.symbols, position);
  const diagnostic = findDiagnosticAtPosition(compileOutput.diagnostics, position);
  const referenceTarget = findReferenceTarget(request, compileOutput, position);
  if (!symbol && !diagnostic && !referenceTarget) {
    return null;
  }

  return createHoverResult(request, position, symbol, diagnostic, referenceTarget);
};

const findSymbolAtPosition = (
  symbols: readonly ChemdSymbol[],
  position: ChemdEditorPosition
): ChemdHoverSymbol | undefined =>
  symbols.filter((symbol) => rangeContainsPosition(symbol.range, position))
    .sort(compareSymbols)
    .map(toHoverSymbol)[0];

const findDiagnosticAtPosition = (
  diagnostics: readonly ChemdEditorDiagnostic[],
  position: ChemdEditorPosition
): ChemdHoverDiagnostic | undefined =>
  diagnostics.filter((diagnostic) => rangeContainsPosition(diagnostic.range, position))
    .sort(compareDiagnostics)
    .map(toHoverDiagnostic)[0];

const findReferenceTarget = (
  request: ChemdHoverRequest,
  compileOutput: ChemdLanguageCompileOutput,
  position: ChemdEditorPosition
): ChemdHoverReferenceTarget | undefined => {
  const token = findTokenAtPosition(request.source, position);
  const symbol = token
    ? compileOutput.symbols.find((item) => item.id === token.symbolId)
    : undefined;
  return token && symbol ? {
    ...toHoverSymbol(symbol),
    tokenRange: token.range,
    explicitReference: token.explicitReference
  } : undefined;
};

const createHoverResult = (
  request: ChemdHoverRequest,
  position: ChemdEditorPosition,
  symbol: ChemdHoverSymbol | undefined,
  diagnostic: ChemdHoverDiagnostic | undefined,
  referenceTarget: ChemdHoverReferenceTarget | undefined
): ChemdHoverResult => ({
  documentUri: request.documentUri,
  position,
  range: referenceTarget?.tokenRange ?? diagnostic?.range ?? symbol?.range ?? {
    startLine: position.line,
    startColumn: position.column,
    endLine: position.line,
    endColumn: position.column
  },
  sourceLine: {
    line: position.line,
    text: readSourceLine(request.source, position.line)
  },
  symbol,
  diagnostic,
  referenceTarget
});

const toHoverSymbol = (symbol: ChemdSymbol): ChemdHoverSymbol => ({
  id: symbol.id,
  label: symbol.label,
  kind: symbol.kind,
  range: symbol.range,
  sourceNodeType: symbol.sourceNodeType
});

const toHoverDiagnostic = (
  diagnostic: ChemdEditorDiagnostic
): ChemdHoverDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  range: diagnostic.range,
  sourceNodeId: diagnostic.sourceNodeId
});

const compareSymbols = (
  left: ChemdSymbol,
  right: ChemdSymbol
): number =>
  area(left.range) - area(right.range)
  || left.id.localeCompare(right.id)
  || left.kind.localeCompare(right.kind);

const compareDiagnostics = (
  left: ChemdEditorDiagnostic,
  right: ChemdEditorDiagnostic
): number =>
  severityRank(left.severity) - severityRank(right.severity)
  || left.code.localeCompare(right.code)
  || left.range.startLine - right.range.startLine
  || left.range.startColumn - right.range.startColumn;

const area = (range: ChemdSourceRange): number =>
  (range.endLine - range.startLine) * 1000
  + range.endColumn - range.startColumn;

const severityRank = (
  severity: ChemdEditorDiagnostic["severity"]
): number => ({
  error: 0,
  warning: 1,
  info: 2
})[severity];

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

type TypedNode = NonNullable<ChemdLanguageCompileOutput["result"]>["typedSemanticGraph"]["nodes"][number];
type TypedQuantity = NonNullable<ChemdLanguageCompileOutput["result"]>["typedSemanticGraph"]["quantities"][number];

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
  canonicalQuantities?: ChemdHoverQuantity[];
  interopStatus?: ChemdHoverInteropStatus;
}

export interface ChemdHoverQuantity {
  field?: string;
  raw: string;
  valueKind?: string;
  canonicalValue?: number;
  canonicalUnit?: string;
  provenance?: string;
}

export interface ChemdHoverInteropStatus {
  fields: string[];
  verified: boolean;
  diagnostics: string[];
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
  const symbol = findSymbolAtPosition(compileOutput, position);
  const diagnostic = findDiagnosticAtPosition(compileOutput.diagnostics, position);
  const referenceTarget = findReferenceTarget(request, compileOutput, position);
  if (!symbol && !diagnostic && !referenceTarget) {
    return null;
  }

  return createHoverResult(request, position, symbol, diagnostic, referenceTarget);
};

const findSymbolAtPosition = (
  compileOutput: ChemdLanguageCompileOutput,
  position: ChemdEditorPosition
): ChemdHoverSymbol | undefined =>
  compileOutput.symbols.filter((symbol) => rangeContainsPosition(symbol.range, position))
    .sort(compareSymbols)
    .map((symbol) => toHoverSymbol(symbol, compileOutput))[0];

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
    ...toHoverSymbol(symbol, compileOutput),
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

const toHoverSymbol = (
  symbol: ChemdSymbol,
  compileOutput: ChemdLanguageCompileOutput
): ChemdHoverSymbol => {
  const typedNode = findTypedNode(compileOutput, symbol.id);
  const canonicalQuantities = findCanonicalQuantities(compileOutput, symbol.id);
  const interopStatus = typedNode ? buildInteropStatus(compileOutput, typedNode) : undefined;

  return {
    id: symbol.id,
    label: symbol.label,
    kind: symbol.kind,
    range: symbol.range,
    sourceNodeType: symbol.sourceNodeType,
    ...(canonicalQuantities.length > 0 ? { canonicalQuantities } : {}),
    ...(interopStatus ? { interopStatus } : {})
  };
};

const findTypedNode = (
  compileOutput: ChemdLanguageCompileOutput,
  nodeId: string
): TypedNode | undefined =>
  compileOutput.status === "ok"
    ? compileOutput.result.typedSemanticGraph.nodes.find((node) => node.nodeId === nodeId)
    : undefined;

const findCanonicalQuantities = (
  compileOutput: ChemdLanguageCompileOutput,
  nodeId: string
): ChemdHoverQuantity[] =>
  compileOutput.status === "ok"
    ? compileOutput.result.typedSemanticGraph.quantities
      .filter((quantity) => quantity.sourceNodeId === nodeId)
      .map(toHoverQuantity)
    : [];

const toHoverQuantity = (quantity: TypedQuantity): ChemdHoverQuantity => ({
  field: quantity.sourceField,
  raw: quantity.raw,
  valueKind: quantity.valueKind,
  canonicalValue: quantity.canonicalValue,
  canonicalUnit: quantity.canonicalUnit,
  provenance: quantity.provenance?.source
});

const buildInteropStatus = (
  compileOutput: ChemdLanguageCompileOutput,
  typedNode: TypedNode
): ChemdHoverInteropStatus | undefined => {
  const record = typedNode as unknown as Record<string, unknown>;
  const fields = ["smiles", "inchi", "inchikey", "rxn_smiles"]
    .filter((field) => typeof record[field] === "string" && String(record[field]).trim().length > 0);
  if (fields.length === 0) {
    return undefined;
  }

  const diagnostics = compileOutput.diagnostics
    .filter((diagnostic) =>
      diagnostic.sourceNodeId === typedNode.nodeId
      && diagnostic.code.includes("INTEROP")
    )
    .map((diagnostic) => diagnostic.code);

  return {
    fields,
    verified: false,
    diagnostics
  };
};

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

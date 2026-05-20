import {
  buildChemdSemanticTokens,
  chemdSemanticTokensLegend,
  toMonacoSemanticTokensData,
  type ChemdLanguageCompileOutput
} from "@chemd/language-service";
import type { Monaco } from "@monaco-editor/react";
import type { CancellationToken, editor, languages, Position } from "monaco-editor";

import {
  findChemdBlockPathAtLine,
  parseChemdBlockStructure,
  type ChemdBlockNode,
} from "./chemd-block-structure";

type MonacoModel = Pick<editor.ITextModel, "uri" | "getValue">;
type MonacoDisposable = { dispose: () => void };

const chemdSemanticTokenOutputsByUri = new Map<string, ChemdLanguageCompileOutput>();
let chemdSemanticProviderDisposables: MonacoDisposable[] | null = null;

export const updateChemdSemanticTokenOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  chemdSemanticTokenOutputsByUri.set(documentUri, compileOutput);
};

export const cleanupChemdSemanticTokenOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  if (chemdSemanticTokenOutputsByUri.get(documentUri) === compileOutput) {
    chemdSemanticTokenOutputsByUri.delete(documentUri);
  }
};

const getCompileOutputForModel = (
  model: MonacoModel
): ChemdLanguageCompileOutput | undefined =>
  chemdSemanticTokenOutputsByUri.get(model.uri.toString());

export const createChemdDocumentSemanticTokensProvider = (): languages.DocumentSemanticTokensProvider => ({
  getLegend: () => chemdSemanticTokensLegend,
  provideDocumentSemanticTokens: (
    model: MonacoModel,
    _lastResultId: string | null,
    token: CancellationToken
  ): languages.SemanticTokens => {
    if (token.isCancellationRequested) {
      return { data: new Uint32Array() };
    }

    const compileOutput = getCompileOutputForModel(model);
    const semanticTokens = compileOutput?.semanticTokens
      ?? buildChemdSemanticTokens(model.getValue());
    return { data: toMonacoSemanticTokensData(semanticTokens) };
  },
  releaseDocumentSemanticTokens: () => undefined
});

const splitSourceLines = (source: string): string[] =>
  source.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

const toSelectionRange = (
  startLineNumber: number,
  startColumn: number,
  endLineNumber: number,
  endColumn: number
): languages.SelectionRange => ({
  range: { startLineNumber, startColumn, endLineNumber, endColumn }
});

const blockToSelectionRange = (
  sourceLines: readonly string[],
  node: ChemdBlockNode
): languages.SelectionRange =>
  toSelectionRange(
    node.startLine,
    1,
    node.endLine,
    (sourceLines[node.endLine - 1]?.length ?? 0) + 1
  );

const dedupeSelectionRanges = (
  ranges: readonly languages.SelectionRange[]
): languages.SelectionRange[] => {
  const seen = new Set<string>();
  return ranges.filter(({ range }) => {
    const key = `${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const createChemdSelectionRanges = (
  source: string,
  position: Pick<Position, "lineNumber" | "column">
): languages.SelectionRange[] => {
  const sourceLines = splitSourceLines(source);
  const lineText = sourceLines[position.lineNumber - 1] ?? "";
  const lineRange = toSelectionRange(
    position.lineNumber,
    1,
    position.lineNumber,
    lineText.length + 1
  );
  const blockRanges = findChemdBlockPathAtLine(
    parseChemdBlockStructure(source),
    position.lineNumber
  )
    .reverse()
    .map((node) => blockToSelectionRange(sourceLines, node));

  return dedupeSelectionRanges([lineRange, ...blockRanges]);
};

export const createChemdSelectionRangeProvider = (): languages.SelectionRangeProvider => ({
  provideSelectionRanges: (
    model: MonacoModel,
    positions: Position[]
  ): languages.SelectionRange[][] =>
    positions.map((position) => createChemdSelectionRanges(model.getValue(), position))
});

export const registerChemdSemanticProviders = (
  monaco: Monaco,
  languageId: string
): void => {
  if (chemdSemanticProviderDisposables) {
    return;
  }

  chemdSemanticProviderDisposables = [
    monaco.languages.registerDocumentSemanticTokensProvider(
      languageId,
      createChemdDocumentSemanticTokensProvider()
    ),
    monaco.languages.registerSelectionRangeProvider(
      languageId,
      createChemdSelectionRangeProvider()
    )
  ];
};

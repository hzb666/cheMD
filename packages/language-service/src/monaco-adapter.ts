import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdOutlineItem,
  ChemdQuickFixProposal,
  ChemdSourceRange,
  ChemdSymbol
} from "./types";
import {
  CHEMD_SEMANTIC_TOKEN_MODIFIERS,
  CHEMD_SEMANTIC_TOKEN_TYPES,
  type ChemdSemanticToken,
  type ChemdSemanticTokenModifier,
  type ChemdSemanticTokenType
} from "./semantic-tokens";

export type MonacoMarkerSeverity = 1 | 2 | 4 | 8;

export interface MonacoRangeLike {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface MonacoMarkerLike extends MonacoRangeLike {
  code: string;
  message: string;
  severity: MonacoMarkerSeverity;
  source: "chemd";
}

export interface MonacoCodeActionLike {
  title: string;
  diagnostics: MonacoMarkerLike[];
  edit: {
    edits: Array<{
      range: MonacoRangeLike;
      text: string;
    }>;
  };
  data: ChemdQuickFixProposal;
}

export interface MonacoLanguageServiceModel {
  status: ChemdLanguageCompileOutput["status"];
  documentUri?: string;
  compiledAt: string;
  markers: MonacoMarkerLike[];
  codeActions: MonacoCodeActionLike[];
  outline: ChemdOutlineItem[];
  semanticTokens: ChemdSemanticToken[];
  symbols: ChemdSymbol[];
  error?: Extract<ChemdLanguageCompileOutput, { status: "failed" }>["error"];
}

const semanticTokenTypeIndex = new Map<ChemdSemanticTokenType, number>(
  CHEMD_SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index])
);

const semanticTokenModifierIndex = new Map<ChemdSemanticTokenModifier, number>(
  CHEMD_SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, index])
);

export const toMonacoRange = (range: ChemdSourceRange): MonacoRangeLike => ({
  startLineNumber: range.startLine,
  startColumn: range.startColumn,
  endLineNumber: range.endLine,
  endColumn: range.endColumn
});

export const toMonacoSeverity = (
  severity: ChemdEditorDiagnostic["severity"]
): MonacoMarkerSeverity => {
  if (severity === "error") {
    return 8;
  }

  return severity === "warning" ? 4 : 2;
};

export const toMonacoMarker = (
  diagnostic: ChemdEditorDiagnostic
): MonacoMarkerLike => ({
  ...toMonacoRange(diagnostic.range),
  code: diagnostic.code,
  message: diagnostic.message,
  severity: toMonacoSeverity(diagnostic.severity),
  source: "chemd"
});

export const toMonacoCodeActions = (
  diagnostic: ChemdEditorDiagnostic
): MonacoCodeActionLike[] => {
  const marker = toMonacoMarker(diagnostic);

  return diagnostic.quickFixes.map((proposal) => ({
    title: proposal.title,
    diagnostics: [marker],
    edit: {
      edits: proposal.patch.edits.map((edit) => ({
        range: toMonacoRange(edit.range),
        text: edit.replacement
      }))
    },
    data: proposal
  }));
};

export const toMonacoLanguageServiceModel = (
  output: ChemdLanguageCompileOutput
): MonacoLanguageServiceModel => ({
  status: output.status,
  documentUri: output.documentUri,
  compiledAt: output.compiledAt,
  markers: output.diagnostics.map((diagnostic) => toMonacoMarker(diagnostic)),
  codeActions: output.diagnostics.flatMap((diagnostic) =>
    toMonacoCodeActions(diagnostic)
  ),
  outline: output.outline,
  semanticTokens: output.semanticTokens,
  symbols: output.symbols,
  ...(output.status === "failed" ? { error: output.error } : {})
});

export const toMonacoSemanticTokensData = (
  tokens: readonly ChemdSemanticToken[]
): Uint32Array => {
  let previousLine = 0;
  let previousStartCharacter = 0;
  const encoded: number[] = [];

  for (const token of tokens) {
    if (token.range.startLine !== token.range.endLine) {
      continue;
    }

    const line = token.range.startLine - 1;
    const startCharacter = token.range.startColumn - 1;
    const length = token.range.endColumn - token.range.startColumn;
    const tokenType = semanticTokenTypeIndex.get(token.type);
    if (length <= 0 || tokenType === undefined) {
      continue;
    }

    const deltaLine = line - previousLine;
    const deltaStart = deltaLine === 0
      ? startCharacter - previousStartCharacter
      : startCharacter;
    const tokenModifiers = token.modifiers.reduce((bitset: number, modifier) => {
      const index = semanticTokenModifierIndex.get(modifier);
      return index === undefined ? bitset : bitset | (1 << index);
    }, 0);

    encoded.push(deltaLine, deltaStart, length, tokenType, tokenModifiers);
    previousLine = line;
    previousStartCharacter = startCharacter;
  }

  return Uint32Array.from(encoded);
};

export const chemdSemanticTokensLegend = {
  tokenTypes: [...CHEMD_SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...CHEMD_SEMANTIC_TOKEN_MODIFIERS]
};

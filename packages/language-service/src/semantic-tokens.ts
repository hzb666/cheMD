import type { ChemdSourceRange, ChemdSymbol } from "./types";

export const CHEMD_SEMANTIC_TOKEN_TYPES = [
  "keyword",
  "parameter",
  "variable",
  "property",
  "string",
  "number"
] as const;

export const CHEMD_SEMANTIC_TOKEN_MODIFIERS = [
  "block",
  "declaration",
  "reference",
  "quantity",
  "chem",
  "metadata",
  "molecule",
  "reaction",
  "material",
  "batch",
  "result",
  "analysis",
  "sample",
  "procedure",
  "observation",
  "condition_screen"
] as const;

export type ChemdSemanticTokenType = typeof CHEMD_SEMANTIC_TOKEN_TYPES[number];
export type ChemdSemanticTokenModifier = typeof CHEMD_SEMANTIC_TOKEN_MODIFIERS[number];

export interface ChemdSemanticToken {
  range: ChemdSourceRange;
  type: ChemdSemanticTokenType;
  modifiers: ChemdSemanticTokenModifier[];
}

const programDeclarationPattern = /^(\s*)(molecule|material|batch|reaction|result|analysis|sample|artifact|condition_screen|procedure|observation|trace)\s+([A-Za-z_][\w-]*)(?:\s+for\s+@[A-Za-z0-9_.#/-]+)?\s*\{/u;
const programModulePattern = /^(\s*)(module)\s+([A-Za-z_][\w-]*)/u;
const programMetaPattern = /^(\s*)(meta)\s*\{/u;
const programAgentPattern = /^(\s*)(agent)(\s+)(run)\s+([A-Za-z_][\w-]*)\s*\{/u;
const programStepPattern = /^(\s*)(step)\s+([A-Za-z_][\w-]*)\s*=/u;
const fieldPattern = /^(\s*)([A-Za-z_][\w-]*)(\s*:)/u;
const explicitReferencePattern = /@[A-Za-z0-9_.#/-]+/gu;
const inlineParameterPattern = /(?:^|\|\s*)([A-Za-z_][\w-]*)(?=\s*=)/gu;
const inlineChemPattern = /:chem\[[^\]]*\]/gu;
const quantityPattern = /\b\d+(?:\.\d+)?(?:%|\s+(?:mg|g|kg|ug|µg|ml|mL|L|M|mM|mol|mol%|mmol|eq|percent|degC|°C|K|h|min|s|rpm|bar|atm|psi|pH))(?=$|[^\w%°µ])/gu;

const semanticTokenModifierSet = new Set<string>(CHEMD_SEMANTIC_TOKEN_MODIFIERS);

const splitSourceLines = (source: string): string[] =>
  source.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

const toRange = (
  lineNumber: number,
  startIndex: number,
  endIndex: number
): ChemdSourceRange => ({
  startLine: lineNumber,
  startColumn: startIndex + 1,
  endLine: lineNumber,
  endColumn: endIndex + 1
});

const symbolKindModifier = (
  symbol: ChemdSymbol | undefined
): ChemdSemanticTokenModifier | undefined =>
  symbol && semanticTokenModifierSet.has(symbol.kind)
    ? symbol.kind as ChemdSemanticTokenModifier
    : undefined;

const pushToken = (
  tokens: ChemdSemanticToken[],
  token: ChemdSemanticToken
): void => {
  if (token.range.endLine < token.range.startLine || token.range.endColumn <= token.range.startColumn) {
    return;
  }

  tokens.push(token);
};

const sortTokens = (
  tokens: ChemdSemanticToken[]
): ChemdSemanticToken[] =>
  tokens.sort((left, right) =>
    left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endColumn - right.range.endColumn
    || left.type.localeCompare(right.type)
  );

const dedupeTokens = (
  tokens: readonly ChemdSemanticToken[]
): ChemdSemanticToken[] => {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    const key = [
      token.range.startLine,
      token.range.startColumn,
      token.range.endLine,
      token.range.endColumn,
      token.type,
      token.modifiers.join(".")
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildChemdSemanticTokens = (
  source: string,
  symbols: readonly ChemdSymbol[] = []
): ChemdSemanticToken[] => {
  const lines = splitSourceLines(source);
  const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const tokens: ChemdSemanticToken[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const programDeclaration = line.match(programDeclarationPattern);
    if (programDeclaration) {
      const blockType = programDeclaration[2] ?? "";
      const blockTypeStart = (programDeclaration[1]?.length ?? 0);
      pushToken(tokens, {
        range: toRange(lineNumber, blockTypeStart, blockTypeStart + blockType.length),
        type: "keyword",
        modifiers: ["block"]
      });

      const declaration = programDeclaration[3] ?? "";
      const declarationStart = line.indexOf(declaration, blockTypeStart + blockType.length);
      const symbol = symbolById.get(declaration);
      const kindModifier = symbolKindModifier(symbol);
      pushToken(tokens, {
        range: toRange(lineNumber, declarationStart, declarationStart + declaration.length),
        type: "variable",
        modifiers: [
          "declaration",
          ...(kindModifier ? [kindModifier] : [])
        ]
      });
    }

    const moduleMatch = line.match(programModulePattern);
    if (moduleMatch) {
      const keyword = moduleMatch[2] ?? "";
      const keywordStart = moduleMatch[1]?.length ?? 0;
      pushToken(tokens, {
        range: toRange(lineNumber, keywordStart, keywordStart + keyword.length),
        type: "keyword",
        modifiers: ["block"]
      });
      const declaration = moduleMatch[3] ?? "";
      const declarationStart = line.indexOf(declaration, keywordStart + keyword.length);
      pushToken(tokens, {
        range: toRange(lineNumber, declarationStart, declarationStart + declaration.length),
        type: "variable",
        modifiers: ["declaration"]
      });
    }

    const metaMatch = line.match(programMetaPattern);
    if (metaMatch) {
      const keyword = metaMatch[2] ?? "";
      const keywordStart = metaMatch[1]?.length ?? 0;
      pushToken(tokens, {
        range: toRange(lineNumber, keywordStart, keywordStart + keyword.length),
        type: "keyword",
        modifiers: ["block", "metadata"]
      });
    }

    const agentMatch = line.match(programAgentPattern);
    if (agentMatch) {
      const agentStart = agentMatch[1]?.length ?? 0;
      const runStart = agentStart + (agentMatch[2]?.length ?? 0) + (agentMatch[3]?.length ?? 0);
      const declaration = agentMatch[5] ?? "";
      const declarationStart = line.indexOf(declaration, runStart + (agentMatch[4]?.length ?? 0));
      pushToken(tokens, {
        range: toRange(lineNumber, agentStart, agentStart + (agentMatch[2]?.length ?? 0)),
        type: "keyword",
        modifiers: ["block"]
      });
      pushToken(tokens, {
        range: toRange(lineNumber, runStart, runStart + (agentMatch[4]?.length ?? 0)),
        type: "keyword",
        modifiers: ["block"]
      });
      pushToken(tokens, {
        range: toRange(lineNumber, declarationStart, declarationStart + declaration.length),
        type: "variable",
        modifiers: ["declaration"]
      });
    }

    const stepMatch = line.match(programStepPattern);
    if (stepMatch) {
      const keyword = stepMatch[2] ?? "";
      const keywordStart = stepMatch[1]?.length ?? 0;
      const declaration = stepMatch[3] ?? "";
      const declarationStart = line.indexOf(declaration, keywordStart + keyword.length);
      pushToken(tokens, {
        range: toRange(lineNumber, keywordStart, keywordStart + keyword.length),
        type: "keyword",
        modifiers: ["block", "procedure"]
      });
      pushToken(tokens, {
        range: toRange(lineNumber, declarationStart, declarationStart + declaration.length),
        type: "variable",
        modifiers: ["declaration"]
      });
    }

    const fieldMatch = line.match(fieldPattern);
    if (fieldMatch) {
      const fieldName = fieldMatch[2] ?? "";
      const fieldStart = fieldMatch[1]?.length ?? 0;
      const fieldValueStart = (fieldMatch[0]?.length ?? 0);
      pushToken(tokens, {
        range: toRange(lineNumber, fieldStart, fieldStart + fieldName.length),
        type: "property",
        modifiers: lineNumber <= 5 ? ["metadata"] : []
      });

      if (fieldName === "params") {
        const rawValue = line.slice(fieldValueStart);
        let searchOffset = 0;
        for (const segment of rawValue.split("|")) {
          const paramName = segment.trimStart().match(/^([A-Za-z_][\w-]*)(?=\s*(?::|$))/u)?.[1];
          if (paramName) {
            const start = fieldValueStart + searchOffset + segment.indexOf(paramName);
            pushToken(tokens, {
              range: toRange(lineNumber, start, start + paramName.length),
              type: "parameter",
              modifiers: ["declaration"]
            });
          }
          searchOffset += segment.length + 1;
        }
      }
    }

    for (const match of line.matchAll(inlineParameterPattern)) {
      const parameterName = match[1] ?? "";
      const matchStart = match.index ?? 0;
      const start = line.indexOf(parameterName, matchStart);
      pushToken(tokens, {
        range: toRange(lineNumber, start, start + parameterName.length),
        type: "parameter",
        modifiers: []
      });
    }

    for (const match of line.matchAll(explicitReferencePattern)) {
      const raw = match[0];
      const start = match.index ?? 0;
      if (raw.startsWith("@param.")) {
        pushToken(tokens, {
          range: toRange(lineNumber, start, start + raw.length),
          type: "parameter",
          modifiers: ["reference"]
        });
        continue;
      }

      const symbol = symbolById.get(raw.slice(1));
      const kindModifier = symbolKindModifier(symbol);
      pushToken(tokens, {
        range: toRange(lineNumber, start, start + raw.length),
        type: "variable",
        modifiers: [
          "reference",
          ...(kindModifier ? [kindModifier] : [])
        ]
      });
    }

    for (const match of line.matchAll(inlineChemPattern)) {
      const raw = match[0];
      const start = match.index ?? 0;
      pushToken(tokens, {
        range: toRange(lineNumber, start, start + raw.length),
        type: "string",
        modifiers: ["chem"]
      });
    }

    for (const match of line.matchAll(quantityPattern)) {
      const raw = match[0];
      const start = match.index ?? 0;
      pushToken(tokens, {
        range: toRange(lineNumber, start, start + raw.length),
        type: "number",
        modifiers: ["quantity"]
      });
    }
  });

  return dedupeTokens(sortTokens(tokens));
};

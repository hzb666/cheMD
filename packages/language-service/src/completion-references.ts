import type {
  ChemdCompletionContext,
  ChemdCompletionItem,
  ChemdCompletionRequest
} from "./completion-types";
import type { ChemdSourceRange, ChemdSymbol } from "./types";

const referenceFields = new Set(["reactants", "products", "prev"]);
const referenceTokenPattern = /@([A-Za-z0-9_-]*)$/;

export const getChemdReferenceCompletions = (
  request: ChemdCompletionRequest,
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  const symbols = request.compileOutput?.symbols ?? [];
  const token = readReferenceToken(context);
  if (symbols.length === 0 || !token) {
    return [];
  }

  const prefix = token.symbolPrefix.toLowerCase();
  return getCurrentDocumentSymbols(symbols, context.block?.id)
    .filter((symbol) => symbol.id.toLowerCase().startsWith(prefix))
    .map((symbol, index) => createReferenceItem(symbol, token.range, index));
};

const readReferenceToken = (
  context: ChemdCompletionContext
): { symbolPrefix: string; range: ChemdSourceRange } | undefined => {
  if (context.isFrontmatter) {
    return undefined;
  }

  const explicitToken = context.linePrefix.match(referenceTokenPattern);
  if (explicitToken) {
    const rawToken = explicitToken[0] ?? "";
    return {
      symbolPrefix: explicitToken[1] ?? "",
      range: {
        ...context.range,
        startColumn: Math.max(1, context.position.column - rawToken.length)
      }
    };
  }

  if (!isReferenceValuePosition(context)) {
    return undefined;
  }

  return {
    symbolPrefix: context.tokenPrefix,
    range: context.range
  };
};

const isReferenceValuePosition = (context: ChemdCompletionContext): boolean =>
  context.isChemdBlock &&
  context.isFieldValuePosition &&
  Boolean(context.fieldKey && referenceFields.has(context.fieldKey));

const getCurrentDocumentSymbols = (
  symbols: readonly ChemdSymbol[],
  currentBlockId: string | undefined
): ChemdSymbol[] => {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    if (symbol.id === currentBlockId || seen.has(symbol.id)) {
      return false;
    }
    seen.add(symbol.id);
    return true;
  });
};

const createReferenceItem = (
  symbol: ChemdSymbol,
  range: ChemdSourceRange,
  index: number
): ChemdCompletionItem => ({
  id: `reference.chemd.${symbol.id}`,
  label: symbol.id,
  kind: "reference",
  insertText: `@${symbol.id}`,
  insertTextFormat: "plain",
  detail: `${symbol.kind} reference`,
  sortText: `r-${String(index).padStart(2, "0")}-${symbol.id}`,
  filterText: symbol.id,
  data: {
    type: "reference",
    symbolId: symbol.id,
    symbolKind: symbol.kind
  },
  range
});

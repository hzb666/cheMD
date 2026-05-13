import { getChemdCompletionContext } from "./completion-context";
import type {
  ChemdCompletionContext,
  ChemdCompletionRequest
} from "./completion-types";
import type { ChemdSourceRange } from "./types";
import type {
  ChemdWorkspaceSymbol,
  ChemdWorkspaceSymbolIndex
} from "./workspace-symbol-types";

const referenceFields = new Set(["reactants", "products", "prev"]);
const referenceTokenPattern = /@([A-Za-z0-9_.#/-]*)$/;
const preferredKindsByField: Record<string, string> = {
  reactants: "molecule",
  products: "molecule",
  prev: "reaction"
};

export interface ChemdWorkspaceReferenceCompletionRequest
  extends ChemdCompletionRequest {
  workspaceSymbolIndex?: ChemdWorkspaceSymbolIndex;
  currentDocumentId?: string;
}

export interface ChemdWorkspaceReferenceCompletionData {
  type: "workspace-reference";
  symbolId: string;
  localId: string;
  symbolKind: string;
  documentId: string;
  documentUri: string;
  sourceHash: string;
  stale: boolean;
}

export interface ChemdWorkspaceReferenceCompletionItem {
  id: string;
  label: string;
  kind: "reference";
  insertText: string;
  insertTextFormat: "plain";
  detail: string;
  sortText: string;
  filterText: string;
  data: ChemdWorkspaceReferenceCompletionData;
  range: ChemdSourceRange;
}

export interface ChemdWorkspaceReferenceCompletionList {
  documentUri?: string;
  items: ChemdWorkspaceReferenceCompletionItem[];
  range: ChemdSourceRange;
}

export const getChemdWorkspaceReferenceCompletions = (
  request: ChemdWorkspaceReferenceCompletionRequest,
  context: ChemdCompletionContext = getChemdCompletionContext(request)
): ChemdWorkspaceReferenceCompletionList => {
  const token = readWorkspaceReferenceToken(context);
  const index = request.workspaceSymbolIndex;
  if (!token || !index || index.symbols.length === 0) {
    return emptyWorkspaceReferenceList(request, context);
  }

  const symbols = index.symbols
    .filter((symbol) => isCompletionMatch(symbol, token.symbolPrefix))
    .filter((symbol) => !isCurrentSymbol(symbol, request, context))
    .sort((left, right) => compareWorkspaceSymbols(left, right, request, context));

  return {
    documentUri: request.documentUri,
    items: symbols.map((symbol, itemIndex) =>
      createWorkspaceReferenceItem(symbol, token.range, itemIndex)
    ),
    range: token.range
  };
};

const readWorkspaceReferenceToken = (
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

const isCompletionMatch = (
  symbol: ChemdWorkspaceSymbol,
  symbolPrefix: string
): boolean => {
  const prefix = symbolPrefix.toLowerCase();
  if (!prefix) {
    return true;
  }

  return [
    symbol.id,
    symbol.localId,
    symbol.name,
    symbol.documentId,
    symbol.documentUri
  ].some((value) => value.toLowerCase().includes(prefix));
};

const isCurrentSymbol = (
  symbol: ChemdWorkspaceSymbol,
  request: ChemdWorkspaceReferenceCompletionRequest,
  context: ChemdCompletionContext
): boolean => {
  const currentBlockId = context.block?.id;
  return Boolean(currentBlockId) &&
    symbol.localId === currentBlockId &&
    isCurrentDocument(symbol, request);
};

const isCurrentDocument = (
  symbol: ChemdWorkspaceSymbol,
  request: ChemdWorkspaceReferenceCompletionRequest
): boolean =>
  Boolean(request.currentDocumentId && symbol.documentId === request.currentDocumentId) ||
  Boolean(request.documentUri && symbol.documentUri === request.documentUri);

const compareWorkspaceSymbols = (
  left: ChemdWorkspaceSymbol,
  right: ChemdWorkspaceSymbol,
  request: ChemdWorkspaceReferenceCompletionRequest,
  context: ChemdCompletionContext
): number =>
  preferredRank(left, context) - preferredRank(right, context) ||
  staleRank(left) - staleRank(right) ||
  currentDocumentRank(left, request) - currentDocumentRank(right, request) ||
  left.name.localeCompare(right.name) ||
  left.documentUri.localeCompare(right.documentUri) ||
  left.localId.localeCompare(right.localId);

const preferredRank = (
  symbol: ChemdWorkspaceSymbol,
  context: ChemdCompletionContext
): number => {
  const preferredKind = context.fieldKey
    ? preferredKindsByField[context.fieldKey]
    : undefined;
  return preferredKind && symbol.kind === preferredKind ? 0 : 1;
};

const staleRank = (symbol: ChemdWorkspaceSymbol): number =>
  symbol.stale ? 1 : 0;

const currentDocumentRank = (
  symbol: ChemdWorkspaceSymbol,
  request: ChemdWorkspaceReferenceCompletionRequest
): number =>
  isCurrentDocument(symbol, request) ? 0 : 1;

const createWorkspaceReferenceItem = (
  symbol: ChemdWorkspaceSymbol,
  range: ChemdSourceRange,
  itemIndex: number
): ChemdWorkspaceReferenceCompletionItem => ({
  id: `workspace-reference.chemd.${symbol.id}`,
  label: symbol.id,
  kind: "reference",
  insertText: `@${symbol.id}`,
  insertTextFormat: "plain",
  detail: createDetail(symbol),
  sortText: `wr-${String(itemIndex).padStart(3, "0")}-${symbol.id}`,
  filterText: `${symbol.localId} ${symbol.name} ${symbol.id} ${symbol.documentUri}`,
  data: {
    type: "workspace-reference",
    symbolId: symbol.id,
    localId: symbol.localId,
    symbolKind: symbol.kind,
    documentId: symbol.documentId,
    documentUri: symbol.documentUri,
    sourceHash: symbol.sourceHash,
    stale: symbol.stale
  },
  range
});

const createDetail = (symbol: ChemdWorkspaceSymbol): string => {
  const stalePrefix = symbol.stale ? "stale " : "";
  return `${stalePrefix}${symbol.kind} reference from ${symbol.documentUri}`;
};

const emptyWorkspaceReferenceList = (
  request: ChemdWorkspaceReferenceCompletionRequest,
  context: ChemdCompletionContext
): ChemdWorkspaceReferenceCompletionList => ({
  documentUri: request.documentUri,
  items: [],
  range: context.range
});

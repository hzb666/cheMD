import { getChemdCompletionContext } from "./completion-context";
import { getChemdFieldCompletions } from "./completion-fields";
import { getChemdReferenceCompletions } from "./completion-references";
import { getChemdSnippetCompletions } from "./completion-snippets";
import type { ChemdCompletionItem, ChemdCompletionList, ChemdCompletionRequest } from "./completion-types";
import { getChemdValueCompletions } from "./completion-values";

export const getChemdCompletions = (
  request: ChemdCompletionRequest
): ChemdCompletionList => {
  const context = getChemdCompletionContext(request);
  const items = [
    ...getChemdReferenceCompletions(request, context),
    ...getChemdValueCompletions(context),
    ...getChemdFieldCompletions(context),
    ...getChemdSnippetCompletions(context)
  ];

  return {
    documentUri: request.documentUri,
    items: sortCompletionItems(items),
    range: context.range
  };
};

const sortCompletionItems = (items: ChemdCompletionItem[]): ChemdCompletionItem[] =>
  [...items].sort((left, right) =>
    (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label)
  );

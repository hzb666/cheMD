import type { ChemdCompletionContext, ChemdCompletionItem } from "./completion-types";

const snippets: Array<Omit<ChemdCompletionItem, "range">> = [{
  id: "snippet.chemd.reaction",
  label: "chemd reaction",
  kind: "snippet",
  insertText: [
    ":::chemd #rxn-${1:id}",
    "kind: reaction",
    "reactants: ${2:@mol-a}",
    "products: ${3:@mol-b}",
    "conditions: ${4:solvent | temperature | time}",
    ":::"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Chemd reaction block",
  sortText: "a-reaction"
}, {
  id: "snippet.chemd.molecule",
  label: "chemd molecule",
  kind: "snippet",
  insertText: [
    ":::chemd #mol-${1:id}",
    "kind: molecule",
    "name: ${2:name}",
    "smiles: ${3:SMILES}",
    ":::"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Chemd molecule block",
  sortText: "a-molecule"
}];

export const getChemdSnippetCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  if (context.isFrontmatter || context.block) {
    return [];
  }

  return snippets.map((item) => ({
    ...item,
    sortText: context.linePrefix.trim() ? `z-${item.sortText}` : item.sortText,
    range: context.range
  }));
};

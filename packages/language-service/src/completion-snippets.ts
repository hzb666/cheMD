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
}, {
  id: "snippet.result",
  label: "result block",
  kind: "snippet",
  insertText: [
    ":::result #res-${1:id}",
    "reaction: ${2:@rxn-main}",
    "status: ${3:pending}",
    "notes: ${4:notes}",
    ":::"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Result evidence block",
  sortText: "a-result"
}, {
  id: "snippet.procedure",
  label: "procedure block",
  kind: "snippet",
  insertText: [
    ":::procedure #proc-${1:id}",
    "reaction: ${2:@rxn-main}",
    "step: ${3:charge} | inputs=${4:@mol-a} | outputs=${5:@mol-b}",
    ":::"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Procedure block",
  sortText: "a-procedure"
}, {
  id: "snippet.template",
  label: "template block",
  kind: "snippet",
  insertText: [
    ":::template ${1:name}",
    "params: ${2:param:string}",
    "description: ${3:description}",
    "${4:body}",
    ":::"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Template block",
  sortText: "a-template"
}, {
  id: "snippet.condition_varies",
  label: "condition-varies block",
  kind: "snippet",
  insertText: [
    ":::condition-varies #cv-${1:id}",
    "reaction: ${2:@rxn-main}",
    "condition: ${3:solvent=baseline | temperature=baseline}",
    "var1: ${4:solvent=candidate}",
    ":::"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Condition variation block",
  sortText: "a-condition-varies"
}];

export const getChemdSnippetCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  if (context.isFrontmatter || context.isFieldValuePosition || context.isReferencePosition) {
    return [];
  }

  return snippets.map((item) => ({
    ...item,
    sortText: context.linePrefix.trim() ? `z-${item.sortText}` : item.sortText,
    range: context.range
  }));
};

import type { ChemdCompletionContext, ChemdCompletionItem } from "./completion-types";

const snippets: Array<Omit<ChemdCompletionItem, "range">> = [{
  id: "snippet.chemd.reaction",
  label: "chemd reaction",
  kind: "snippet",
  insertText: [
    ":::chemd #rxn-${1:id}",
    "reactant: ${2:@mol-a} | ${3:1.0 mmol} | ${4:1.0 eq} | limiting=true",
    "reactant: ${5:@mol-b} | ${6:1.2 eq}",
    "product: ${7:@mol-c}",
    "solvent: ${8:MeCN}",
    "temperature: ${9:r.t.}",
    "time: ${10:2 h}",
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
    "standard: ${2:@rxn-standard}",
    "factor: ${3:solvent} | baseline=${4:THF}",
    "outcome: ${5:yield} | baseline=${6:68 %}",
    "attempt: ${7:var1}",
    "${3:solvent}: ${8:MeCN}",
    "${5:yield}: ${9:72 %}",
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

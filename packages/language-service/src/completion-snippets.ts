import type { ChemdCompletionContext, ChemdCompletionItem } from "./completion-types";

const snippets: Array<Omit<ChemdCompletionItem, "range">> = [{
  id: "snippet.chemd.reaction",
  label: "chemd reaction",
  kind: "snippet",
  insertText: [
    "reaction rxn_${1:id} {",
    "  reactants: [${2:@mol_a}]",
    "  products: [${3:@mol_product}]",
    "  catalyst: ${4:\"Pd catalyst\"}",
    "  solvent: ${5:[\"MeCN\", \"water\"]}",
    "  temperature: ${6:25 C}",
    "  time: ${7:2 h}",
    "}"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Chemd reaction declaration",
  sortText: "a-reaction"
}, {
  id: "snippet.chemd.molecule",
  label: "chemd molecule",
  kind: "snippet",
  insertText: [
    "molecule mol_${1:id} {",
    "  name: ${2:\"name\"}",
    "  smiles: ${3:\"SMILES\"}",
    "}"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Chemd molecule declaration",
  sortText: "a-molecule"
}, {
  id: "snippet.result",
  label: "result block",
  kind: "snippet",
  insertText: [
    "result res_${1:id} for ${2:@rxn_main} {",
    "  status: ${3:pending}",
    "  notes: ${4:\"notes\"}",
    "}"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Result evidence block",
  sortText: "a-result"
}, {
  id: "snippet.procedure",
  label: "procedure block",
  kind: "snippet",
  insertText: [
    "procedure proc_${1:id} for ${2:@rxn_main} {",
    "  step ${3:charge} = ${4:charge}(inputs: [${5:@mol_a}])",
    "}"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Procedure block",
  sortText: "a-procedure"
}, {
  id: "snippet.condition_screen",
  label: "condition screen declaration",
  kind: "snippet",
  insertText: [
    "condition_screen cv_${1:id} for ${2:@rxn_standard} {",
    "  standard: ${3:@rxn_standard}",
    "  factor: ${4:[\"solvent\"]}",
    "  outcome: ${5:[\"yield\"]}",
    "}"
  ].join("\n"),
  insertTextFormat: "snippet",
  detail: "Condition screen declaration",
  sortText: "a-condition-screen"
}];

export const getChemdSnippetCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  if (
    context.isFieldValuePosition ||
    context.isFieldKeyPosition ||
    context.isStepFamilyPosition ||
    context.stepParam ||
    context.isReferencePosition
  ) {
    return [];
  }

  return snippets.map((item) => ({
    ...item,
    sortText: context.linePrefix.trim() ? `z-${item.sortText}` : item.sortText,
    range: context.range
  }));
};

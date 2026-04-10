import type {
  AnalysisNode,
  ChemdNode,
  ColNode,
  MoleculeNode,
  ReactionNode,
  ResultNode,
  SampleNode,
  TemplateNode
} from "@chemd/core";
import { renderMarkdownNode } from "./markdown-render";
import {
  escapeHtml,
  renderBlockTitle,
  renderFieldList,
  renderLoadingGraphic,
  stringifyAttributeValue,
  stringifyJsonAttributeValue
} from "./shared";

export interface RenderNodeOptions {
  suppressLeadingMarkdownHeadingText?: string;
}

const renderReaction = (node: ReactionNode): string =>
  `<section class="chemd-block chemd-block--reaction" data-node-id="${escapeHtml(node.id ?? "")}" data-reactants="${stringifyJsonAttributeValue(node.reactants ?? [])}" data-products="${stringifyJsonAttributeValue(node.products ?? [])}" data-conditions="${stringifyJsonAttributeValue(node.conditions ?? [])}">
    ${renderBlockTitle("Reaction", node.id)}
    ${renderLoadingGraphic("reaction")}
    ${renderFieldList([
      ["Name", node.name],
      ["Reagents", node.reagents],
      ["Catalyst", node.catalyst],
      ["Solvent", node.solvent],
      ["Temperature", node.temperature],
      ["Time", node.time],
      ["Pressure", node.pressure],
      ["Atmosphere", node.atmosphere],
      ["Yield", node.yield],
      ["Conversion", node.conversion],
      ["Selectivity", node.selectivity],
      ["Caption", node.caption]
    ])}
  </section>`;

const renderResult = (node: ResultNode): string =>
  `<section class="chemd-block chemd-block--result" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Result", node.id)}
    ${renderFieldList([
      ["Status", node.status],
      ["Yield", node.yield],
      ["Conversion", node.conversion],
      ["Selectivity", node.selectivity],
      ["Isolated Mass", node.isolated_mass],
      ["Product State", node.product_state],
      ["Purity", node.purity],
      ["Notes", node.notes]
    ])}
  </section>`;

const renderMolecule = (node: MoleculeNode): string =>
  `<section class="chemd-block chemd-block--molecule" data-node-id="${escapeHtml(node.id ?? "")}" data-smiles="${stringifyAttributeValue(node.smiles)}">
    ${renderBlockTitle("Molecule", node.id)}
    ${renderLoadingGraphic("molecule")}
    ${renderFieldList([
      ["Name", node.name],
      ["Role", node.role],
      ["Caption", node.caption],
      ["Formula", node.formula],
      ["Amount", node.amount],
      ["Equivalents", node.equivalents]
    ])}
  </section>`;

const renderAnalysis = (node: AnalysisNode): string =>
  `<section class="chemd-block chemd-block--analysis" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Analysis", node.id)}
    ${renderFieldList([
      ["Type", node.type_name],
      ["Instrument", node.instrument],
      ["Solvent", node.solvent],
      ["Frequency", node.frequency],
      ["Method", node.method],
      ["Data", node.data],
      ["Notes", node.notes]
    ])}
  </section>`;

const renderSample = (node: SampleNode): string =>
  `<section class="chemd-block chemd-block--sample" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Sample", node.id)}
    ${renderFieldList([
      ["Name", node.name],
      ["Sample ID", node.sample_id],
      ["Batch", node.batch],
      ["Purity", node.purity],
      ["Supplier", node.supplier],
      ["Notes", node.notes]
    ])}
  </section>`;

const renderTemplate = (node: TemplateNode): string =>
  `<section class="chemd-block chemd-block--template" data-template-name="${escapeHtml(node.name)}">
    <h2>Template</h2>
    ${renderFieldList([
      ["Name", node.name],
      ["Description", node.description],
      ["Params", node.params],
      ["Bind", Object.entries(node.bind).map(([alias, source]) => `${alias}=${source}`)]
    ])}
  </section>`;

const renderCol = (node: ColNode): string => {
  const columns = Math.max(1, node.columns);
  const items = node.children
    .map((child) => `<div class="chemd-col-item">${renderNode(child)}</div>`)
    .join("");

  return `<section class="chemd-block chemd-block--col" data-columns="${columns}">
    <div class="chemd-col-grid" style="--chemd-col-columns:${columns}">${items}</div>
  </section>`;
};

export const renderNode = (
  node: ChemdNode,
  options: RenderNodeOptions = {}
): string => {
  switch (node.type) {
    case "markdown":
      return renderMarkdownNode(node, {
        suppressLeadingHeadingText: options.suppressLeadingMarkdownHeadingText
      });
    case "reaction":
      return renderReaction(node);
    case "result":
      return renderResult(node);
    case "molecule":
      return renderMolecule(node);
    case "analysis":
      return renderAnalysis(node);
    case "sample":
      return renderSample(node);
    case "template":
      return renderTemplate(node);
    case "col":
      return renderCol(node);
    default:
      return "";
  }
};

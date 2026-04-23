import type {
  AnalysisNode,
  ArtifactNode,
  ChemdNode,
  ColNode,
  ConditionVariesNode,
  MoleculeNode,
  ObservationNode,
  ProcedureNode,
  ProcedureStepNode,
  ReactionNode,
  ResultNode,
  SampleNode,
  TemplateNode
} from "@chemd/core";
import type { NormalizedTlcAnalysis } from "@chemd/core";
import { renderMarkdownNode } from "./markdown-render";
import {
  escapeHtml,
  renderBlockTitle,
  renderFieldList,
  renderLoadingGraphic,
  stringifyJsonAttributeValue
} from "./shared";
import { renderTlcAnalysis } from "./tlc-render";

export interface RenderNodeOptions {
  suppressLeadingMarkdownHeadingText?: string;
  typedNodes?: Map<string, HtmlTypedSemanticNode>;
}

export interface HtmlTypedAnalysisNode {
  kind: "analysis";
  nodeId: string;
  normalizedTlc?: NormalizedTlcAnalysis | null;
}

export type HtmlTypedSemanticNode =
  | HtmlTypedAnalysisNode
  | {
      kind: string;
      nodeId: string;
    };

const renderBodyText = (value: string | undefined): string =>
  value
    ? `<div class="chemd-block-copy"><p>${escapeHtml(value).replace(/\n/g, "<br />")}</p></div>`
    : "";

const STEP_FAMILY_LABELS: Record<string, string> = {
  analyze: "Analyze",
  cool: "Cool",
  heat: "Heat",
  hold: "Hold",
  mix: "Mix",
  purge: "Purge",
  quench: "Quench"
};

const STEP_PARAM_LABELS: Record<string, string> = {
  analysisType: "Analysis type",
  analysis_type: "Analysis type",
  duration: "Duration",
  target_temperature: "Target temperature",
  temperature: "Temperature",
  time: "Time"
};

const humanizeIdentifier = (value: string): string => {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? `${spaced[0].toUpperCase()}${spaced.slice(1)}` : value;
};

const renderStepParamValue = (key: string, value: string): string =>
  key === "analysisType" || key === "analysis_type" ? value.toUpperCase() : value;

const readStepFamilyLabel = (family: string): string =>
  STEP_FAMILY_LABELS[family] ?? humanizeIdentifier(family);

const readStepParamLabel = (key: string): string =>
  STEP_PARAM_LABELS[key] ?? humanizeIdentifier(key);

const renderStepField = (label: string, value: string): string =>
  `<div class="chemd-step-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;

const renderStepListField = (label: string, values: string[] | undefined): string[] =>
  values?.length ? [renderStepField(label, values.join(", "))] : [];

const buildStepNumberById = (steps: ProcedureStepNode[]): Map<string, number> => {
  const idCounts = new Map<string, number>();
  steps.forEach((step) => {
    if (step.stepId) {
      idCounts.set(step.stepId, (idCounts.get(step.stepId) ?? 0) + 1);
    }
  });

  const indexedSteps: Array<[string, number]> = [];
  steps.forEach((step, index) => {
    if (step.stepId && idCounts.get(step.stepId) === 1) {
      indexedSteps.push([step.stepId, index + 1]);
    }
  });

  return new Map(indexedSteps);
};

const renderStepFields = (
  step: ProcedureStepNode,
  stepNumberById: Map<string, number>
): string => {
  const paramFields = Object.entries(step.params ?? {}).map(([key, value]) =>
    renderStepField(readStepParamLabel(key), renderStepParamValue(key, value))
  );
  const dependencyFields = (step.dependsOn ?? []).flatMap((id) => {
    const stepNumber = stepNumberById.get(id);
    return [renderStepField("After", stepNumber ? `Step ${stepNumber}` : id)];
  });
  const fields = [
    ...paramFields,
    ...renderStepListField("Uses", step.inputs),
    ...renderStepListField("Produces", step.outputs),
    ...dependencyFields
  ].join("");
  return fields ? `<dl class="chemd-step-fields">${fields}</dl>` : "";
};

const renderProcedureSteps = (node: ProcedureNode): string => {
  if (!node.steps?.length) {
    return "";
  }

  const stepNumberById = buildStepNumberById(node.steps);
  const items = node.steps.map((step, index) => {
    const title = `Step ${index + 1}: ${readStepFamilyLabel(step.family)}`;
    return `<li class="chemd-procedure-step"><span class="chemd-step-title">${escapeHtml(title)}</span>${renderStepFields(step, stepNumberById)}</li>`;
  }).join("");

  return `<ol class="chemd-procedure-steps">${items}</ol>`;
};

const getAnalysisLaneFields = (node: AnalysisNode): Array<[string, string]> =>
  Object.entries(node)
    .filter(([key, value]) => /^p\d+$/.test(key) && typeof value === "string" && value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([key, value]) => [key.toUpperCase(), value as string]);

const findTypedAnalysisNode = (
  node: AnalysisNode,
  typedNodes: Map<string, HtmlTypedSemanticNode> | undefined
): HtmlTypedAnalysisNode | undefined => {
  const typedNode = node.id ? typedNodes?.get(node.id) : undefined;
  return typedNode?.kind === "analysis" ? typedNode as HtmlTypedAnalysisNode : undefined;
};

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
  `<section class="chemd-block chemd-block--molecule" data-node-id="${escapeHtml(node.id ?? "")}" data-smiles="${escapeHtml(node.smiles ?? "")}">
    ${renderBlockTitle("Molecule", node.id)}
    ${renderLoadingGraphic("molecule")}
    ${renderFieldList([
      ["Name", node.name],
      ["SMILES", node.smiles],
      ["CAS", node.cas],
      ["Role", node.role],
      ["Caption", node.caption],
      ["Formula", node.formula],
      ["Amount", node.amount],
      ["Equivalents", node.equivalents]
    ])}
  </section>`;

const renderConditionVaries = (node: ConditionVariesNode): string =>
  `<section class="chemd-block chemd-block--condition-varies" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Condition Variation", node.id)}
    ${renderFieldList([
      ["Reaction", node.reaction],
      ["Standard", node.standard],
      ["Condition", node.condition?.map((variable) =>
        `${variable.field}=${variable.baseline ?? variable.raw}`
      ).join(" | ")],
      ["Varies", node.varyFields?.join(" | ")],
      ...node.changes.map((change): [string, string] => [
        humanizeIdentifier(change.field),
        change.raw
      ]),
      ...((node.attempts ?? []).map((attempt): [string, string] => [
        attempt.id,
        [
          attempt.reaction ? `reaction=${attempt.reaction}` : undefined,
          attempt.result ? `result=${attempt.result}` : undefined,
          attempt.mode ? `mode=${attempt.mode}` : undefined,
          ...attempt.changes.map((change) => `${change.field}=${change.candidate ?? change.raw}`),
          attempt.note ? `note=${attempt.note}` : undefined
        ].filter(Boolean).join(" | ")
      ])),
      ["Notes", node.notes]
    ])}
  </section>`;

const renderAnalysis = (node: AnalysisNode, options: RenderNodeOptions): string =>
  node.type_name?.toLowerCase() === "tlc"
    ? renderTlcAnalysis(node, findTypedAnalysisNode(node, options.typedNodes)?.normalizedTlc)
    : `<section class="chemd-block chemd-block--analysis" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Analysis", node.id)}
    ${renderFieldList([
      ["Type", node.type_name],
      ["Related", node.ref],
      ["Time", node.time],
      ["Eluent", node.eluent],
      ["Plate", node.plate],
      ["Visualization", node.visualization],
      ["Result", node.result],
      ["Instrument", node.instrument],
      ["Solvent", node.solvent],
      ["Frequency", node.frequency],
      ["Method", node.method],
      ["Data", node.data],
      ["Notes", node.notes],
      ...getAnalysisLaneFields(node)
    ])}
  </section>`;

const renderProcedure = (node: ProcedureNode): string =>
  `<section class="chemd-block chemd-block--procedure" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Procedure", node.id)}
    ${renderFieldList([["Related", node.ref]])}
    ${renderProcedureSteps(node)}
    ${renderBodyText(node.body)}
  </section>`;

const renderObservation = (node: ObservationNode): string =>
  `<section class="chemd-block chemd-block--observation" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Observation", node.id)}
    ${renderFieldList([["Related", node.ref]])}
    ${renderBodyText(node.body)}
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

const renderArtifact = (node: ArtifactNode): string =>
  `<section class="chemd-block chemd-block--artifact" data-node-id="${escapeHtml(node.id ?? "")}">
    ${renderBlockTitle("Artifact", node.id)}
    ${renderFieldList([
      ["Kind", node.kind],
      ["Related", node.ref],
      ["Path", node.path],
      ["Checksum", node.checksum],
      ["Instrument", node.instrument],
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

const renderCol = (node: ColNode, options: RenderNodeOptions): string => {
  const columns = Math.max(1, node.columns);
  const items = node.children
    .map((child) => `<div class="chemd-col-item">${renderNode(child, options)}</div>`)
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
      return renderAnalysis(node, options);
    case "procedure":
      return renderProcedure(node);
    case "observation":
      return renderObservation(node);
    case "sample":
      return renderSample(node);
    case "artifact":
      return renderArtifact(node);
    case "condition_varies":
      return renderConditionVaries(node);
    case "template":
      return renderTemplate(node);
    case "col":
      return renderCol(node, options);
    default:
      return "";
  }
};

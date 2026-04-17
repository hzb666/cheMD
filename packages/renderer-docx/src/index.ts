import type { ChemdDocument } from "@chemd/core";
import type { RenderAdapterPayload, RenderOptions } from "@chemd/render-profile";

export interface DocxBridgePayload {
  version: "v0.1";
  document: {
    meta: ChemdDocument["meta"];
    children: ChemdDocument["children"];
  };
  diagnostics: ChemdDocument["diagnostics"];
  render: {
    profileId: string;
    resolvedOptions: RenderOptions;
    adapter?: RenderAdapterPayload;
  };
  exportHints: {
    format: "docx-bridge";
    pipeline: "html-or-markdown-to-docx";
    recommendedTool: "pandoc";
  };
}

const normalizeWhitespace = (value: string): string => value.replaceAll(/\s+/g, " ").trim();

const isSimpleYamlString = (value: string): boolean =>
  value.length > 0 && /^[a-zA-Z0-9 _./:-]+$/.test(value) && !value.startsWith("-") && !value.includes(": ");

const toYamlScalar = (value: unknown): string => {
  if (typeof value === "string") {
    return isSimpleYamlString(value) ? value : JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return JSON.stringify(value);
};

const renderMetaFrontmatter = (meta: ChemdDocument["meta"]): string => {
  const lines = Object.entries(meta).flatMap(([key, rawValue]) => {
    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) {
        return [`${key}: []`];
      }

      return [`${key}:`, ...rawValue.map((value) => `  - ${toYamlScalar(value)}`)];
    }

    return [`${key}: ${toYamlScalar(rawValue)}`];
  });

  return ["---", ...lines, "---"].join("\n");
};

type DocxNode = ChemdDocument["children"][number];
type DocxNodeByType<TType extends DocxNode["type"]> = Extract<DocxNode, { type: TType }>;
type FieldLine = [label: string, value: string | undefined];

const compactLines = (lines: Array<string | undefined>): string =>
  lines.filter((line): line is string => Boolean(line)).join("\n");

const renderHeading = (label: string, id?: string): string =>
  id ? `### ${label} \`${id}\`` : `### ${label}`;

const renderFieldLines = (fields: FieldLine[]): string[] =>
  fields.flatMap(([label, value]) => (value ? [`- ${label}: ${value}`] : []));

const renderMarkdownNode = (value: string): string => value.trim();

const renderReactionNode = (node: DocxNodeByType<"reaction">): string =>
  compactLines([
    renderHeading("Reaction", node.id),
    ...renderFieldLines([
      ["Name", node.name],
      ["Temperature", node.temperature],
      ["Time", node.time],
      ["Solvent", node.solvent],
      ["Catalyst", node.catalyst],
      ["Yield", node.yield],
      ["Caption", node.caption]
    ])
  ]);

const renderMoleculeNode = (node: DocxNodeByType<"molecule">): string =>
  compactLines([
    renderHeading("Molecule", node.id),
    ...renderFieldLines([
      ["Name", node.name],
      ["Formula", node.formula],
      ["Amount", node.amount],
      ["Role", node.role]
    ])
  ]);

const renderResultNode = (node: DocxNodeByType<"result">): string =>
  compactLines([
    renderHeading("Result", node.id),
    ...renderFieldLines([
      ["Status", node.status],
      ["Yield", node.yield],
      ["Conversion", node.conversion],
      ["Selectivity", node.selectivity],
      ["Isolated mass", node.isolated_mass]
    ])
  ]);

const renderAnalysisPointLines = (node: DocxNodeByType<"analysis">): string[] =>
  Object.entries(node)
    .filter(([key, value]) => /^p\d+$/.test(key) && typeof value === "string" && value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([key, value]) => `- ${key.toUpperCase()}: ${value}`);

const renderAnalysisNode = (node: DocxNodeByType<"analysis">): string =>
  compactLines([
    renderHeading("Analysis", node.id),
    ...renderFieldLines([
      ["Type", node.type_name],
      ["Ref", node.ref],
      ["Time", node.time],
      ["Eluent", node.eluent],
      ["Plate", node.plate],
      ["Visualization", node.visualization],
      ["Result", node.result],
      ["Instrument", node.instrument],
      ["Solvent", node.solvent],
      ["Frequency", node.frequency],
      ["Data", node.data]
    ]),
    ...renderAnalysisPointLines(node)
  ]);

const renderProcedureNode = (node: DocxNodeByType<"procedure">): string =>
  compactLines([renderHeading("Procedure", node.id), ...renderFieldLines([["Ref", node.ref]]), node.body]);

const renderObservationNode = (node: DocxNodeByType<"observation">): string =>
  compactLines([renderHeading("Observation", node.id), ...renderFieldLines([["Ref", node.ref]]), node.body]);

const renderSampleNode = (node: DocxNodeByType<"sample">): string =>
  compactLines([
    renderHeading("Sample", node.id),
    ...renderFieldLines([
      ["Name", node.name],
      ["Sample ID", node.sample_id],
      ["Batch", node.batch],
      ["Purity", node.purity],
      ["Supplier", node.supplier]
    ])
  ]);

const renderTemplateBindLine = (bind: DocxNodeByType<"template">["bind"]): string | undefined => {
  const values = Object.entries(bind);
  return values.length > 0
    ? `- Bind: ${values.map(([key, value]) => `${key}=${value}`).join(" | ")}`
    : undefined;
};

const renderTemplateNode = (node: DocxNodeByType<"template">): string =>
  compactLines([
    `### Template \`${node.name}\``,
    renderTemplateBindLine(node.bind),
    node.params.length > 0 ? `- Params: ${node.params.join(", ")}` : undefined,
    ...node.body.map(renderStructuredNode).filter((block) => block.length > 0)
  ]);

const renderUseNode = (node: DocxNodeByType<"use">): string => {
  const values = Object.entries(node.values).map(([key, value]) => `${key}: ${value}`);
  return [
    `### Use Template \`${node.template}\``,
    ...(values.length > 0 ? values.map((value) => `- ${value}`) : ["- (no overrides)"])
  ].join("\n");
};

const renderStructuredNode = (node: DocxNode): string => {
  switch (node.type) {
    case "markdown":
      return renderMarkdownNode(node.value);
    case "reaction":
      return renderReactionNode(node);
    case "molecule":
      return renderMoleculeNode(node);
    case "result":
      return renderResultNode(node);
    case "analysis":
      return renderAnalysisNode(node);
    case "procedure":
      return renderProcedureNode(node);
    case "observation":
      return renderObservationNode(node);
    case "sample":
      return renderSampleNode(node);
    case "template":
      return renderTemplateNode(node);
    case "use":
      return renderUseNode(node);
    default:
      return "";
  }
};

export const renderDocxMarkdown = (document: ChemdDocument): string => {
  const title = normalizeWhitespace(document.meta.title || document.meta.id);
  const sections = document.children
    .map(renderStructuredNode)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);

  return [
    renderMetaFrontmatter(document.meta),
    "",
    `# ${title || "Untitled experiment"}`,
    "",
    ...sections.flatMap((section) => [section, ""])
  ]
    .join("\n")
    .trimEnd();
};

export const createDocxBridgePayload = (
  document: ChemdDocument,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload
): DocxBridgePayload => ({
  version: "v0.1",
  document: {
    meta: document.meta,
    children: document.children
  },
  diagnostics: document.diagnostics,
  render: {
    profileId: options.profileId,
    resolvedOptions: options,
    ...(adapterPayload ? { adapter: adapterPayload } : {})
  },
  exportHints: {
    format: "docx-bridge",
    pipeline: "html-or-markdown-to-docx",
    recommendedTool: "pandoc"
  }
});

export const renderDocxBridge = (
  document: ChemdDocument,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload
): string => JSON.stringify(createDocxBridgePayload(document, options, adapterPayload), null, 2);

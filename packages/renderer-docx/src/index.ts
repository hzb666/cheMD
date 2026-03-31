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

const renderMarkdownNode = (value: string): string => value.trim();

const renderStructuredNode = (node: ChemdDocument["children"][number]): string => {
  if (node.type === "markdown") {
    return renderMarkdownNode(node.value);
  }

  if (node.type === "reaction") {
    const title = node.id ? `### Reaction \`${node.id}\`` : "### Reaction";
    const lines = [
      title,
      node.name ? `- Name: ${node.name}` : undefined,
      node.reactants && node.reactants.length > 0 ? `- Reactants: ${node.reactants.join(" + ")}` : undefined,
      node.products && node.products.length > 0 ? `- Products: ${node.products.join(" + ")}` : undefined,
      node.temperature ? `- Temperature: ${node.temperature}` : undefined,
      node.time ? `- Time: ${node.time}` : undefined,
      node.solvent ? `- Solvent: ${node.solvent}` : undefined,
      node.catalyst ? `- Catalyst: ${node.catalyst}` : undefined,
      node.yield ? `- Yield: ${node.yield}` : undefined,
      node.caption ? `- Caption: ${node.caption}` : undefined
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }

  if (node.type === "molecule") {
    const title = node.id ? `### Molecule \`${node.id}\`` : "### Molecule";
    const lines = [
      title,
      node.name ? `- Name: ${node.name}` : undefined,
      node.smiles ? `- SMILES: ${node.smiles}` : undefined,
      node.formula ? `- Formula: ${node.formula}` : undefined,
      node.amount ? `- Amount: ${node.amount}` : undefined,
      node.role ? `- Role: ${node.role}` : undefined
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }

  if (node.type === "result") {
    const title = node.id ? `### Result \`${node.id}\`` : "### Result";
    const lines = [
      title,
      node.status ? `- Status: ${node.status}` : undefined,
      node.yield ? `- Yield: ${node.yield}` : undefined,
      node.conversion ? `- Conversion: ${node.conversion}` : undefined,
      node.selectivity ? `- Selectivity: ${node.selectivity}` : undefined,
      node.isolated_mass ? `- Isolated mass: ${node.isolated_mass}` : undefined
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }

  if (node.type === "analysis") {
    const title = node.id ? `### Analysis \`${node.id}\`` : "### Analysis";
    const lines = [
      title,
      node.type_name ? `- Type: ${node.type_name}` : undefined,
      node.instrument ? `- Instrument: ${node.instrument}` : undefined,
      node.solvent ? `- Solvent: ${node.solvent}` : undefined,
      node.frequency ? `- Frequency: ${node.frequency}` : undefined,
      node.data ? `- Data: ${node.data}` : undefined
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }

  if (node.type === "sample") {
    const title = node.id ? `### Sample \`${node.id}\`` : "### Sample";
    const lines = [
      title,
      node.name ? `- Name: ${node.name}` : undefined,
      node.sample_id ? `- Sample ID: ${node.sample_id}` : undefined,
      node.batch ? `- Batch: ${node.batch}` : undefined,
      node.purity ? `- Purity: ${node.purity}` : undefined,
      node.supplier ? `- Supplier: ${node.supplier}` : undefined
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }

  if (node.type === "template") {
    const lines = [
      `### Template \`${node.name}\``,
      Object.keys(node.bind).length > 0 ? `- Bind: ${Object.entries(node.bind).map(([key, value]) => `${key}=${value}`).join(" | ")}` : undefined,
      node.params.length > 0 ? `- Params: ${node.params.join(", ")}` : undefined,
      ...(node.body.map(renderStructuredNode).filter((block) => block.length > 0))
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }

  if (node.type === "use") {
    const values = Object.entries(node.values).map(([key, value]) => `${key}: ${value}`);
    return [
      `### Use Template \`${node.template}\``,
      ...(values.length > 0 ? values.map((value) => `- ${value}`) : ["- (no overrides)"])
    ].join("\n");
  }

  return "";
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

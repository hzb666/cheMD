import type { ChemdDocument } from "@chemd/core";
import type { RenderAdapterPayload, RenderOptions } from "@chemd/render-profile";
import {
  buildProgramRenderDocument,
  formatProgramRenderValue,
  isChemdProgramDocument,
  type ProgramRenderDocument,
  type ProgramRenderSection,
  type ProgramRenderValue,
  type RenderDocumentationBlock
} from "@chemd/semantic-rendering";

export interface DocxBridgePayload {
  version: "v1.0";
  program: {
    moduleName: string;
    meta: ProgramRenderDocument["meta"];
    documentation: RenderDocumentationBlock[];
    declarations: ProgramRenderSection[];
    diagnostics: ProgramRenderDocument["diagnostics"];
  };
  render: {
    profileId: string;
    resolvedOptions: RenderOptions;
    adapter?: RenderAdapterPayload;
    markdown: string;
  };
  semantic?: {
    typedGraph: unknown;
  };
  exportHints: {
    format: "docx-bridge";
    pipeline: "program-render-markdown-to-docx";
    recommendedTool: "pandoc";
  };
}

export interface DocxBridgeOptions {
  typedGraph?: unknown;
}

type DocxInput = ChemdDocument | ProgramRenderDocument | Parameters<typeof buildProgramRenderDocument>[0];

const normalizeWhitespace = (value: string): string => value.replaceAll(/\s+/g, " ").trim();

const isSimpleYamlString = (value: string): boolean =>
  value.length > 0 && /^[a-zA-Z0-9 _./:-]+$/.test(value) && !value.startsWith("-") && !value.includes(": ");

const isProgramRenderDocument = (value: unknown): value is ProgramRenderDocument =>
  typeof value === "object"
  && value !== null
  && (value as { schema_version?: unknown }).schema_version === "chemd-program-render/v1";

const toProgramRenderDocument = (
  document: DocxInput,
  options: DocxBridgeOptions = {}
): ProgramRenderDocument => {
  if (isProgramRenderDocument(document)) return document;
  if (isChemdProgramDocument(document)) {
    return buildProgramRenderDocument(document, { typedGraph: options.typedGraph });
  }
  return buildLegacyRenderDocument(document, options);
};

const buildLegacyRenderDocument = (
  document: ChemdDocument,
  options: DocxBridgeOptions
): ProgramRenderDocument => ({
  schema_version: "chemd-program-render/v1",
  sourceLanguage: "chemd/program-v1",
  moduleName: String(document.meta.id || "legacy_document"),
  meta: {
    id: String(document.meta.id || "legacy-document"),
    title: String(document.meta.title || document.meta.id || "Untitled experiment"),
    date: String(document.meta.date || ""),
    fields: {},
    docs: []
  },
  imports: [],
  sections: [],
  diagnostics: document.diagnostics,
  semantic: {
    typedGraph: typeof options.typedGraph === "object" && options.typedGraph !== null
      ? options.typedGraph as ProgramRenderDocument["semantic"]["typedGraph"]
      : { documentId: String(document.meta.id || ""), nodes: [], quantities: [], diagnostics: [] }
  }
});

const toYamlScalar = (value: unknown): string => {
  if (typeof value === "string") return isSimpleYamlString(value) ? value : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
};

const renderMetaFrontmatter = (document: ProgramRenderDocument): string => {
  const entries = [
    ["id", document.meta.id],
    ["title", document.meta.title],
    ["date", document.meta.date],
    ["module", document.moduleName],
    ...Object.entries(document.meta.fields).map(([key, value]) => [key, formatProgramRenderValue(value)])
  ];
  return ["---", ...entries.map(([key, value]) => `${key}: ${toYamlScalar(value)}`), "---"].join("\n");
};

export const renderDocxMarkdown = (
  document: DocxInput,
  options: DocxBridgeOptions = {}
): string => {
  const renderDocument = toProgramRenderDocument(document, options);
  const title = normalizeWhitespace(renderDocument.meta.title || renderDocument.meta.id);
  return [
    renderMetaFrontmatter(renderDocument),
    "",
    `# ${title || "Untitled experiment"}`,
    "",
    ...renderMarkdownSections(renderDocument),
    ...renderDiagnosticsAppendix(renderDocument)
  ].join("\n").trimEnd();
};

const renderMarkdownSections = (document: ProgramRenderDocument): string[] =>
  document.sections.flatMap((section) => {
    switch (section.kind) {
      case "documentation": return renderDocumentationSection(section.title, section.docs);
      case "declaration": return renderDeclarationSection(section);
      case "procedure": return renderProcedureSection(section);
      case "agent_run": return renderAgentRunSection(section);
      case "trace": return renderTraceSection(section);
    }
  });

const renderDocumentationSection = (
  title: string,
  docs: RenderDocumentationBlock[]
): string[] =>
  docs.length ? [`## ${title}`, "", ...docs.flatMap((doc) => [doc.markdown, ""])] : [];

const renderDeclarationSection = (
  section: Extract<ProgramRenderSection, { kind: "declaration" }>
): string[] => [
  `## ${pluralizeKind(section.declarationKind)}`,
  "",
  `### ${formatKind(section.declarationKind)} \`${section.id}\``,
  ...section.docs.flatMap((doc) => ["", doc.markdown]),
  ...renderFieldLines(section.fields),
  ""
];

const renderProcedureSection = (
  section: Extract<ProgramRenderSection, { kind: "procedure" }>
): string[] => [
  "## Procedure",
  "",
  `### Procedure \`${section.id}\``,
  ...section.docs.flatMap((doc) => ["", doc.markdown]),
  ...section.statements.flatMap(renderProcedureStatement),
  ""
];

const renderProcedureStatement = (
  statement: Extract<ProgramRenderSection, { kind: "procedure" }>["statements"][number]
): string[] => {
  if (statement.kind === "doc") return [statement.doc.markdown];
  if (statement.kind === "control") {
    return [`- ${formatKind(statement.controlKind)}${statement.id ? ` \`${statement.id}\`` : ""}`, ...statement.children.flatMap(renderProcedureStatement)];
  }
  const details = [
    Object.entries(statement.args).map(([key, value]) => `${key}=${formatProgramRenderValue(value)}`).join(" | "),
    statement.inputs.length ? `inputs=${statement.inputs.map((input) => input.raw).join(", ")}` : "",
    statement.outputs.length ? `outputs=${statement.outputs.map((output) => output.raw).join(", ")}` : "",
    statement.dependsOn.length ? `depends_on=${statement.dependsOn.join(", ")}` : ""
  ].filter(Boolean).join(" | ");
  return [`- Step ${statement.id}: ${statement.family}${details ? ` | ${details}` : ""}`];
};

const renderAgentRunSection = (
  section: Extract<ProgramRenderSection, { kind: "agent_run" }>
): string[] => [
  "## Agent Audit",
  "",
  `### Agent Run \`${section.id}\``,
  `- Status: ${section.status}`,
  `- Goal: ${section.goal}`,
  ...section.docs.flatMap((doc) => ["", doc.markdown]),
  ...section.statementDocs.flatMap((doc) => ["", doc.markdown]),
  ...section.auditTimeline.map((event) =>
    `- ${formatKind(event.event)}${event.at ? ` at ${event.at}` : ""}${event.summary ? `: ${event.summary}` : ""}`
  ),
  ""
];

const renderTraceSection = (
  section: Extract<ProgramRenderSection, { kind: "trace" }>
): string[] => [
  "## Trace",
  "",
  `### Trace \`${section.id}\``,
  ...section.docs.flatMap((doc) => ["", doc.markdown]),
  ...renderFieldLines(section.fields),
  ""
];

const renderFieldLines = (fields: Record<string, ProgramRenderValue>): string[] =>
  Object.entries(fields).map(([key, value]) => `- ${formatKind(key)}: ${formatProgramRenderValue(value)}`);

const renderDiagnosticsAppendix = (document: ProgramRenderDocument): string[] =>
  document.diagnostics.length
    ? [
        "## Diagnostics",
        "",
        ...document.diagnostics.map((diagnostic) =>
          `- ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`
        )
      ]
    : [];

export const createDocxBridgePayload = (
  document: DocxInput,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload,
  bridgeOptions: DocxBridgeOptions = {}
): DocxBridgePayload => {
  const renderDocument = toProgramRenderDocument(document, bridgeOptions);
  return {
    version: "v1.0",
    program: {
      moduleName: renderDocument.moduleName,
      meta: renderDocument.meta,
      documentation: collectDocumentation(renderDocument),
      declarations: renderDocument.sections.filter((section) => section.kind !== "documentation"),
      diagnostics: renderDocument.diagnostics
    },
    render: {
      profileId: options.profileId,
      resolvedOptions: options,
      ...(adapterPayload ? { adapter: adapterPayload } : {}),
      markdown: renderDocxMarkdown(renderDocument)
    },
    semantic: { typedGraph: renderDocument.semantic.typedGraph },
    exportHints: {
      format: "docx-bridge",
      pipeline: "program-render-markdown-to-docx",
      recommendedTool: "pandoc"
    }
  };
};

export const renderDocxBridge = (
  document: DocxInput,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload,
  bridgeOptions: DocxBridgeOptions = {}
): string => JSON.stringify(createDocxBridgePayload(document, options, adapterPayload, bridgeOptions), null, 2);

const collectDocumentation = (document: ProgramRenderDocument): RenderDocumentationBlock[] =>
  document.sections.flatMap((section) =>
    section.kind === "documentation" || "docs" in section ? section.docs : []
  );

const formatKind = (value: string): string =>
  value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

const pluralizeKind = (value: string): string => {
  const label = formatKind(value);
  return label.endsWith("s") ? label : `${label}s`;
};

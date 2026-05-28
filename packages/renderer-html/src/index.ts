import type { ChemdDocument } from "@chemd/core";
import type { RenderOptions } from "@chemd/render-profile";
import {
  buildProgramRenderDocument,
  formatProgramRenderValue,
  isChemdProgramDocument,
  type ProgramRenderDiagnostic,
  type ProgramRenderDocument,
  type ProgramRenderProcedureStatement,
  type ProgramRenderSection,
  type ProgramRenderValue,
  type RenderDocumentationBlock
} from "@chemd/semantic-rendering";
import { renderMarkdownNode } from "./markdown-render";
import { escapeHtml } from "./shared";
export { renderRenderableHtml, type RenderRenderableHtmlOptions } from "./renderable-html";
export {
  buildPreviewThemeSyncScriptTag,
  PREVIEW_DOCUMENT_STYLE,
  PREVIEW_THEME_SYNC_ACK_MESSAGE_TYPE,
  PREVIEW_THEME_SYNC_MESSAGE_TYPE,
  toSandboxedPreviewDocument,
  type PreviewDocumentOptions,
  type PreviewTheme
} from "./preview-document";

export interface RenderHtmlSemanticOptions {
  typedGraph?: unknown;
}

type RenderHtmlInput = ChemdDocument | ProgramRenderDocument | Parameters<typeof buildProgramRenderDocument>[0];

export const renderHtml = (
  document: RenderHtmlInput,
  options: RenderOptions,
  semanticOptions: RenderHtmlSemanticOptions = {}
): string => {
  const renderDocument = toProgramRenderDocument(document, semanticOptions);
  return renderProgramHtml(renderDocument, options);
};

const isProgramRenderDocument = (value: unknown): value is ProgramRenderDocument =>
  typeof value === "object"
  && value !== null
  && "schema_version" in value
  && (value as { schema_version?: unknown }).schema_version === "chemd-program-render/v1";

const toProgramRenderDocument = (
  document: RenderHtmlInput,
  semanticOptions: RenderHtmlSemanticOptions
): ProgramRenderDocument => {
  if (isProgramRenderDocument(document)) return document;
  if (isChemdProgramDocument(document)) {
    return buildProgramRenderDocument(document, { typedGraph: semanticOptions.typedGraph });
  }
  return buildLegacyRenderDocument(document);
};

const buildLegacyRenderDocument = (document: ChemdDocument): ProgramRenderDocument => ({
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
    typedGraph: {
      documentId: document.meta.id,
      nodes: [],
      quantities: [],
      diagnostics: []
    }
  }
});

const renderProgramHtml = (
  document: ProgramRenderDocument,
  options: RenderOptions
): string => {
  const sections = document.sections.map(renderProgramSection).join("\n");
  return [
    `<article class="chemd-program" data-profile="${escapeHtml(options.profileId)}" data-module="${escapeHtml(document.moduleName)}">`,
    renderProgramHeader(document),
    renderProgramMeta(document),
    `<section class="chemd-program-sections">${sections}</section>`,
    renderProgramDiagnostics(document.diagnostics),
    `</article>`
  ].join("");
};

const renderProgramHeader = (document: ProgramRenderDocument): string =>
  [
    `<header class="chemd-program-header">`,
    `<p class="chemd-program-module">module ${escapeHtml(document.moduleName)}</p>`,
    `<h1 class="chemd-program-title">${escapeHtml(document.meta.title || document.meta.id || "Untitled experiment")}</h1>`,
    `</header>`
  ].join("");

const renderProgramMeta = (document: ProgramRenderDocument): string => {
  const rows = [
    ["ID", document.meta.id],
    ["Date", document.meta.date],
    ["Source", document.sourceLanguage],
    ...Object.entries(document.meta.fields).map(([key, value]) => [formatLabel(key), formatProgramRenderValue(value)])
  ].filter(([, value]) => value);
  return `<section class="chemd-program-meta"><h2>Meta</h2><dl>${rows
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("")}</dl></section>`;
};

const renderProgramSection = (section: ProgramRenderSection): string => {
  switch (section.kind) {
    case "documentation": return renderDocumentationSection(section);
    case "declaration": return renderDeclarationSection(section);
    case "procedure": return renderProcedureSection(section);
    case "agent_run": return renderAgentRunSection(section);
    case "trace": return renderTraceSection(section);
  }
};

const renderDocumentationSection = (
  section: Extract<ProgramRenderSection, { kind: "documentation" }>
): string =>
  `<section class="chemd-program-docs" data-doc-section="${escapeHtml(section.id)}"><h2>${escapeHtml(section.title)}</h2>${section.docs.map(renderDocBlock).join("")}</section>`;

const renderDeclarationSection = (
  section: Extract<ProgramRenderSection, { kind: "declaration" }>
): string =>
  [
    `<section class="chemd-program-card chemd-program-card--${escapeHtml(section.declarationKind)}" data-declaration-id="${escapeHtml(section.id)}">`,
    ...section.docs.map(renderDocBlock),
    `<header><p class="chemd-program-kind">${escapeHtml(formatLabel(section.declarationKind))}</p><h2>${escapeHtml(section.id)}</h2></header>`,
    renderFieldList(section.fields, section.fieldDocs),
    `</section>`
  ].join("");

const renderTraceSection = (
  section: Extract<ProgramRenderSection, { kind: "trace" }>
): string =>
  [
    `<section class="chemd-program-trace" data-declaration-id="${escapeHtml(section.id)}">`,
    `<h2>Trace ${escapeHtml(section.id)}</h2>`,
    ...section.docs.map(renderDocBlock),
    renderFieldList(section.fields),
    `</section>`
  ].join("");

const renderProcedureSection = (
  section: Extract<ProgramRenderSection, { kind: "procedure" }>
): string =>
  [
    `<section class="chemd-program-procedure" data-procedure-id="${escapeHtml(section.id)}">`,
    `<h2>Procedure ${escapeHtml(section.id)}</h2>`,
    section.target ? `<p class="chemd-program-related">For ${escapeHtml(section.target.raw)}</p>` : "",
    ...section.docs.map(renderDocBlock),
    `<ol class="chemd-program-procedure-steps">${section.statements.map(renderProcedureStatement).join("")}</ol>`,
    `</section>`
  ].join("");

const renderProcedureStatement = (statement: ProgramRenderProcedureStatement): string => {
  if (statement.kind === "doc") return `<li class="chemd-program-procedure-doc">${renderDocBlock(statement.doc)}</li>`;
  if (statement.kind === "control") {
    return `<li class="chemd-program-control"><strong>${escapeHtml(formatLabel(statement.controlKind))}</strong><ol>${statement.children.map(renderProcedureStatement).join("")}</ol></li>`;
  }
  const details = renderFieldList(statement.args);
  const flow = [
    statement.inputs.length ? `Inputs: ${statement.inputs.map((item) => item.raw).join(", ")}` : "",
    statement.outputs.length ? `Outputs: ${statement.outputs.map((item) => item.raw).join(", ")}` : "",
    statement.dependsOn.length ? `After: ${statement.dependsOn.join(", ")}` : ""
  ].filter(Boolean).map((item) => `<p>${escapeHtml(item)}</p>`).join("");
  return `<li class="chemd-program-step" data-step-id="${escapeHtml(statement.id)}"><h3>${escapeHtml(statement.family)}</h3>${statement.docs.map(renderDocBlock).join("")}${details}${flow}</li>`;
};

const renderAgentRunSection = (
  section: Extract<ProgramRenderSection, { kind: "agent_run" }>
): string =>
  [
    `<section class="chemd-program-agent" data-agent-run-id="${escapeHtml(section.id)}">`,
    `<h2>Agent Audit ${escapeHtml(section.id)}</h2>`,
    `<p><strong>Status:</strong> ${escapeHtml(section.status)}</p>`,
    `<p>${escapeHtml(section.goal)}</p>`,
    ...section.docs.map(renderDocBlock),
    section.statementDocs.length
      ? `<div class="chemd-program-agent-docs">${section.statementDocs.map(renderDocBlock).join("")}</div>`
      : "",
    `<ol class="chemd-program-agent-timeline">${section.auditTimeline
      .map((event) => `<li data-event="${escapeHtml(event.event)}"><strong>${escapeHtml(formatLabel(event.event))}</strong>${event.at ? ` <time>${escapeHtml(event.at)}</time>` : ""}${event.summary ? `<p>${escapeHtml(event.summary)}</p>` : ""}</li>`)
      .join("")}</ol>`,
    `</section>`
  ].join("");

const renderProgramDiagnostics = (diagnostics: ProgramRenderDiagnostic[]): string =>
  diagnostics.length
    ? `<section class="chemd-program-diagnostics"><h2>Diagnostics</h2><ul>${diagnostics
        .map((diagnostic) => `<li data-severity="${escapeHtml(diagnostic.severity)}">${escapeHtml(diagnostic.code)}: ${escapeHtml(diagnostic.message)}</li>`)
        .join("")}</ul></section>`
    : "";

const renderFieldList = (
  fields: Record<string, ProgramRenderValue>,
  fieldDocs: Record<string, RenderDocumentationBlock[]> = {}
): string => {
  const rows = Object.entries(fields).map(([key, value]) => {
    const docs = fieldDocs[key]?.map(renderDocBlock).join("") ?? "";
    return `<dt>${escapeHtml(formatLabel(key))}</dt><dd>${docs}${escapeHtml(formatProgramRenderValue(value))}</dd>`;
  });
  return rows.length ? `<dl class="chemd-program-fields">${rows.join("")}</dl>` : "";
};

const renderDocBlock = (doc: { id: string; markdown: string }): string => {
  const markdownNode = {
    type: "markdown" as const,
    value: doc.markdown,
    references: [],
    inlineChem: [],
    inlineCode: [],
    links: []
  };
  return `<div class="chemd-program-doc" data-doc-id="${escapeHtml(doc.id)}">${renderMarkdownNode(markdownNode)}</div>`;
};

const formatLabel = (value: string): string =>
  value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

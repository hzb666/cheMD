import type { ChemdDocument } from "@chemd/core";
import type { RenderOptions } from "@chemd/render-profile";
import { renderNode, type HtmlTypedSemanticNode } from "./block-render";
import { escapeHtml, normalizeWhitespace } from "./shared";
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
  typedGraph?: {
    nodes: HtmlTypedSemanticNode[];
  };
}

const readDocumentMetaValue = (document: ChemdDocument, key: string): string | undefined => {
  const value = document.meta[key];
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    return normalized ? normalized : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
};

export const renderHtml = (
  document: ChemdDocument,
  options: RenderOptions,
  semanticOptions: RenderHtmlSemanticOptions = {}
): string => {
  const title = readDocumentMetaValue(document, "title") ?? "Untitled Document";
  const id = readDocumentMetaValue(document, "id");
  const author = readDocumentMetaValue(document, "author");
  const date = readDocumentMetaValue(document, "date");
  const time = readDocumentMetaValue(document, "time");
  const headerMetaItems = [
    id ? ["ID", id] : undefined,
    author ? ["Author", author] : undefined,
    date ? ["Date", date] : undefined,
    time ? ["Time", time] : undefined
  ].filter((item): item is [string, string] => Boolean(item));
  const typedNodes = new Map(
    semanticOptions.typedGraph?.nodes.map((node) => [node.nodeId, node]) ?? []
  );
  const body = document.children
    .map((child, index) =>
      renderNode(child, {
        suppressLeadingMarkdownHeadingText: index === 0 ? title : undefined,
        typedNodes
      })
    )
    .join("\n");

  const diagnostics = document.diagnostics.length
    ? `<ul class="diagnostics">${document.diagnostics
        .map(
          (diagnostic) =>
            `<li data-severity="${diagnostic.severity}">${escapeHtml(diagnostic.code)}: ${escapeHtml(diagnostic.message)}</li>`
        )
        .join("")}</ul>`
    : "";
  const header = [
    `<header class="chemd-document-header">`,
    `<h1 class="chemd-document-title">${escapeHtml(title)}</h1>`,
    headerMetaItems.length
      ? `<p class="chemd-document-meta">${headerMetaItems
          .map(
            ([label, value]) =>
              `<span class="chemd-document-meta-item"><span class="chemd-document-meta-label">${escapeHtml(label)}:</span> <span class="chemd-document-meta-value">${escapeHtml(value)}</span></span>`
          )
          .join("")}</p>`
      : "",
    `</header>`
  ].join("");

  return [
    `<article class="chemd-document" data-profile="${escapeHtml(options.profileId)}">`,
    header,
    `<section class="chemd-body">${body}</section>`,
    diagnostics,
    `</article>`
  ].join("");
};

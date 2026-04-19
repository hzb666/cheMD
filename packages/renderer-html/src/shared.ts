import { buildChemRenderLoadingSvg } from "@chemd/core";

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const applyMarkdownInlineStyles = (escapedValue: string): string =>
  escapedValue
    .replace(/~~([^\r\n~]+?)~~/g, "<del>$1</del>")
    .replace(/\*\*([^\r\n*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^\r\n*]+?)\*/g, "<em>$1</em>");

export const applyMarkdownInlineStylesInHtmlText = (html: string): string =>
  html
    .split(/(<[^>]+>)/g)
    .map((segment) => (segment.startsWith("<") ? segment : applyMarkdownInlineStyles(segment)))
    .join("");

export const stringifyValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.join(" | ");
  }

  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

export const stringifyAttributeValue = (value: string | undefined): string =>
  value ? escapeHtml(value) : "";

export const stringifyJsonAttributeValue = (value: unknown): string =>
  escapeHtml(JSON.stringify(value));

export const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

export const renderBlockTitle = (label: string, id?: string): string => {
  const blockId = id ? ` <span class="chemd-block-id">${escapeHtml(id)}</span>` : "";
  return `<h2>${escapeHtml(label)}${blockId}</h2>`;
};

const hasControlCharacters = (value: string): boolean =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

export const sanitizeHref = (href: string): string | undefined => {
  const trimmed = href.trim();

  if (!trimmed || hasControlCharacters(trimmed)) {
    return undefined;
  }

  if (
    trimmed.startsWith("#")
    || trimmed.startsWith("/")
    || trimmed.startsWith("./")
    || trimmed.startsWith("../")
  ) {
    return trimmed;
  }

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

  if (!schemeMatch) {
    return trimmed;
  }

  const scheme = schemeMatch[1].toLowerCase();

  if (["http", "https", "mailto"].includes(scheme)) {
    return trimmed;
  }

  return undefined;
};

export const renderFieldList = (fields: Array<[string, unknown]>): string => {
  const items = fields
    .filter(([, value]) => value !== undefined && value !== null && stringifyValue(value) !== "")
    .map(
      ([label, value]) =>
        `<div class="chemd-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(stringifyValue(value))}</dd></div>`
    )
    .join("");

  return `<dl class="chemd-fields">${items}</dl>`;
};

export const renderLoadingGraphic = (kind: "molecule" | "reaction"): string => {
  // preview hydration 依赖这些 data-* 标记识别占位图并替换为真实 SVG。
  return `<div class="chemd-graphic" data-chem-render-state="loading" data-chem-kind="${kind}">${buildChemRenderLoadingSvg(kind)}</div>`;
};

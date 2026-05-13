import type {
  ChemdRenderDirectiveV1,
  ChemdRenderableNodeTreeV1,
  ChemdRenderableNodeV1,
  ChemdSourceRefV1
} from "@chemd/renderer-json";
import { escapeHtml } from "./shared";

export interface RenderRenderableHtmlOptions {
  className?: string;
}

type RenderableNodeLike = Omit<ChemdRenderableNodeV1, "directive"> & {
  directive?: ChemdRenderDirectiveV1;
};

export const renderRenderableHtml = (
  tree: ChemdRenderableNodeTreeV1,
  options: RenderRenderableHtmlOptions = {}
): string => {
  const className = ["chemd-renderable-tree", options.className].filter(Boolean).join(" ");

  return `<div class="${escapeHtml(className)}" data-chemd-renderable-schema="${escapeHtml(tree.schemaVersion)}">${renderNode(tree.root)}</div>`;
};

const renderNode = (node: RenderableNodeLike): string => {
  const directive = node.directive;
  const children = renderChildren(node.children);
  const content = directive ? renderDirectiveContent(node, directive, children) : renderFallbackContent(node, children);

  return `<section class="${nodeClassName(node)}"${nodeAttributes(node, directive)}>${content}</section>`;
};

const renderChildren = (children: ChemdRenderableNodeV1[] | undefined): string =>
  children?.length
    ? `<div class="chemd-renderable-children">${children.map((child) => renderNode(child)).join("")}</div>`
    : "";

const renderDirectiveContent = (
  node: RenderableNodeLike,
  directive: ChemdRenderDirectiveV1,
  children: string
): string => {
  switch (directive.kind) {
    case "document":
      return children;
    case "text":
      return `${renderLabel(node)}<div class="chemd-renderable-text">${escapeHtml(directive.text)}</div>${children}`;
    case "layout":
      return `${renderLabel(node)}${children}`;
    case "template":
      return `${renderLabel(node)}${children}`;
    case "hydrate":
      return `${renderHydrationPlaceholder(node, directive)}${children}`;
    case "placeholder":
      return `${renderPlaceholder(node, directive.text)}${children}`;
    case "semantic":
      return `${renderLabel(node)}${renderSummary(directive.payload)}${children}`;
  }
};

const renderFallbackContent = (node: RenderableNodeLike, children: string): string =>
  `${renderPlaceholder(node, "Renderable directive is not available")}${children}`;

const renderHydrationPlaceholder = (
  node: RenderableNodeLike,
  directive: Extract<ChemdRenderDirectiveV1, { kind: "hydrate" }>
): string =>
  `<div class="chemd-renderable-placeholder" data-chemd-hydration-target="${escapeHtml(directive.target)}" data-chemd-hydration-key="${escapeHtml(directive.hydration.key)}">${renderLabel(node)}<span>${escapeHtml(`${directive.target} preview is loading`)}</span></div>`;

const renderPlaceholder = (node: RenderableNodeLike, text: string): string =>
  `<div class="chemd-renderable-placeholder">${renderLabel(node)}<span>${escapeHtml(text)}</span></div>`;

const renderLabel = (node: RenderableNodeLike): string =>
  `<h2 class="chemd-renderable-label">${escapeHtml(node.label)}</h2>`;

const renderSummary = (payload: Record<string, unknown>): string => {
  const summary = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${summarizeValue(value)}`)
    .join("; ");

  return summary ? `<p class="chemd-renderable-summary">${escapeHtml(summary)}</p>` : "";
};

const summarizeValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((item) => summarizeValue(item)).join(", ");
  }

  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

const nodeClassName = (node: RenderableNodeLike): string =>
  `chemd-renderable-node chemd-renderable-node--${escapeHtml(node.kind)}`;

const nodeAttributes = (
  node: RenderableNodeLike,
  directive: ChemdRenderDirectiveV1 | undefined
): string => [
  attribute("data-chemd-node-id", node.nodeId),
  attribute("data-chemd-node-kind", node.kind),
  attribute("data-chemd-render-state", renderState(directive)),
  sourceRefAttribute(node.sourceRefs),
  directiveAttribute(directive)
].filter(Boolean).join("");

const directiveAttribute = (directive: ChemdRenderDirectiveV1 | undefined): string => {
  if (!directive) {
    return "";
  }

  if (directive.kind === "layout") {
    return attribute("data-chemd-layout-columns", String(directive.columns));
  }

  if (directive.kind === "template") {
    return [
      attribute("data-chemd-template-name", directive.template),
      attribute("data-chemd-template-params", JSON.stringify(directive.params))
    ].join("");
  }

  return "";
};

const sourceRefAttribute = (refs: ChemdSourceRefV1[] | undefined): string =>
  refs?.length ? attribute("data-chemd-source-refs", JSON.stringify(refs)) : "";

const attribute = (name: string, value: string): string =>
  ` ${name}="${escapeHtml(value)}"`;

const renderState = (directive: ChemdRenderDirectiveV1 | undefined): string => {
  if (!directive) {
    return "fallback";
  }

  if (directive.kind === "hydrate" || directive.kind === "placeholder") {
    return directive.hydration.status;
  }

  return "rendered";
};

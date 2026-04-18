import type {
  ChemdDocument,
  ChemdMeta,
  InlineChemToken,
  InlineCodeToken,
  MarkdownLinkToken,
  MarkdownNode,
  ReferenceToken,
  RenderSelection
} from "./ast";
import type { Diagnostic } from "./diagnostics";

export interface CreateDocumentOptions {
  children?: ChemdDocument["children"];
  diagnostics?: Diagnostic[];
  renderSelection?: RenderSelection;
  source?: string;
}

export const createReferenceToken = (
  input: Omit<ReferenceToken, "type">
): ReferenceToken => ({
  type: "reference",
  ...input
});

export const createInlineChemToken = (
  input: Omit<InlineChemToken, "type">
): InlineChemToken => ({
  type: "inline_chem",
  ...input
});

export const createInlineCodeToken = (
  input: Omit<InlineCodeToken, "type">
): InlineCodeToken => ({
  type: "inline_code",
  ...input
});

export const createMarkdownLinkToken = (
  input: Omit<MarkdownLinkToken, "type">
): MarkdownLinkToken => ({
  type: "markdown_link",
  ...input
});

export const createMarkdownNode = (
  value: string,
  references: ReferenceToken[] = [],
  inlineChem: InlineChemToken[] = [],
  inlineCode: InlineCodeToken[] = [],
  links: MarkdownLinkToken[] = []
): MarkdownNode => ({
  type: "markdown",
  value,
  references,
  inlineChem,
  inlineCode,
  links
});

export const createDocument = (
  meta: ChemdMeta,
  options: CreateDocumentOptions = {}
): ChemdDocument => ({
  type: "document",
  meta,
  children: options.children ?? [],
  diagnostics: options.diagnostics ?? [],
  source: options.source,
  renderSelection: options.renderSelection
});

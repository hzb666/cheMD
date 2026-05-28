import type {
  InlineChemToken,
  InlineCodeToken,
  MarkdownLinkToken,
  ReferenceToken,
} from "./ast";

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

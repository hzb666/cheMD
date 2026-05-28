import type {
  ChemdDocComment,
  ChemdDocCommentAttachment,
  Diagnostic,
  SourceSpan
} from "@chemd/core";

import { tokenizeInlineChem } from "../inline/tokenize-inline-chem";
import { tokenizeInlineCode } from "../inline/tokenize-inline-code";
import { tokenizeMarkdownLinks } from "../inline/tokenize-markdown-links";
import { tokenizeReferences } from "../inline/tokenize-references";
import { lexProgram } from "./lexer";
import type { ProgramToken } from "./tokens";
import { spanFromTokens, tokenSourceSpan } from "./tokens";

export interface ProgramDocCommentParseResult {
  docs: ChemdDocComment[];
  diagnostics: Diagnostic[];
}

export interface ProgramDocCommentParseOptions {
  attachment?: ChemdDocCommentAttachment;
  exportPolicy?: ChemdDocComment["exportPolicy"];
  idPrefix?: string;
}

interface DocCommentCursor {
  diagnostics: Diagnostic[];
  peek: (offset?: number) => ProgramToken | undefined;
  consume: () => ProgramToken | undefined;
}

export const parseProgramDocComments = (
  source: string,
  options: ProgramDocCommentParseOptions = {}
): ProgramDocCommentParseResult => {
  const lexed = lexProgram(source);
  const diagnostics = [...lexed.diagnostics];
  const docs = buildDocComments(lexed.tokens, diagnostics, options);
  return { docs, diagnostics };
};

export const collectLeadingDocComments = (
  cursor: DocCommentCursor,
  options: ProgramDocCommentParseOptions = {}
): ChemdDocComment[] => {
  const docs: ChemdDocComment[] = [];
  while (cursor.peek()?.kind === "doc_comment") {
    const group = consumeLeadingDocGroup(cursor);
    docs.push(createDocFromGroup(group, docs.length + 1, cursor.diagnostics, options));
  }
  return docs;
};

export const createProgramDocComment = (
  id: string,
  markdown: string,
  sourceSpan: SourceSpan,
  diagnostics: Diagnostic[],
  options: ProgramDocCommentParseOptions = {}
): ChemdDocComment => ({
  type: "doc_comment",
  id,
  markdown,
  attachment: options.attachment ?? { kind: "file" },
  references: tokenizeReferences(markdown),
  inlineChem: tokenizeInlineChem(markdown),
  inlineCode: tokenizeInlineCode(markdown),
  links: tokenizeMarkdownLinks(markdown, diagnostics),
  exportPolicy: options.exportPolicy ?? "render_rag",
  sourceSpan
});

const buildDocComments = (
  tokens: ProgramToken[],
  diagnostics: Diagnostic[],
  options: ProgramDocCommentParseOptions
): ChemdDocComment[] => {
  const docs: ChemdDocComment[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type !== "doc_comment") {
      index += 1;
      continue;
    }
    const group = collectDocGroup(tokens, index);
    docs.push(createDocFromGroup(group, docs.length + 1, diagnostics, options));
    index += group.length;
  }
  return docs;
};

const collectDocGroup = (tokens: ProgramToken[], startIndex: number): ProgramToken[] => {
  const first = tokens[startIndex];
  if (!tokenRaw(first).startsWith("///")) {
    return [first];
  }
  const group = [first];
  let index = startIndex + 1;
  while (isNextLineDoc(tokens[index - 1], tokens[index])) {
    group.push(tokens[index]);
    index += 1;
  }
  return group;
};

const createDocFromGroup = (
  group: ProgramToken[],
  ordinal: number,
  diagnostics: Diagnostic[],
  options: ProgramDocCommentParseOptions
): ChemdDocComment => {
  const idPrefix = options.idPrefix ?? "doc";
  const markdown = group.length === 1
    ? markdownFromDocToken(group[0])
    : group.map(lineDocMarkdown).join("\n");
  const sourceSpan = group.length === 1
    ? tokenSourceSpan(group[0])
    : spanFromTokens(group[0], group[group.length - 1]);
  return createProgramDocComment(
    `${idPrefix}_${ordinal}`,
    markdown,
    sourceSpan,
    diagnostics,
    options
  );
};

const isNextLineDoc = (
  previous: ProgramToken | undefined,
  token: ProgramToken | undefined
): token is ProgramToken =>
  Boolean(
      previous &&
      token &&
      token.kind === "doc_comment" &&
      tokenRaw(token).startsWith("///") &&
      token.span.startLine === (previous.span.endLine ?? 0) + 1
  );

const markdownFromDocToken = (token: ProgramToken): string => {
  if (tokenRaw(token).startsWith("///")) {
    return lineDocMarkdown(token);
  }
  return blockDocMarkdown(tokenRaw(token));
};

const lineDocMarkdown = (token: ProgramToken): string =>
  tokenRaw(token).replace(/^\/\/\/[ \t]?/, "");

const blockDocMarkdown = (raw: string): string =>
  raw
    .replace(/^\/\*md[ \t]?/, "")
    .replace(/\*\/$/, "")
    .replace(/^\r?\n/, "")
    .replace(/\r?\n$/, "");

const consumeLeadingDocGroup = (cursor: DocCommentCursor): ProgramToken[] => {
  const first = cursor.consume();
  if (!first) {
    return [];
  }
  if (!tokenRaw(first).startsWith("///")) {
    return [first];
  }
  const group = [first];
  while (isNextLineDoc(group[group.length - 1], cursor.peek())) {
    const token = cursor.consume();
    if (token) {
      group.push(token);
    }
  }
  return group;
};

const tokenRaw = (token: ProgramToken): string => token.raw ?? token.value;

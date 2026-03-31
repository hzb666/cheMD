import { type ChemdNode, type Diagnostic, type TemplateNode } from "@chemd/core";
import { BLOCK_START_PATTERN, KEY_VALUE_PATTERN } from "../shared/patterns";
import { createMarkdownFromText, parseKeyValueLines, parseStructuredBlock, parseTemplateBind } from "./parse-structured-block";

export interface ParseChildrenResult {
  children: ChemdNode[];
  nextIndex: number;
}

export const parseChildren = (
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex = 0,
  stopAtBlockEnd = false
): ParseChildrenResult => {
  const children: ChemdNode[] = [];
  const markdownBuffer: string[] = [];
  let index = startIndex;

  const flushMarkdown = () => {
    const value = markdownBuffer.join("\n").trim();

    if (value) {
      children.push(createMarkdownFromText(value, diagnostics));
    }

    markdownBuffer.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === ":::") {
      if (stopAtBlockEnd) {
        flushMarkdown();
        return { children, nextIndex: index + 1 };
      }

      markdownBuffer.push(line);
      index += 1;
      continue;
    }

    const blockMatch = line.match(BLOCK_START_PATTERN);

    if (!blockMatch) {
      markdownBuffer.push(line);
      index += 1;
      continue;
    }

    flushMarkdown();

    const [, blockType, headerArg] = blockMatch;
    index += 1;

    if (blockType === "template") {
      const templateName = headerArg?.trim() ?? "";
      const leadingFieldLines: string[] = [];

      while (index < lines.length && KEY_VALUE_PATTERN.test(lines[index])) {
        leadingFieldLines.push(lines[index]);
        index += 1;
      }

      const fields = parseKeyValueLines(blockType, leadingFieldLines, diagnostics);
      const bodyResult = parseChildren(lines, diagnostics, index, true);
      index = bodyResult.nextIndex;

      children.push({
        type: "template",
        name: templateName,
        bind: parseTemplateBind(fields.bind),
        params: Array.isArray(fields.params) ? fields.params : [],
        description: typeof fields.description === "string" ? fields.description : undefined,
        body: bodyResult.children.filter((child): child is TemplateNode["body"][number] => child.type !== "template")
      });
      continue;
    }

    const blockLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== ":::") {
      blockLines.push(lines[index]);
      index += 1;
    }

    if (index < lines.length && lines[index].trim() === ":::") {
      index += 1;
    }

    const node = parseStructuredBlock(blockType, headerArg, blockLines, diagnostics);

    if (node) {
      children.push(node);
    }
  }

  flushMarkdown();

  return { children, nextIndex: index };
};

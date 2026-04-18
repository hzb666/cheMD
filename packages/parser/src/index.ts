import { createDocument } from "@chemd/core";
import { parseBody } from "./body/parse-body";
import type { ParserOptions } from "./body/block-parsers/types";
import { parseFrontmatter } from "./frontmatter/parse-frontmatter";

export type ParseChemdOptions = ParserOptions;

export const parseChemd = (source: string, options: ParseChemdOptions = {}) => {
  const parsed = parseFrontmatter(source);
  const body = parseBody(parsed.body, options);

  return createDocument(parsed.meta, {
    children: body.children,
    diagnostics: [...parsed.diagnostics, ...body.diagnostics],
    source,
    renderSelection: parsed.renderSelection
  });
};

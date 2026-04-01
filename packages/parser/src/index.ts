import { createDocument } from "@chemd/core";
import { parseBody } from "./body/parse-body";
import { parseFrontmatter } from "./frontmatter/parse-frontmatter";

export const parseChemd = (source: string) => {
  const parsed = parseFrontmatter(source);
  const body = parseBody(parsed.body);

  return createDocument(parsed.meta, {
    children: body.children,
    diagnostics: [...parsed.diagnostics, ...body.diagnostics],
    source,
    renderSelection: parsed.renderSelection
  });
};

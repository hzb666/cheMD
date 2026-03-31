import { createDocument } from "@chemd/core";
import { parseFrontmatter } from "./frontmatter/parse-frontmatter";
import { parseBody } from "./body/parse-body";

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

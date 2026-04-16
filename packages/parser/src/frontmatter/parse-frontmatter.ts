import {
  type ChemdMeta,
  type Diagnostic,
  type RenderSelection
} from "@chemd/core";
import { LineCounter, isMap, parseDocument } from "yaml";
import { createFrontmatterDiagnostic } from "./frontmatter-diagnostics";
import {
  DEFAULT_META,
  FRONTMATTER_PATTERN
} from "./frontmatter-shared";
import {
  applyFrontmatterMap,
  appendMissingRequiredKeyDiagnostics,
  reportYamlDocumentErrors
} from "./frontmatter-root";
import { sanitizeFrontmatterLines } from "./frontmatter-sanitizer";

export const parseFrontmatter = (
  source: string
): { body: string; meta: ChemdMeta; renderSelection?: RenderSelection; diagnostics: Diagnostic[] } => {
  const match = source.match(FRONTMATTER_PATTERN);

  if (!match) {
    return { body: source, meta: DEFAULT_META, diagnostics: [] };
  }

  const frontmatterSource = match[1];
  const lines = frontmatterSource.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const meta: Record<string, unknown> = { ...DEFAULT_META };
  const seenKeys = new Set<string>();
  const sanitizedLines = sanitizeFrontmatterLines(lines, diagnostics);
  const sanitizedFrontmatterSource = sanitizedLines.join("\n");
  const lineCounter = new LineCounter();
  const yamlDoc = parseDocument(sanitizedFrontmatterSource, {
    lineCounter,
    uniqueKeys: false,
    strict: false
  });

  reportYamlDocumentErrors(yamlDoc.errors, lineCounter, lines, diagnostics);

  const root = yamlDoc.contents;
  if (root && !isMap(root)) {
    diagnostics.push(
      createFrontmatterDiagnostic({
        code: "E_INVALID_FRONTMATTER_VALUE",
        severity: "error",
        message: "Invalid frontmatter value: expected a top-level mapping object",
        lineIndex: 0,
        lineText: lines[0] ?? "",
        token: lines[0]?.trim() || undefined
      })
    );
  }

  const renderSelection = applyFrontmatterMap(root, {
    lines,
    sanitizedFrontmatterSource,
    lineCounter,
    diagnostics,
    meta,
    renderSelection: undefined,
    seenKeys
  });

  appendMissingRequiredKeyDiagnostics(lines, diagnostics, seenKeys);

  return {
    body: source.slice(match[0].length),
    meta: meta as ChemdMeta,
    renderSelection,
    diagnostics
  };
};

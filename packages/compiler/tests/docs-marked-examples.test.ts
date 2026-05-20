import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

interface MarkedExample {
  file: string;
  index: number;
  source: string;
}

const docsRoot = fileURLToPath(new URL("../../../apps/docs/content/docs", import.meta.url));
const VALIDATED_EXAMPLE_RE = /```(?:chemd|md)[^\n]*\bvalidate\b[^\n]*\n([\s\S]*?)```/g;

const collectMdxFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectMdxFiles(path);
    }

    return entry.isFile() && entry.name.endsWith(".mdx") ? [path] : [];
  });

const collectMarkedExamples = (): MarkedExample[] =>
  collectMdxFiles(docsRoot).flatMap((file) => {
    const content = readFileSync(file, "utf8");
    const examples: MarkedExample[] = [];
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = VALIDATED_EXAMPLE_RE.exec(content)) !== null) {
      examples.push({
        file: relative(docsRoot, file).replaceAll("\\", "/"),
        index,
        source: match[1].trim()
      });
      index += 1;
    }

    return examples;
  });

describe("marked Chemd examples in docs", () => {
  it("compile without diagnostics", () => {
    const examples = collectMarkedExamples();

    expect(examples.length).toBeGreaterThan(0);

    for (const example of examples) {
      const result = compileChemd(example.source);

      expect(result.diagnostics, `${example.file} example ${example.index}`).toEqual([]);
    }
  });
});

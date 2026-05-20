import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { getCanonicalBlockFields } from "@chemd/core";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const docsRoot = join(workspaceRoot, "apps", "docs", "content", "docs");

const readWorkspaceFile = (...segments: string[]): string =>
  readFileSync(join(workspaceRoot, ...segments), "utf8");

const readDocsFile = (lang: "en" | "zh", ...segments: string[]): string =>
  readFileSync(join(docsRoot, lang, ...segments), "utf8");

const collectFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(path);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });

const extractQuotedValues = (source: string): string[] =>
  Array.from(source.matchAll(/["']([^"']+)["']/g), (match) => match[1] ?? "");

const extractParserRegistryBlocks = (): string[] => {
  const source = readWorkspaceFile("packages", "parser", "src", "body", "block-parsers", "index.ts");
  const registry = source.match(/const\s+PARSERS\s*=\s*new\s+Map[\s\S]*?\(\s*\[([\s\S]*?)\]\s*\)/m);

  if (!registry) {
    throw new Error("Cannot find parser block registry");
  }

  return Array.from(registry[1]?.matchAll(/\[\s*["']([^"']+)["']\s*,/g) ?? [], (match) => match[1] ?? "");
};

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort();

const parserFieldCoverage = (): Record<string, string[]> => {
  return {
    chemd: getCanonicalBlockFields("chemd"),
    result: getCanonicalBlockFields("result"),
    analysis: getCanonicalBlockFields("analysis"),
    artifact: getCanonicalBlockFields("artifact"),
    sample: getCanonicalBlockFields("sample"),
    "condition-varies": getCanonicalBlockFields("condition-varies"),
    procedure: getCanonicalBlockFields("procedure"),
    trace: getCanonicalBlockFields("trace"),
    step: getCanonicalBlockFields("step"),
    observation: getCanonicalBlockFields("observation"),
    event: getCanonicalBlockFields("event"),
    template: getCanonicalBlockFields("template"),
    col: ["columns", "col:"]
  };
};

const diagnosticSourceDirectories = [
  join(workspaceRoot, "packages", "parser", "src"),
  join(workspaceRoot, "packages", "resolver", "src"),
  join(workspaceRoot, "packages", "typechecker", "src"),
  join(workspaceRoot, "packages", "compiler", "src"),
  join(workspaceRoot, "packages", "diagnostics", "src"),
  join(workspaceRoot, "packages", "runtime-lab", "src")
];

const extractDiagnosticCodesFromSource = (): string[] => {
  const diagnosticCodePattern = /^([EWI]\d{3}|[EW]_[A-Z0-9_]+)$/;
  const codes = diagnosticSourceDirectories.flatMap((directory) =>
    collectFiles(directory).flatMap((file) =>
      extractQuotedValues(readFileSync(file, "utf8")).filter((value) => diagnosticCodePattern.test(value))
    )
  );

  return uniqueSorted(codes);
};

describe("docs coverage", () => {
  it("keeps navigation metadata in sync with docs files", () => {
    for (const lang of ["en", "zh"] as const) {
      const langRoot = join(docsRoot, lang);
      const rootMeta = JSON.parse(readDocsFile(lang, "meta.json")) as { pages: string[] };
      const rootEntries = readdirSync(langRoot, { withFileTypes: true });

      for (const entry of rootEntries) {
        const pageName = entry.isFile() && entry.name.endsWith(".mdx")
          ? entry.name.replace(/\.mdx$/, "")
          : entry.isDirectory()
            ? entry.name
            : undefined;

        if (pageName) {
          expect(rootMeta.pages, `${lang}/meta.json should include ${pageName}`).toContain(pageName);
        }
      }

      for (const entry of rootEntries.filter((item) => item.isDirectory())) {
        const sectionMeta = JSON.parse(readDocsFile(lang, entry.name, "meta.json")) as { pages: string[] };
        const sectionRoot = join(langRoot, entry.name);
        const pageFiles = readdirSync(sectionRoot, { withFileTypes: true })
          .filter((item) => item.isFile() && item.name.endsWith(".mdx") && item.name !== "index.mdx")
          .map((item) => item.name.replace(/\.mdx$/, ""));

        for (const page of pageFiles) {
          expect(sectionMeta.pages, `${lang}/${entry.name}/meta.json should include ${page}`).toContain(page);
        }

        for (const page of sectionMeta.pages) {
          expect(pageFiles, `${lang}/${entry.name}/meta.json page ${page} should exist`).toContain(page);
        }
      }
    }
  });

  it("documents every parser-supported structured block page in both languages", () => {
    const expectedPages = uniqueSorted([...extractParserRegistryBlocks(), "template", "step", "event"]);

    for (const lang of ["en", "zh"] as const) {
      const meta = JSON.parse(readDocsFile(lang, "syntax-blocks", "meta.json")) as { pages: string[] };

      for (const page of expectedPages) {
        expect(meta.pages, `${lang} syntax-blocks meta should include ${page}`).toContain(page);
        expect(() => readDocsFile(lang, "syntax-blocks", `${page}.mdx`), `${lang} ${page}.mdx exists`).not.toThrow();
      }
    }
  });

  it("documents parser-accepted fields for every structured block page", () => {
    const coverage = parserFieldCoverage();

    for (const [page, fields] of Object.entries(coverage)) {
      for (const lang of ["en", "zh"] as const) {
        const content = readDocsFile(lang, "syntax-blocks", `${page}.mdx`);

        for (const field of uniqueSorted(fields)) {
          expect(content, `${lang}/syntax-blocks/${page}.mdx should mention ${field}`).toContain(field);
        }
      }
    }
  });

  it("documents source diagnostic codes in both diagnostic-code appendices", () => {
    const diagnosticCodes = extractDiagnosticCodesFromSource();

    for (const lang of ["en", "zh"] as const) {
      const content = readDocsFile(lang, "appendix", "diagnostic-codes.mdx");

      for (const code of diagnosticCodes) {
        expect(content, `${lang}/appendix/diagnostic-codes.mdx should mention ${code}`).toContain(code);
      }
    }
  });
});

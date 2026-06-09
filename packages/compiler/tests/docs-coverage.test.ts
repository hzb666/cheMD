import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const docsRoot = join(workspaceRoot, "apps", "docs", "content", "docs");

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

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort();

const diagnosticSourceDirectories = [
  join(workspaceRoot, "packages", "parser", "src"),
  join(workspaceRoot, "packages", "resolver", "src"),
  join(workspaceRoot, "packages", "typechecker", "src"),
  join(workspaceRoot, "packages", "compiler", "src"),
  join(workspaceRoot, "packages", "diagnostics", "src"),
  join(workspaceRoot, "packages", "runtime-lab", "src")
];

const extractDiagnosticCodesFromSource = (): string[] => {
  const diagnosticCodePattern = /^([EWI]\d{3}|[EW]_[A-Z0-9]+(?:_[A-Z0-9]+)*)$/;
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

  it("documents program-first language contract in both languages", () => {
    for (const lang of ["en", "zh"] as const) {
      const rootMeta = JSON.parse(readDocsFile(lang, "meta.json")) as { pages: string[] };
      const programMeta = JSON.parse(readDocsFile(lang, "program-v1", "meta.json")) as { pages: string[] };
      const content = ["index", ...programMeta.pages]
        .map((page) => readDocsFile(lang, "program-v1", `${page}.mdx`))
        .join("\n");

      expect(rootMeta.pages, `${lang}/meta.json should include program-v1`).toContain("program-v1");
      for (const page of ["language", "reference", "ast", "exports"]) {
        expect(programMeta.pages, `${lang}/program-v1/meta.json should include ${page}`).toContain(page);
      }

      for (const term of [
        "module",
        "meta",
        "molecule",
        "reaction",
        "result",
        "procedure",
        "agent run",
        "Procedure Controls",
        "Condition Expressions",
        "Step Families",
        "Procedure State Rules",
        "affectedModules",
        "chemd explain",
        "E_PROCEDURE_STATE_INVALID"
      ]) {
        expect(content, `${lang}/program-v1 should mention ${term}`).toContain(term);
      }
    }
  });

  it("documents exporter and graph output contracts", () => {
    const requiredTerms = [
      "compileChemd(source).html",
      "pnpm chemd export file.chemd --format json",
      "compileChemd(source).docxBridge",
      "chemd-lnf/v1.0",
      "ChemdTrainingExportV3",
      "chemd-training-export/v0.3",
      "source_layer",
      "semantic_layer",
      "learning_layer",
      "quality_layer",
      "molecules",
      "materials",
      "batches",
      "reactions",
      "results",
      "analyses",
      "samples",
      "artifacts",
      "condition_variations",
      "condition_variation_attempts",
      "documentation_blocks",
      "links",
      "lnf",
      "normalized_analysis",
      "normalized_tlc",
      "retrieval_chunks",
      "prediction_instances",
      "procedure_to_steps",
      "observation_to_events",
      "ChemdTrainingUnderstandingV1",
      "chemd-training-understanding/v0.1",
      "ChemdRagExportV1",
      "chemd-rag-export/v0.1",
      "ChemdTrainingTaskDatasetV1",
      "ChemdTrainingCampaignV1",
      "ChemdTrainingCampaignTaskDatasetV1",
      "ChemdTrainingAnnotationPatchV1",
      "knowledge_graph",
      "material_flow_graph",
      "step_dependencies",
      "reaction_routes",
      "ChemdTrainingGraphIndexV1",
      "chemd-training-graph-index/v0.1",
      "reaction_features",
      "reaction_clusters",
      "reaction_similarity_edges",
      "chemd-reaction-cluster-layout/v0.1",
      "ReactionIntelligenceJob",
      "ReactionIntelligenceArtifact",
      "ChemdReactionIntelligenceGraphIndex"
    ];

    for (const lang of ["en", "zh"] as const) {
      const rootMeta = JSON.parse(readDocsFile(lang, "meta.json")) as { pages: string[] };
      const exportsMeta = JSON.parse(readDocsFile(lang, "exports", "meta.json")) as { pages: string[] };
      const content = ["index", ...exportsMeta.pages]
        .map((page) => readDocsFile(lang, "exports", `${page}.mdx`))
        .join("\n");

      expect(rootMeta.pages, `${lang}/meta.json should include exports`).toContain("exports");
      for (const page of ["html", "json-semantic", "docx", "lnf", "training-rag", "graph-reaction-map"]) {
        expect(exportsMeta.pages, `${lang}/exports/meta.json should include ${page}`).toContain(page);
      }

      for (const term of requiredTerms) {
        expect(content, `${lang}/exports should mention ${term}`).toContain(term);
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

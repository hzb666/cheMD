import { describe, expect, it } from "vitest";
import type {
  ChemdLanguageCompileSuccess,
  ChemdSourceRange,
  EditorGraphRagCitationCandidate
} from "@chemd/language-service";
import type { WorkspaceIndexCompileFn } from "@chemd/workspace-index";

import type { WorkspaceFileEntry } from "../contracts";
import { buildWorkspaceRagResultsFromCitationCandidates } from "./rag-citation-gate";
import {
  buildWorkspaceIndexViewModel,
  getWorkspaceReferenceRowsForSymbol
} from "./workspace-index";

const file = (path: string): WorkspaceFileEntry => ({
  id: path,
  name: path.split("/").pop() ?? path,
  path,
  kind: "file",
  chemdKind: "document"
});

const range = (line: number): ChemdSourceRange => ({
  startLine: line,
  startColumn: 1,
  endLine: line,
  endColumn: 12
});

const compile: WorkspaceIndexCompileFn = (input): ChemdLanguageCompileSuccess => ({
  status: "ok",
  documentUri: input.documentUri,
  compiledAt: "2026-05-13T00:00:00.000Z",
  result: {} as ChemdLanguageCompileSuccess["result"],
  diagnostics: [],
  outline: [],
  symbols: input.documentUri.includes("route-b")
    ? [{ id: "rxn-b", label: "rxn-b", kind: "reaction", range: range(7) }]
    : [{ id: "rxn-a", label: "rxn-a", kind: "reaction", range: range(6) }]
});

const citationSource = `---
id: exp-rag-gate
title: RAG gate
date: 2026-05-13
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::chemd #rxn-a
kind: reaction
reactants: mol-a
products: product-a
:::

:::result #res-a
reaction: rxn-a
status: success
yield: 72%
:::
`;

const citationCandidate = (
  overrides: Partial<EditorGraphRagCitationCandidate> = {}
): EditorGraphRagCitationCandidate => ({
  citationId: "citation-1",
  revisionId: "revision-1",
  chunkId: "chunk-1",
  experimentId: "experiment-1",
  documentUri: "chemd-workspace://workspace/route.chemd",
  sourceRange: range(12),
  citation: {
    experimentId: "experiment-1",
    revisionId: "revision-1",
    chunkId: "chunk-1",
    documentUri: "chemd-workspace://workspace/route.chemd",
    sourceRange: range(12)
  },
  quality: {},
  createdAt: "2026-05-13T00:00:00.000Z",
  ...overrides
});

describe("desktop workspace index view model", () => {
  it("returns an empty state when no loaded Chemd source is available", () => {
    const viewModel = buildWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [file("README.md")]
    });

    expect(viewModel).toMatchObject({
      state: "empty",
      index: null,
      completionIndex: undefined
    });
    expect(viewModel.badges).toEqual([
      { label: "Docs", value: "0", tone: "neutral" },
      { label: "RAG", value: "0", tone: "warning" }
    ]);
  });

  it("indexes the current document without reading from the file system", () => {
    const viewModel = buildWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [file("experiments/route-a.chemd")],
      currentDocument: {
        path: "experiments/route-a.chemd",
        source: "reaction: rxn-a"
      },
      compile
    });

    expect(viewModel.state).toBe("ready");
    expect(viewModel.symbols).toEqual([
      expect.objectContaining({
        label: "rxn-a",
        documentPath: "experiments/route-a.chemd"
      })
    ]);
    expect(viewModel.completionIndex?.symbols[0]).toMatchObject({
      documentId: "route-a",
      localId: "rxn-a"
    });
  });

  it("keeps legacy .chemd.md documents visible to the workspace index", () => {
    const viewModel = buildWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [file("experiments/legacy.chemd.md")],
      currentDocument: {
        path: "experiments/legacy.chemd.md",
        source: "reaction: rxn-a"
      },
      compile
    });

    expect(viewModel.state).toBe("ready");
    expect(viewModel.completionIndex?.symbols[0]).toMatchObject({
      documentId: "legacy",
      localId: "rxn-a"
    });
  });

  it("summarizes cross-document references and definitions", () => {
    const viewModel = buildWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [
        file("experiments/route-a.chemd"),
        file("experiments/route-b.chemd")
      ],
      documents: [
        {
          path: "experiments/route-a.chemd",
          source: "prev: route-b#rxn-b"
        },
        {
          path: "experiments/route-b.chemd",
          source: "reaction: rxn-b"
        }
      ],
      compile
    });
    const routeB = viewModel.index?.symbols.find((symbol) => symbol.localId === "rxn-b");

    expect(viewModel.state).toBe("ready");
    expect(viewModel.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: "route-b#rxn-b",
        status: "resolved",
        targetCount: 1
      })
    ]));
    expect(routeB && viewModel.index
      ? getWorkspaceReferenceRowsForSymbol(viewModel.index, routeB)
      : []).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "route-b#rxn-b" })
    ]));
  });

  it("marks unresolved references as degraded instead of hiding them", () => {
    const viewModel = buildWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [file("experiments/route-a.chemd")],
      currentDocument: {
        path: "experiments/route-a.chemd",
        source: "product: missing-product"
      },
      compile
    });

    expect(viewModel.state).toBe("degraded");
    expect(viewModel.message).toContain("unresolved references");
    expect(viewModel.references).toEqual([
      expect.objectContaining({
        status: "unresolved",
        target: "missing-product"
      })
    ]);
  });

  it("generates searchable RAG results only when citations are usable", () => {
    const viewModel = buildWorkspaceIndexViewModel({
      workspaceId: "workspace-rag",
      files: [file("experiments/rag-gate.chemd")],
      currentDocument: {
        path: "experiments/rag-gate.chemd",
        source: citationSource
      }
    });

    expect(viewModel.ragGate).toMatchObject({
      state: "ready",
      message: expect.stringContaining("citation-backed only")
    });
    expect(viewModel.ragResults.length).toBeGreaterThan(0);
    expect(viewModel.ragResults[0]).toMatchObject({
      citationId: expect.any(String),
      revisionId: expect.any(String),
      chunkId: expect.any(String),
      documentPath: "experiments/rag-gate.chemd",
      documentUri: expect.stringContaining("chemd-workspace://"),
      text: expect.any(String),
      locator: expect.stringContaining("L")
    });
  });

  it("keeps full RAG chunk text separate from truncated display labels", () => {
    const longText = "A".repeat(120);
    const results = buildWorkspaceRagResultsFromCitationCandidates({
      documentPath: "experiments/long.chemd",
      documentUri: "chemd-workspace://workspace/long.chemd",
      candidates: [citationCandidate()],
      chunkTextById: new Map([["chunk-1", longText]])
    });

    expect(results[0].text).toBe(longText);
    expect(results[0].label.length).toBeLessThan(longText.length);
  });

  it("keeps empty RAG candidates behind the citation gate", () => {
    const results = buildWorkspaceRagResultsFromCitationCandidates({
      documentPath: "experiments/empty.chemd",
      documentUri: "chemd-workspace://workspace/empty.chemd",
      candidates: [],
      chunkTextById: new Map()
    });
    const viewModel = buildWorkspaceIndexViewModel({
      workspaceId: "workspace-rag",
      files: [file("README.md")]
    });

    expect(results).toEqual([]);
    expect(viewModel.ragGate).toMatchObject({
      state: "empty",
      message: expect.stringContaining("citation-backed only")
    });
  });

  it("filters candidate content when citation fields are missing", () => {
    const results = buildWorkspaceRagResultsFromCitationCandidates({
      documentPath: "experiments/route.chemd",
      documentUri: "chemd-workspace://workspace/route.chemd",
      candidates: [
        citationCandidate({ citationId: "" }),
        citationCandidate({ chunkId: "" }),
        citationCandidate({ sourceRange: {} })
      ],
      chunkTextById: new Map([["chunk-1", "uncited content"]])
    });

    expect(results).toEqual([]);
  });
});

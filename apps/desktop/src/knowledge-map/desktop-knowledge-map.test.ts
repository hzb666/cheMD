import { describe, expect, it } from "vitest";

import {
  compileChemdForEditor,
  type ChemdLanguageCompileSuccess,
  type ChemdLanguageCompileOutput
} from "@chemd/language-service";

import { buildDesktopKnowledgeMapViewModel } from "./desktop-knowledge-map";

const compile = (source: string): ChemdLanguageCompileOutput =>
  compileChemdForEditor({
    source,
    documentUri: "experiments/map.chemd.md",
    options: { strictChemdKind: true, procedureMode: "auto" }
  });

const outputWithReaction = (): ChemdLanguageCompileSuccess => ({
  status: "ok",
  documentUri: "experiments/map.chemd.md",
  compiledAt: "2026-05-13T00:00:00.000Z",
  diagnostics: [],
  outline: [
    {
      id: "mol-a",
      label: "mol-a",
      kind: "molecule",
      range: { startLine: 7, startColumn: 1, endLine: 10, endColumn: 4 }
    },
    {
      id: "rxn-a",
      label: "rxn-a",
      kind: "reaction",
      range: { startLine: 12, startColumn: 1, endLine: 16, endColumn: 4 }
    }
  ],
  symbols: [
    {
      id: "mol-a",
      label: "mol-a",
      kind: "molecule",
      range: { startLine: 7, startColumn: 1, endLine: 10, endColumn: 4 },
      sourceNodeType: "molecule"
    },
    {
      id: "rxn-a",
      label: "rxn-a",
      kind: "reaction",
      range: { startLine: 12, startColumn: 1, endLine: 16, endColumn: 4 },
      sourceNodeType: "reaction"
    }
  ],
  result: ({
    document: {
      type: "document",
      meta: {
        id: "map-doc",
        title: "Knowledge map",
        date: "2026-05-13"
      },
      children: [
        { type: "molecule", id: "mol-a", name: "A", smiles: "CCO" },
        { type: "reaction", id: "rxn-a", reactants: ["mol-a"], products: ["mol-b"] }
      ],
      diagnostics: []
    },
    diagnostics: []
  } as unknown) as ChemdLanguageCompileSuccess["result"]
});

const outputWithManyReactions = (count: number): ChemdLanguageCompileSuccess => {
  const symbols = Array.from({ length: count }, (_, index) => ({
    id: `rxn-${index + 1}`,
    label: `rxn-${index + 1}`,
    kind: "reaction",
    range: { startLine: index + 1, startColumn: 1, endLine: index + 1, endColumn: 8 },
    sourceNodeType: "reaction"
  }));

  return {
    ...outputWithReaction(),
    symbols,
    result: ({
      document: {
        type: "document",
        meta: {
          id: "large-map-doc",
          title: "Large knowledge map",
          date: "2026-05-13"
        },
        children: symbols.map((symbol) => ({
          type: "reaction",
          id: symbol.id,
          reactants: [`mol-${symbol.id}`],
          products: [`product-${symbol.id}`]
        })),
        diagnostics: []
      },
      diagnostics: []
    } as unknown) as ChemdLanguageCompileSuccess["result"]
  };
};

describe("desktop knowledge map view model", () => {
  it("builds semantic summaries from successful compile output", () => {
    const viewModel = buildDesktopKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.state).toBe("ready");
    expect(viewModel.semanticTree?.document_id).toBe("map-doc");
    expect(viewModel.semanticSummary.nodeCount).toBeGreaterThan(1);
    expect(viewModel.semanticSummary.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "MoleculeBlock" }),
      expect.objectContaining({ component: "ReactionBlock" })
    ]));
  });

  it("creates reaction map data with deterministic fallback layout", () => {
    const viewModel = buildDesktopKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.reactionSummary).toMatchObject({
      reactionCount: 1,
      layoutEngine: "deterministic_fallback"
    });
    expect(viewModel.reactionSummary.message).toContain("TMAP/worker");
    expect(viewModel.reactionMap.nodes[0]).toMatchObject({
      reaction_entity_id: "rxn-a",
      x: 0,
      y: 0
    });
  });

  it("builds a 1k reaction layout fixture without requiring TMAP", () => {
    const viewModel = buildDesktopKnowledgeMapViewModel(outputWithManyReactions(1000));

    expect(viewModel.reactionMap.nodes).toHaveLength(1000);
    expect(viewModel.reactionSummary).toMatchObject({
      reactionCount: 1000,
      layoutEngine: "deterministic_fallback"
    });
  });

  it("marks diagnostic output as degraded without losing semantic data", () => {
    const output = outputWithReaction();
    const viewModel = buildDesktopKnowledgeMapViewModel({
      ...output,
      diagnostics: [{
        code: "W_TEST",
        severity: "warning",
        message: "review required",
        range: {
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 2
        },
        quickFixes: []
      }]
    });

    expect(viewModel.state).toBe("degraded");
    expect(viewModel.semanticSummary.nodeCount).toBeGreaterThan(1);
  });

  it("returns failed state when compile output failed", () => {
    const failed = {
      status: "failed",
      documentUri: "experiments/bad.chemd.md",
      compiledAt: "2026-05-13T00:00:00.000Z",
      diagnostics: [],
      outline: [],
      symbols: [],
      error: {
        code: "LS_COMPILE_FAILED",
        message: "failed"
      }
    } satisfies ChemdLanguageCompileOutput;
    const viewModel = buildDesktopKnowledgeMapViewModel(failed);

    expect(viewModel.state).toBe("failed");
    expect(viewModel.semanticTree).toBeNull();
    expect(viewModel.reactionSummary.reactionCount).toBe(0);
  });

  it("keeps empty documents explicit", () => {
    const viewModel = buildDesktopKnowledgeMapViewModel(compile(`---
id: empty-doc
title: Empty
date: 2026-05-13
---
`));

    expect(viewModel.state).toBe("empty");
    expect(viewModel.reactionSummary.reactionCount).toBe(0);
  });
});

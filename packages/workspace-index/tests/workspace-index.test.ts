import { describe, expect, it } from "vitest";
import type {
  ChemdLanguageCompileSuccess,
  ChemdSourceRange,
  ChemdSymbol
} from "@chemd/language-service";

import {
  buildWorkspaceSymbolIndex,
  findReferences,
  findSymbolDefinitions,
  listWorkspaceSymbols,
  summarizeWorkspaceIndex,
  type WorkspaceDocumentInput,
  type WorkspaceIndexCompileFn
} from "../src";

const range = (line: number): ChemdSourceRange => ({
  startLine: line,
  startColumn: 1,
  endLine: line,
  endColumn: 10
});

const sourceA = `---
id: route-a
title: Route A
date: 2026-05-13
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::chemd #rxn-a
kind: reaction
reactants: @mol-a
products: mol-b
prev: route-b#rxn-b
:::

:::result #res-a
reaction: rxn-a
product: missing-product
status: success
:::
`;

const sourceB = `---
id: route-b
title: Route B
date: 2026-05-13
---

:::chemd #mol-b
kind: molecule
smiles: CC=O
:::

:::chemd #rxn-b
kind: reaction
reactants: mol-b
products: mol-c
:::
`;

const workspaceDocuments: WorkspaceDocumentInput[] = [
  {
    uri: "file:///workspace/route-a.chemd.md",
    path: "experiments/route-a.chemd.md",
    source: sourceA
  },
  {
    uri: "file:///workspace/route-b.chemd.md",
    path: "experiments/route-b.chemd.md",
    source: sourceB
  }
];

const fakeCompileOutput = (
  documentUri: string,
  symbols: ChemdSymbol[]
): ChemdLanguageCompileSuccess => ({
  status: "ok",
  documentUri,
  compiledAt: "2026-05-13T00:00:00.000Z",
  result: {} as ChemdLanguageCompileSuccess["result"],
  diagnostics: [],
  outline: [],
  symbols
});

describe("buildWorkspaceSymbolIndex", () => {
  it("builds definitions and references across multiple documents", () => {
    const index = buildWorkspaceSymbolIndex(workspaceDocuments);

    expect(findSymbolDefinitions(index, { localId: "rxn-b" })).toEqual([
      expect.objectContaining({
        documentUri: "file:///workspace/route-b.chemd.md",
        localId: "rxn-b",
        kind: "reaction"
      })
    ]);

    expect(findReferences(index, { localId: "rxn-b" })).toEqual([
      expect.objectContaining({
        documentUri: "file:///workspace/route-a.chemd.md",
        field: "prev",
        targetText: "route-b#rxn-b",
        status: "resolved"
      })
    ]);
  });

  it("marks unresolved references without failing the index", () => {
    const index = buildWorkspaceSymbolIndex(workspaceDocuments);
    const unresolved = index.references.find((reference) =>
      reference.targetText === "missing-product"
    );

    expect(unresolved).toMatchObject({
      status: "unresolved",
      targetSymbolIds: []
    });
    expect(index.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentUri: "file:///workspace/route-a.chemd.md",
        diagnostic: expect.objectContaining({
          code: "W_WORKSPACE_REFERENCE_UNRESOLVED",
          message: expect.stringContaining("missing-product")
        })
      })
    ]));
  });

  it("marks duplicate symbols and ambiguous references", () => {
    const compile: WorkspaceIndexCompileFn = (input) =>
      fakeCompileOutput(input.documentUri, [
        { id: "dup", label: "dup", kind: "reaction", range: range(1) },
        { id: "dup", label: "dup", kind: "reaction", range: range(2) }
      ]);
    const index = buildWorkspaceSymbolIndex([{
      uri: "file:///dup.chemd.md",
      source: "ref: dup"
    }], compile);

    expect(index.symbols.map((symbol) => symbol.duplicateLocalId)).toEqual([true, true]);
    expect(index.references[0]).toMatchObject({
      status: "ambiguous",
      targetSymbolIds: [
        "file:///dup.chemd.md#dup",
        "file:///dup.chemd.md#dup~2"
      ]
    });
  });

  it("isolates compile failures to the failing document", () => {
    const compile: WorkspaceIndexCompileFn = (input) => {
      if (input.documentUri.endsWith("bad.chemd.md")) {
        throw new Error("compile failed for bad document");
      }
      return fakeCompileOutput(input.documentUri, [
        { id: "ok-symbol", label: "ok-symbol", kind: "reaction", range: range(1) }
      ]);
    };
    const index = buildWorkspaceSymbolIndex([
      { uri: "file:///bad.chemd.md", source: "ref: missing" },
      { uri: "file:///good.chemd.md", source: "ref: ok-symbol" }
    ], compile);

    expect(index.documents).toEqual([
      expect.objectContaining({ uri: "file:///bad.chemd.md", status: "failed" }),
      expect.objectContaining({ uri: "file:///good.chemd.md", status: "ok" })
    ]);
    expect(findSymbolDefinitions(index, { localId: "ok-symbol" })).toHaveLength(1);
    expect(index.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentUri: "file:///bad.chemd.md",
        diagnostic: expect.objectContaining({
          code: "E_WORKSPACE_COMPILE_FAILED",
          message: "compile failed for bad document"
        })
      })
    ]));
  });

  it("returns workspace symbols and summaries with stable sorting", () => {
    const compile: WorkspaceIndexCompileFn = (input) => {
      const id = input.documentUri.includes("b") ? "b-symbol" : "a-symbol";
      return fakeCompileOutput(input.documentUri, [
        { id, label: id, kind: "reaction", range: range(1) }
      ]);
    };
    const index = buildWorkspaceSymbolIndex([
      { uri: "file:///b.chemd.md", source: "ref: a-symbol" },
      { uri: "file:///a.chemd.md", source: "ref: b-symbol" }
    ], compile);

    expect(listWorkspaceSymbols(index).map((symbol) => symbol.localId)).toEqual([
      "a-symbol",
      "b-symbol"
    ]);
    expect(summarizeWorkspaceIndex(index)).toMatchObject({
      documentCount: 2,
      failedDocumentCount: 0,
      symbolCount: 2,
      referenceCount: 2,
      resolvedReferenceCount: 2,
      unresolvedReferenceCount: 0
    });
  });
});

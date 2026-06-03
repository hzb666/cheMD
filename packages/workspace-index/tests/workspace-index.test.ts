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
  markStaleWorkspaceSymbols,
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

const sourceA = `module route_a

meta {
  id: "route-a"
  title: "Route A"
  date: "2026-05-13"
}

molecule mol-a {
  smiles: "CCO"
}

reaction rxn-a {
  reactants: [@mol-a]
  products: [@mol-b]
  prev: [@route-b#rxn-b]
}

result res-a for @rxn-a {
  product: @missing-product
  status: success
}
`;

const sourceB = `module route_b

meta {
  id: "route-b"
  title: "Route B"
  date: "2026-05-13"
}

molecule mol-b {
  smiles: "CC=O"
}

reaction rxn-b {
  reactants: [@mol-b]
  products: ["mol-c"]
}
`;

const workspaceDocuments: WorkspaceDocumentInput[] = [
  {
    uri: "file:///workspace/route-a.chemd",
    path: "experiments/route-a.chemd",
    source: sourceA
  },
  {
    uri: "file:///workspace/route-b.chemd",
    path: "experiments/route-b.chemd",
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
  semanticTokens: [],
  symbols
});

describe("buildWorkspaceSymbolIndex", () => {
  it("builds definitions and references across multiple documents", () => {
    const index = buildWorkspaceSymbolIndex(workspaceDocuments);

    expect(findSymbolDefinitions(index, { localId: "rxn-b" })).toEqual([
      expect.objectContaining({
        documentUri: "file:///workspace/route-b.chemd",
        localId: "rxn-b",
        kind: "reaction"
      })
    ]);

    expect(findReferences(index, { localId: "rxn-b" })).toEqual([
      expect.objectContaining({
        documentUri: "file:///workspace/route-a.chemd",
        field: "prev",
        targetText: "route-b#rxn-b",
        status: "resolved"
      })
    ]);
  });

  it("extracts reference fields and at tokens without regex backtracking", () => {
    const index = buildWorkspaceSymbolIndex([
      {
        uri: "file:///workspace/route-a.chemd",
        path: "experiments/route-a.chemd",
        source: "reactants: [ @mol-a, route-b#rxn-b; ]\nnotes: @rxn-b"
      },
      {
        uri: "file:///workspace/route-b.chemd",
        path: "experiments/route-b.chemd",
        source: sourceB
      }
    ]);

    expect(index.references
      .filter((reference) => reference.documentUri === "file:///workspace/route-a.chemd")
      .map((reference) => reference.targetText)).toEqual([
        "mol-a",
        "route-b#rxn-b",
        "rxn-b"
      ]);
  });

  it("does not create workspace references from at signs inside strings", () => {
    const index = buildWorkspaceSymbolIndex([
      {
        uri: "file:///workspace/string-at.chemd",
        source: `module exp_string_at

meta {
  id: "exp-string-at"
  title: "literal @not-a-reference"
  date: "2026-05-13"
}

molecule mol_a {
  name: "quoted @not-a-reference"
}
`
      }
    ]);

    expect(index.references.map((reference) => reference.targetText))
      .not.toContain("not-a-reference");
    expect(index.diagnostics).not.toContainEqual(
      expect.objectContaining({
        diagnostic: expect.objectContaining({
          code: "W_WORKSPACE_REFERENCE_UNRESOLVED",
          message: expect.stringContaining("not-a-reference")
        })
      })
    );
  });

  it("does not resolve unsupported .chemd.md document aliases", () => {
    const index = buildWorkspaceSymbolIndex([
      {
        uri: "file:///workspace/route-a.chemd",
        path: "experiments/route-a.chemd",
        source: sourceA.replace("@route-b#rxn-b", "@route-b.chemd.md#rxn-b")
      },
      {
        uri: "file:///workspace/route-b.chemd",
        path: "experiments/route-b.chemd",
        source: sourceB
      }
    ]);

    expect(index.references.filter((reference) =>
      reference.targetText === "route-b.chemd.md#rxn-b"
    )).toEqual([
      expect.objectContaining({
        documentUri: "file:///workspace/route-a.chemd",
        targetText: "route-b.chemd.md#rxn-b",
        status: "unresolved",
        targetSymbolIds: []
      })
    ]);
  });

  it("does not resolve unknown document extensions as chemd aliases", () => {
    const index = buildWorkspaceSymbolIndex([
      {
        uri: "file:///workspace/route-a.chemd",
        path: "experiments/route-a.chemd",
        source: sourceA.replace("@route-b#rxn-b", "@route-b.txt#rxn-b")
      },
      {
        uri: "file:///workspace/route-b.chemd",
        path: "experiments/route-b.chemd",
        source: sourceB
      }
    ]);

    expect(index.references.filter((reference) =>
      reference.targetText === "route-b.txt#rxn-b"
    )).toEqual([
      expect.objectContaining({
        documentUri: "file:///workspace/route-a.chemd",
        targetText: "route-b.txt#rxn-b",
        status: "unresolved",
        targetSymbolIds: []
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
        documentUri: "file:///workspace/route-a.chemd",
        diagnostic: expect.objectContaining({
          code: "W_WORKSPACE_REFERENCE_UNRESOLVED",
          severity: "error",
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
      uri: "file:///dup.chemd",
      source: "ref: dup"
    }], compile);

    expect(index.symbols.map((symbol) => symbol.duplicateLocalId)).toEqual([true, true]);
    expect(index.references[0]).toMatchObject({
      status: "ambiguous",
      targetSymbolIds: [
        "file:///dup.chemd#dup",
        "file:///dup.chemd#dup~2"
      ]
    });
  });

  it("isolates compile failures to the failing document", () => {
    const compile: WorkspaceIndexCompileFn = (input) => {
      if (input.documentUri.endsWith("bad.chemd")) {
        throw new Error("compile failed for bad document");
      }
      return fakeCompileOutput(input.documentUri, [
        { id: "ok-symbol", label: "ok-symbol", kind: "reaction", range: range(1) }
      ]);
    };
    const index = buildWorkspaceSymbolIndex([
      { uri: "file:///bad.chemd", source: "ref: missing" },
      { uri: "file:///good.chemd", source: "ref: ok-symbol" }
    ], compile);

    expect(index.documents).toEqual([
      expect.objectContaining({ uri: "file:///bad.chemd", status: "failed" }),
      expect.objectContaining({ uri: "file:///good.chemd", status: "ok" })
    ]);
    expect(findSymbolDefinitions(index, { localId: "ok-symbol" })).toHaveLength(1);
    expect(index.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentUri: "file:///bad.chemd",
        diagnostic: expect.objectContaining({
          code: "E_WORKSPACE_COMPILE_FAILED",
          severity: "error",
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
      { uri: "file:///b.chemd", source: "ref: a-symbol" },
      { uri: "file:///a.chemd", source: "ref: b-symbol" }
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

  it("marks stale symbols without mutating the source index", () => {
    const index = buildWorkspaceSymbolIndex(workspaceDocuments);
    const staleId = index.symbols[0].symbolId;
    const nextIndex = markStaleWorkspaceSymbols(index, [staleId]);

    expect(index.symbols[0].stale).toBeUndefined();
    expect(nextIndex.symbols.find((symbol) => symbol.symbolId === staleId)?.stale).toBe(true);
    expect(nextIndex.symbols.filter((symbol) => symbol.stale)).toHaveLength(1);
  });
});

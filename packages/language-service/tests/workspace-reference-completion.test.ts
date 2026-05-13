import { describe, expect, it } from "vitest";

import {
  buildChemdWorkspaceSymbolIndex,
  compileChemdForEditor,
  getChemdWorkspaceReferenceCompletions
} from "../src/index";

const withCursor = (source: string): { source: string; cursorOffset: number } => {
  const cursorOffset = source.indexOf("|");
  if (cursorOffset < 0) {
    throw new Error("Missing cursor marker");
  }

  return {
    source: source.slice(0, cursorOffset) + source.slice(cursorOffset + 1),
    cursorOffset
  };
};

const moleculeSource = (id: string): string => `:::chemd #${id}
kind: molecule
smiles: CCO
:::
`;

const reactionSource = (id: string): string => `:::chemd #${id}
kind: reaction
reactants: mol-a
products: mol-b
:::
`;

const currentSource = `:::chemd #mol-current
kind: molecule
smiles: CCN
:::

:::chemd #rxn-current
kind: reaction
reactants: |
:::
`;

describe("getChemdWorkspaceReferenceCompletions", () => {
  it("returns workspace references from explicit at tokens with document metadata", () => {
    const request = withCursor("Related: @mol|");
    const index = buildChemdWorkspaceSymbolIndex([
      {
        documentUri: "file:///workspace/a.chemd",
        source: moleculeSource("mol-shared")
      },
      {
        documentUri: "file:///workspace/b.chemd",
        source: moleculeSource("mol-shared")
      }
    ]);

    const completions = getChemdWorkspaceReferenceCompletions({
      ...request,
      documentUri: "file:///workspace/current.chemd",
      workspaceSymbolIndex: index
    });

    expect(completions.items).toHaveLength(2);
    expect(new Set(completions.items.map((item) => item.label)).size).toBe(2);
    expect(completions.items[0]).toMatchObject({
      kind: "reference",
      insertText: expect.stringMatching(/^@.+#mol-shared$/),
      data: {
        type: "workspace-reference",
        localId: "mol-shared",
        symbolKind: "molecule",
        documentUri: "file:///workspace/a.chemd",
        stale: false
      }
    });
    expect(completions.items.map((item) => item.data.documentUri)).toEqual([
      "file:///workspace/a.chemd",
      "file:///workspace/b.chemd"
    ]);
  });

  it("suggests only in reference value positions and excludes current symbol self references", () => {
    const request = withCursor(currentSource);
    const index = buildChemdWorkspaceSymbolIndex([
      {
        documentUri: "file:///workspace/current.chemd",
        source: request.source
      },
      {
        documentUri: "file:///workspace/lib.chemd",
        source: moleculeSource("mol-lib")
      }
    ]);

    const labels = getChemdWorkspaceReferenceCompletions({
      ...request,
      documentUri: "file:///workspace/current.chemd",
      workspaceSymbolIndex: index
    }).items.map((item) => item.data.localId);

    expect(labels).toContain("mol-current");
    expect(labels).toContain("mol-lib");
    expect(labels).not.toContain("rxn-current");

    const prose = withCursor("This is prose @mol|");
    expect(getChemdWorkspaceReferenceCompletions({
      ...prose,
      workspaceSymbolIndex: index
    }).items).not.toHaveLength(0);

    const plainProse = withCursor("This is prose mol|");
    expect(getChemdWorkspaceReferenceCompletions({
      ...plainProse,
      workspaceSymbolIndex: index
    }).items).toEqual([]);
  });

  it("sorts by field preference and marks stale symbols", () => {
    const request = withCursor(`:::chemd #rxn-main
kind: reaction
prev: |
:::
`);
    const index = buildChemdWorkspaceSymbolIndex([
      {
        documentUri: "file:///workspace/mol.chemd",
        source: moleculeSource("mol-old"),
        stale: true
      },
      {
        documentUri: "file:///workspace/rxn.chemd",
        source: reactionSource("rxn-prev")
      }
    ]);

    const items = getChemdWorkspaceReferenceCompletions({
      ...request,
      workspaceSymbolIndex: index
    }).items;

    expect(items.map((item) => item.data.localId)).toEqual(["rxn-prev", "mol-old"]);
    expect(items[1]).toMatchObject({
      detail: expect.stringContaining("stale"),
      data: {
        stale: true,
        documentUri: "file:///workspace/mol.chemd"
      }
    });
  });

  it("stably degrades without index, empty index, or failed documents", () => {
    const request = withCursor(`:::chemd #rxn-main
kind: reaction
reactants: @|
:::
`);
    const failedOutput = compileChemdForEditor(
      {
        documentUri: "file:///workspace/broken.chemd",
        source: "broken"
      },
      {
        compileChemd: () => {
          throw new Error("compiler unavailable");
        },
        now: () => new Date("2026-05-13T00:00:00.000Z")
      }
    );
    const failedIndex = buildChemdWorkspaceSymbolIndex([{
      documentUri: "file:///workspace/broken.chemd",
      source: "broken",
      compileOutput: failedOutput
    }]);

    expect(getChemdWorkspaceReferenceCompletions(request).items).toEqual([]);
    expect(getChemdWorkspaceReferenceCompletions({
      ...request,
      workspaceSymbolIndex: {
        documents: [],
        symbols: [],
        symbolsByKind: {},
        symbolIdsByName: {},
        diagnosticsSummary: {
          totalDocuments: 0,
          okDocuments: 0,
          failedDocuments: 0,
          totalDiagnostics: 0,
          errors: 0,
          warnings: 0,
          infos: 0
        }
      }
    }).items).toEqual([]);
    expect(getChemdWorkspaceReferenceCompletions({
      ...request,
      workspaceSymbolIndex: failedIndex
    }).items).toEqual([]);
  });
});

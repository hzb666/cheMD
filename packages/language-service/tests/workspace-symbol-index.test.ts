import { describe, expect, it } from "vitest";

import {
  buildChemdWorkspaceSymbolIndex,
  compileChemdForEditor,
  findChemdWorkspaceSymbolById,
  findChemdWorkspaceSymbolsByKind,
  findChemdWorkspaceSymbolsByName
} from "../src/index";

const createSource = (id: string, reactionId: string): string => `---
id: ${id}
title: ${id}
date: 2026-05-13
---

:::chemd #mol-main
kind: molecule
smiles: CCO
:::

:::chemd #${reactionId}
kind: reaction
reactants: mol-main
products: product-main
:::
`;

describe("buildChemdWorkspaceSymbolIndex", () => {
  it("merges symbols and diagnostics across workspace documents", () => {
    const index = buildChemdWorkspaceSymbolIndex([
      {
        documentUri: "file:///workspace/a.chemd",
        source: createSource("exp-a", "rxn-a")
      },
      {
        documentUri: "file:///workspace/b.chemd",
        source: createSource("exp-b", "rxn-b")
      }
    ]);

    expect(index.documents).toHaveLength(2);
    expect(index.diagnosticsSummary).toMatchObject({
      totalDocuments: 2,
      okDocuments: 2,
      failedDocuments: 0
    });
    expect(index.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({
        localId: "rxn-a",
        kind: "reaction",
        documentUri: "file:///workspace/a.chemd"
      }),
      expect.objectContaining({
        localId: "rxn-b",
        kind: "reaction",
        documentUri: "file:///workspace/b.chemd"
      })
    ]));
    expect(index.symbolsByKind.reaction.map((symbol) => symbol.localId))
      .toEqual(["rxn-a", "rxn-b"]);
  });

  it("keeps duplicate local symbols document-scoped and deterministically sorted", () => {
    const index = buildChemdWorkspaceSymbolIndex([
      {
        documentUri: "file:///workspace/b.chemd",
        source: createSource("exp-b", "shared-rxn")
      },
      {
        documentUri: "file:///workspace/a.chemd",
        source: createSource("exp-a", "shared-rxn")
      }
    ]);
    const matches = findChemdWorkspaceSymbolsByName(index, "shared-rxn");

    expect(matches).toHaveLength(2);
    expect(matches.map((symbol) => symbol.documentUri)).toEqual([
      "file:///workspace/a.chemd",
      "file:///workspace/b.chemd"
    ]);
    expect(new Set(matches.map((symbol) => symbol.id)).size).toBe(2);
    expect(matches.every((symbol) => symbol.id.endsWith("#shared-rxn"))).toBe(true);
  });

  it("isolates failed documents without dropping healthy symbols", () => {
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
    const index = buildChemdWorkspaceSymbolIndex([
      {
        documentUri: "file:///workspace/ok.chemd",
        source: createSource("exp-ok", "rxn-ok")
      },
      {
        documentUri: "file:///workspace/broken.chemd",
        source: "broken",
        compileOutput: failedOutput
      }
    ]);

    expect(index.documents.find((document) =>
      document.documentUri === "file:///workspace/broken.chemd"
    )).toMatchObject({
      status: "failed",
      symbolCount: 0
    });
    expect(index.diagnosticsSummary).toMatchObject({
      totalDocuments: 2,
      okDocuments: 1,
      failedDocuments: 1,
      errors: 1
    });
    expect(index.symbols.map((symbol) => symbol.documentUri))
      .not.toContain("file:///workspace/broken.chemd");
    expect(findChemdWorkspaceSymbolsByName(index, "rxn-ok")).toHaveLength(1);
  });

  it("supports exact id, name, and kind lookup helpers", () => {
    const index = buildChemdWorkspaceSymbolIndex([{
      documentUri: "file:///workspace/lookup.chemd",
      source: createSource("exp-lookup", "rxn-lookup")
    }]);
    const byName = findChemdWorkspaceSymbolsByName(index, "rxn-lookup");
    const byKind = findChemdWorkspaceSymbolsByKind(index, "reaction");
    const byId = findChemdWorkspaceSymbolById(index, byName[0].id);

    expect(byName).toHaveLength(1);
    expect(byKind).toEqual(expect.arrayContaining([
      expect.objectContaining({ localId: "rxn-lookup" })
    ]));
    expect(byId).toMatchObject({
      localId: "rxn-lookup",
      summary: "reaction rxn-lookup"
    });
  });
});

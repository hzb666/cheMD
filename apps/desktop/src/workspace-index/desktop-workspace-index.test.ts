import { describe, expect, it } from "vitest";
import type {
  ChemdLanguageCompileSuccess,
  ChemdSourceRange
} from "@chemd/language-service";
import type { WorkspaceIndexCompileFn } from "@chemd/workspace-index";

import type { WorkspaceFileEntry } from "../desktop-contracts";
import {
  buildDesktopWorkspaceIndexViewModel,
  getWorkspaceReferenceRowsForSymbol
} from "./desktop-workspace-index";

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

describe("desktop workspace index view model", () => {
  it("returns an empty state when no loaded Chemd source is available", () => {
    const viewModel = buildDesktopWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [file("README.md")]
    });

    expect(viewModel).toMatchObject({
      state: "empty",
      index: null,
      completionIndex: undefined
    });
    expect(viewModel.badges).toEqual([{ label: "Docs", value: "0", tone: "neutral" }]);
  });

  it("indexes the current document without reading from the file system", () => {
    const viewModel = buildDesktopWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [file("experiments/route-a.chemd.md")],
      currentDocument: {
        path: "experiments/route-a.chemd.md",
        source: "reaction: rxn-a"
      },
      compile
    });

    expect(viewModel.state).toBe("ready");
    expect(viewModel.symbols).toEqual([
      expect.objectContaining({
        label: "rxn-a",
        documentPath: "experiments/route-a.chemd.md"
      })
    ]);
    expect(viewModel.completionIndex?.symbols[0]).toMatchObject({
      documentId: "route-a",
      localId: "rxn-a"
    });
  });

  it("summarizes cross-document references and definitions", () => {
    const viewModel = buildDesktopWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [
        file("experiments/route-a.chemd.md"),
        file("experiments/route-b.chemd.md")
      ],
      documents: [
        {
          path: "experiments/route-a.chemd.md",
          source: "prev: route-b#rxn-b"
        },
        {
          path: "experiments/route-b.chemd.md",
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
    const viewModel = buildDesktopWorkspaceIndexViewModel({
      workspaceId: "workspace-1",
      files: [file("experiments/route-a.chemd.md")],
      currentDocument: {
        path: "experiments/route-a.chemd.md",
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
});

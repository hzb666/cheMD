import { describe, expect, it, vi } from "vitest";
import { compileChemdForEditor } from "@chemd/language-service";

import {
  buildDesktopWorkspaceSymbolIndex,
  type DesktopWorkspaceSymbolCompileInput
} from "./desktop-workspace-symbol-index";
import type { WorkspaceFileEntry, WorkspaceHandle } from "./desktop-contracts";

const workspace: WorkspaceHandle = {
  workspaceId: "workspace-alpha",
  displayName: "Workspace Alpha",
  rootPath: "D:/lab/workspace-alpha",
  rootHint: "workspace-alpha",
  writable: true
};

const fileEntry = (
  path: string,
  overrides: Partial<WorkspaceFileEntry> = {}
): WorkspaceFileEntry => ({
  id: path,
  name: path.split("/").pop() ?? path,
  path,
  kind: "file",
  ...overrides
});

const createSource = (reactionId: string): string => `---
id: ${reactionId}
title: ${reactionId}
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

describe("buildDesktopWorkspaceSymbolIndex", () => {
  it("builds a workspace symbol index from readable Chemd markdown files", async () => {
    const files = [
      fileEntry("experiments/a.chemd.md"),
      fileEntry("experiments/b.chemd.md")
    ];
    const result = await buildDesktopWorkspaceSymbolIndex({
      workspace,
      files,
      readFile: (file) => createSource(file.path.includes("a") ? "rxn-a" : "rxn-b"),
      languageServiceDependencies: {
        now: () => new Date("2026-05-13T00:00:00.000Z")
      }
    });

    expect(result.summary).toMatchObject({
      workspaceId: "workspace-alpha",
      totalFiles: 2,
      scannedFiles: 2,
      indexedFiles: 2,
      failedFiles: 0,
      skippedFiles: 0,
      errors: []
    });
    expect(result.index.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({
        localId: "rxn-a",
        documentUri: "workspace://workspace-alpha/experiments/a.chemd.md"
      }),
      expect.objectContaining({
        localId: "rxn-b",
        documentUri: "workspace://workspace-alpha/experiments/b.chemd.md"
      })
    ]));
    expect(result.index.symbolsByKind.reaction.map((symbol) => symbol.localId))
      .toEqual(["rxn-a", "rxn-b"]);
  });

  it("skips plain markdown and unsupported workspace entries without reading them", async () => {
    const readFile = vi.fn((file: WorkspaceFileEntry) => createSource(file.path));
    const result = await buildDesktopWorkspaceSymbolIndex({
      workspace,
      files: [
        fileEntry("experiments/a.chemd.md"),
        fileEntry("notes/readme.md"),
        fileEntry("assets/table.csv"),
        fileEntry("experiments", { kind: "directory" })
      ],
      readFile
    });

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(expect.objectContaining({
      path: "experiments/a.chemd.md"
    }));
    expect(result.summary).toMatchObject({
      totalFiles: 4,
      scannedFiles: 1,
      indexedFiles: 1,
      skippedFiles: 3
    });
    expect(result.summary.skipped).toEqual([
      { documentPath: "notes/readme.md", reason: "non_chemd_markdown" },
      { documentPath: "assets/table.csv", reason: "unsupported_file" },
      { documentPath: "experiments", reason: "directory" }
    ]);
  });

  it("treats document-kind markdown as Chemd markdown", async () => {
    const result = await buildDesktopWorkspaceSymbolIndex({
      workspace,
      files: [
        fileEntry("experiments/protocol.md", { chemdKind: "document" }),
        fileEntry("notes/protocol.md")
      ],
      readFile: () => createSource("rxn-protocol")
    });

    expect(result.summary).toMatchObject({
      scannedFiles: 1,
      indexedFiles: 1,
      skippedFiles: 1
    });
    expect(result.index.symbolIdsByName["rxn-protocol"]).toHaveLength(1);
  });

  it("isolates read and compile failures while indexing healthy files", async () => {
    const result = await buildDesktopWorkspaceSymbolIndex({
      workspace,
      files: [
        fileEntry("experiments/read-fail.chemd.md"),
        fileEntry("experiments/compile-fail.chemd.md"),
        fileEntry("experiments/pass.chemd.md")
      ],
      readFile: (file) => {
        if (file.path.includes("read-fail")) {
          throw new Error("cannot read file");
        }
        return createSource(file.path.includes("compile") ? "rxn-bad" : "rxn-ok");
      },
      compile: (input: DesktopWorkspaceSymbolCompileInput) => {
        if (input.file.path.includes("compile-fail")) {
          throw new Error("compiler unavailable");
        }
        return compileChemdForEditor({
          source: input.source,
          documentUri: input.documentUri
        }, {
          now: () => new Date("2026-05-13T00:00:00.000Z")
        });
      },
      languageServiceDependencies: {
        now: () => new Date("2026-05-13T00:00:00.000Z")
      }
    });

    expect(result.summary).toMatchObject({
      totalFiles: 3,
      scannedFiles: 2,
      indexedFiles: 1,
      failedFiles: 2,
      skippedFiles: 0
    });
    expect(result.summary.errors.map((error) => [
      error.documentPath,
      error.stage,
      error.message
    ])).toEqual([
      ["experiments/read-fail.chemd.md", "read", "cannot read file"],
      ["experiments/compile-fail.chemd.md", "compile", "compiler unavailable"]
    ]);
    expect(result.index.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentUri: "workspace://workspace-alpha/experiments/compile-fail.chemd.md",
        status: "failed",
        symbolCount: 0
      }),
      expect.objectContaining({
        documentUri: "workspace://workspace-alpha/experiments/pass.chemd.md",
        status: "ok",
        symbolCount: 2
      })
    ]));
    expect(result.index.symbolIdsByName["rxn-ok"]).toHaveLength(1);
  });

  it("records failed compile outputs returned by an injected compiler", async () => {
    const result = await buildDesktopWorkspaceSymbolIndex({
      workspace,
      files: [fileEntry("experiments/failed-output.chemd.md")],
      readFile: () => createSource("rxn-failed-output"),
      compile: (input: DesktopWorkspaceSymbolCompileInput) =>
        compileChemdForEditor({
          source: input.source,
          documentUri: input.documentUri
        }, {
          compileChemd: () => {
            throw new Error("returned failed compile output");
          },
          now: () => new Date("2026-05-13T00:00:00.000Z")
        })
    });

    expect(result.summary).toMatchObject({
      scannedFiles: 1,
      indexedFiles: 0,
      failedFiles: 1
    });
    expect(result.summary.errors).toEqual([{
      documentPath: "experiments/failed-output.chemd.md",
      stage: "compile",
      message: "returned failed compile output"
    }]);
  });

  it("supports injected document URI and compile functions", async () => {
    const compile = vi.fn((input: DesktopWorkspaceSymbolCompileInput) =>
      compileChemdForEditor({
        source: input.source,
        documentUri: input.documentUri
      }, {
        now: () => new Date("2026-05-13T00:00:00.000Z")
      }));
    const result = await buildDesktopWorkspaceSymbolIndex({
      workspace,
      files: [fileEntry("nested/space name.chemd.md")],
      readFile: () => createSource("rxn-custom"),
      compile,
      createDocumentUri: (file) => `file:///workspace/${file.path}`
    });

    expect(compile).toHaveBeenCalledWith(expect.objectContaining({
      documentUri: "file:///workspace/nested/space name.chemd.md",
      source: expect.stringContaining("rxn-custom")
    }));
    expect(result.index.documents[0]).toMatchObject({
      documentUri: "file:///workspace/nested/space name.chemd.md",
      status: "ok"
    });
  });
});

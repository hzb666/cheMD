import { describe, expect, it, vi } from "vitest";
import { compileChemdForEditor } from "@chemd/language-service";

import {
  buildWorkspaceSymbolIndex,
  type WorkspaceSymbolCompileInput
} from "./symbol-index";
import type { WorkspaceFileEntry, WorkspaceHandle } from "../contracts";

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

const createSource = (reactionId: string): string => `module exp_${reactionId.replace(/-/g, "_")}

meta {
  id: "${reactionId}"
  title: "${reactionId}"
  date: "2026-05-13"
}

/// Indexed molecule declaration.
molecule mol-main {
  name: "main"
  smiles: "CCO"
}

reaction ${reactionId} {
  reactants: [@mol-main]
  products: [product-main]
}
`;

describe("buildWorkspaceSymbolIndex", () => {
  it("builds a workspace symbol index from readable Chemd files", async () => {
    const files = [
      fileEntry("experiments/a.chemd"),
      fileEntry("experiments/b.chemd")
    ];
    const result = await buildWorkspaceSymbolIndex({
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
        documentUri: "workspace://workspace-alpha/experiments/a.chemd"
      }),
      expect.objectContaining({
        localId: "rxn-b",
        documentUri: "workspace://workspace-alpha/experiments/b.chemd"
      })
    ]));
    expect(result.index.symbolsByKind.reaction.map((symbol) => symbol.localId))
      .toEqual(["rxn-a", "rxn-b"]);
  });

  it("skips legacy .chemd.md files during symbol indexing", async () => {
    const readFile = vi.fn(() => createSource("rxn-legacy"));
    const result = await buildWorkspaceSymbolIndex({
      workspace,
      files: [fileEntry("experiments/legacy.chemd.md")],
      readFile,
      languageServiceDependencies: {
        now: () => new Date("2026-05-13T00:00:00.000Z")
      }
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(result.summary.scannedFiles).toBe(0);
    expect(result.summary.skipped).toEqual([
      { documentPath: "experiments/legacy.chemd.md", reason: "non_chemd_markdown" }
    ]);
    expect(result.index.symbols).toEqual([]);
  });

  it("skips plain markdown and unsupported workspace entries without reading them", async () => {
    const readFile = vi.fn((file: WorkspaceFileEntry) => createSource(file.path));
    const result = await buildWorkspaceSymbolIndex({
      workspace,
      files: [
        fileEntry("experiments/a.chemd"),
        fileEntry("notes/readme.md"),
        fileEntry("assets/table.csv"),
        fileEntry("experiments", { kind: "directory" })
      ],
      readFile
    });

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(expect.objectContaining({
      path: "experiments/a.chemd"
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

  it("skips document-kind markdown when the path is not .chemd", async () => {
    const readFile = vi.fn(() => createSource("rxn-protocol"));
    const result = await buildWorkspaceSymbolIndex({
      workspace,
      files: [
        fileEntry("experiments/protocol.md", { chemdKind: "document" }),
        fileEntry("notes/protocol.md")
      ],
      readFile
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      scannedFiles: 0,
      indexedFiles: 0,
      skippedFiles: 2
    });
    expect(result.index.symbolIdsByName["rxn-protocol"]).toBeUndefined();
  });

  it("isolates read and compile failures while indexing healthy files", async () => {
    const result = await buildWorkspaceSymbolIndex({
      workspace,
      files: [
        fileEntry("experiments/read-fail.chemd"),
        fileEntry("experiments/compile-fail.chemd"),
        fileEntry("experiments/pass.chemd")
      ],
      readFile: (file) => {
        if (file.path.includes("read-fail")) {
          throw new Error("cannot read file");
        }
        return createSource(file.path.includes("compile") ? "rxn-bad" : "rxn-ok");
      },
      compile: (input: WorkspaceSymbolCompileInput) => {
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
      ["experiments/read-fail.chemd", "read", "cannot read file"],
      ["experiments/compile-fail.chemd", "compile", "compiler unavailable"]
    ]);
    expect(result.index.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentUri: "workspace://workspace-alpha/experiments/compile-fail.chemd",
        status: "failed",
        symbolCount: 0
      }),
      expect.objectContaining({
        documentUri: "workspace://workspace-alpha/experiments/pass.chemd",
        status: "ok",
        symbolCount: 4
      })
    ]));
    expect(result.index.symbolIdsByName["rxn-ok"]).toHaveLength(1);
  });

  it("records failed compile outputs returned by an injected compiler", async () => {
    const result = await buildWorkspaceSymbolIndex({
      workspace,
      files: [fileEntry("experiments/failed-output.chemd")],
      readFile: () => createSource("rxn-failed-output"),
      compile: (input: WorkspaceSymbolCompileInput) =>
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
      documentPath: "experiments/failed-output.chemd",
      stage: "compile",
      message: "returned failed compile output"
    }]);
  });

  it("supports injected document URI and compile functions", async () => {
    const compile = vi.fn((input: WorkspaceSymbolCompileInput) =>
      compileChemdForEditor({
        source: input.source,
        documentUri: input.documentUri
      }, {
        now: () => new Date("2026-05-13T00:00:00.000Z")
      }));
    const result = await buildWorkspaceSymbolIndex({
      workspace,
      files: [fileEntry("nested/space name.chemd")],
      readFile: () => createSource("rxn-custom"),
      compile,
      createDocumentUri: (file) => `file:///workspace/${file.path}`
    });

    expect(compile).toHaveBeenCalledWith(expect.objectContaining({
      documentUri: "file:///workspace/nested/space name.chemd",
      source: expect.stringContaining("rxn-custom")
    }));
    expect(result.index.documents[0]).toMatchObject({
      documentUri: "file:///workspace/nested/space name.chemd",
      status: "ok"
    });
  });
});

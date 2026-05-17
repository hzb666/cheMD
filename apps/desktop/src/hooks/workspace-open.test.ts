import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFileEntry } from "../contracts";
import {
  getLoadedDirectoryPathsForRequest,
  mergeWorkspaceChildren,
  resolveInitialWorkspaceFileSource,
} from "./use-workspace-file-controller";

const workspaceDocument: WorkspaceFileEntry = {
  id: "workspace-test:linked/doc.chemd",
  name: "doc.chemd",
  path: "linked/doc.chemd",
  kind: "file",
  chemdKind: "document",
};

describe("workspace open initial file resolution", () => {
  it("keeps the workspace open when the first document cannot be read", async () => {
    const readFile = vi.fn(async () => {
      throw new Error("Workspace file path must stay inside the workspace root");
    });

    const result = await resolveInitialWorkspaceFileSource(
      workspaceDocument,
      readFile,
    );

    expect(readFile).toHaveBeenCalledWith(workspaceDocument.path);
    expect(result.contentHash).toBeNull();
    expect(result.source).toContain("id:");
  });

  it("replaces only the requested directory children in the loaded file list", () => {
    const currentFiles: WorkspaceFileEntry[] = [
      { ...workspaceDocument, path: "src/old.chemd", id: "workspace-test:src/old.chemd" },
      { id: "workspace-test:src", name: "src", path: "src", kind: "directory" },
      { id: "workspace-test:docs", name: "docs", path: "docs", kind: "directory" },
      { id: "workspace-test:docs/readme.md", name: "readme.md", path: "docs/readme.md", kind: "file", chemdKind: "unknown" },
    ];
    const nextChildren: WorkspaceFileEntry[] = [
      { id: "workspace-test:src/new.chemd", name: "new.chemd", path: "src/new.chemd", kind: "file", chemdKind: "document" },
    ];

    const merged = mergeWorkspaceChildren(currentFiles, "src", nextChildren);

    expect(merged.map((file) => file.path)).toEqual([
      "docs",
      "docs/readme.md",
      "src",
      "src/new.chemd",
    ]);
  });

  it("keeps deeper loaded descendants when replacing a bounded directory depth", () => {
    const currentFiles: WorkspaceFileEntry[] = [
      { id: "workspace-test:src", name: "src", path: "src", kind: "directory" },
      { id: "workspace-test:src/deep", name: "deep", path: "src/deep", kind: "directory" },
      { id: "workspace-test:src/deep/already.chemd", name: "already.chemd", path: "src/deep/already.chemd", kind: "file", chemdKind: "document" },
      { id: "workspace-test:src/deep/more", name: "more", path: "src/deep/more", kind: "directory" },
      { id: "workspace-test:src/deep/more/keep.chemd", name: "keep.chemd", path: "src/deep/more/keep.chemd", kind: "file", chemdKind: "document" },
    ];
    const nextChildren: WorkspaceFileEntry[] = [
      { id: "workspace-test:src/deep", name: "deep", path: "src/deep", kind: "directory" },
      { id: "workspace-test:src/fresh.chemd", name: "fresh.chemd", path: "src/fresh.chemd", kind: "file", chemdKind: "document" },
    ];

    const merged = mergeWorkspaceChildren(currentFiles, "src", nextChildren, 2);

    expect(merged.map((file) => file.path)).toEqual([
      "src",
      "src/deep",
      "src/deep/more",
      "src/deep/more/keep.chemd",
      "src/fresh.chemd",
    ]);
  });

  it("marks two-level directory requests as loaded without marking deeper folders", () => {
    const children: WorkspaceFileEntry[] = [
      { id: "workspace-test:src/deep", name: "deep", path: "src/deep", kind: "directory" },
      { id: "workspace-test:src/deep/doc.chemd", name: "doc.chemd", path: "src/deep/doc.chemd", kind: "file", chemdKind: "document" },
      { id: "workspace-test:src/deep/more", name: "more", path: "src/deep/more", kind: "directory" },
    ];

    expect(getLoadedDirectoryPathsForRequest("src", 2, children)).toEqual([
      "src",
      "src/deep",
    ]);
  });
});

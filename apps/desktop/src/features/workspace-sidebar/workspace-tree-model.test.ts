import { describe, expect, it } from "vitest";
import type { WorkspaceFileEntry } from "../../contracts";
import {
  buildWorkspaceTree,
  getSelectedAncestorPaths,
} from "./workspace-tree-model";

const fileEntry = (path: string, name = path.split("/").at(-1) ?? path): WorkspaceFileEntry => ({
  id: `file:${path}`,
  name,
  path,
  kind: "file",
  chemdKind: "document",
});

const directoryEntry = (path: string, name = path.split("/").at(-1) ?? path): WorkspaceFileEntry => ({
  id: `dir:${path}`,
  name,
  path,
  kind: "directory",
});

describe("desktop workspace tree model", () => {
  it("builds nested nodes with directories before files and names sorted case-insensitively", () => {
    const tree = buildWorkspaceTree([
      fileEntry("zeta.chemd.md"),
      fileEntry("src/beta.chemd.md"),
      fileEntry("Alpha.chemd.md"),
      directoryEntry("docs"),
      fileEntry("docs/readme.chemd.md"),
    ]);

    expect(tree.map((node) => node.name)).toEqual([
      "docs",
      "src",
      "Alpha.chemd.md",
      "zeta.chemd.md",
    ]);
    expect(tree[0].children.map((node) => node.name)).toEqual(["readme.chemd.md"]);
    expect(tree[1].children.map((node) => node.name)).toEqual(["beta.chemd.md"]);
  });

  it("returns selected ancestor folder paths for nested files", () => {
    const tree = buildWorkspaceTree([
      fileEntry("src/reactions/suzuki.chemd.md"),
      fileEntry("src/readme.chemd.md"),
    ]);

    expect([...getSelectedAncestorPaths(tree, "file:src/reactions/suzuki.chemd.md")]).toEqual([
      "src",
      "src/reactions",
    ]);
    expect([...getSelectedAncestorPaths(tree, "missing")]).toEqual([]);
  });
});

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
      fileEntry("zeta.chemd"),
      fileEntry("src/beta.chemd"),
      fileEntry("Alpha.chemd"),
      directoryEntry("docs"),
      fileEntry("docs/readme.chemd"),
    ]);

    expect(tree.map((node) => node.name)).toEqual([
      "docs",
      "src",
      "Alpha.chemd",
      "zeta.chemd",
    ]);
    expect(tree[0].children.map((node) => node.name)).toEqual(["readme.chemd"]);
    expect(tree[1].children.map((node) => node.name)).toEqual(["beta.chemd"]);
  });

  it("returns selected ancestor folder paths for nested files", () => {
    const tree = buildWorkspaceTree([
      fileEntry("src/reactions/suzuki.chemd"),
      fileEntry("src/readme.chemd"),
    ]);

    expect([...getSelectedAncestorPaths(tree, "file:src/reactions/suzuki.chemd")]).toEqual([
      "src",
      "src/reactions",
    ]);
    expect([...getSelectedAncestorPaths(tree, "missing")]).toEqual([]);
  });
});

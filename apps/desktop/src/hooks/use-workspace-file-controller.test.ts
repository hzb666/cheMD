import { describe, expect, it } from "vitest";

import type { WorkspaceFileEntry } from "../contracts";
import {
  createScratchFile,
  getNextScratchFileIndex,
  isScratchFile,
} from "../features/workspace/scratch-file";

const workspaceFile = (id: string, name: string): WorkspaceFileEntry => ({
  id,
  name,
  path: `/workspace/${name}`,
  kind: "file",
  chemdKind: "document",
});

describe("scratch editor tabs", () => {
  it("creates untitled file entries outside the workspace path space", () => {
    const file = createScratchFile(4);

    expect(file).toEqual({
      id: "untitled-editor-tab-4",
      name: "Untitled-4.chemd",
      path: "untitled://Untitled-4.chemd",
      kind: "file",
      chemdKind: "document",
    });
    expect(isScratchFile(file)).toBe(true);
  });

  it("increments from the highest open untitled tab without counting workspace files", () => {
    const tabs = [
      workspaceFile("exp-001", "suzuki-screen.chemd"),
      createScratchFile(1),
      workspaceFile("exp-003", "calibration.chemd"),
      createScratchFile(7),
    ];

    expect(getNextScratchFileIndex(tabs)).toBe(8);
  });
});

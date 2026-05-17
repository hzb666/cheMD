import { describe, expect, it } from "vitest";

import {
  buildWorkspaceFileSaveRequest,
  createDirtyWorkspaceFileSignature,
  createWorkspaceSaveSingleFlight,
} from "./workspace-save";

describe("workspace save helpers", () => {
  it("builds a full-content save request for an existing workspace file", () => {
    expect(buildWorkspaceFileSaveRequest({
      workspaceId: "workspace-1",
      path: "doc.chemd",
      content: "alpha\ndelta\ngamma\n",
      baseHash: "fnv1a64:old",
    })).toEqual({
      command: "write_workspace_file",
      input: {
        workspaceId: "workspace-1",
        path: "doc.chemd",
        content: "alpha\ndelta\ngamma\n",
        baseHash: "fnv1a64:old",
      },
    });
  });

  it("omits base hash for a new workspace file full-content save", () => {
    expect(buildWorkspaceFileSaveRequest({
      workspaceId: "workspace-1",
      path: "notes/new.chemd",
      content: "created",
      baseHash: null,
    })).toEqual({
      command: "write_workspace_file",
      input: {
        workspaceId: "workspace-1",
        path: "notes/new.chemd",
        content: "created",
        baseHash: undefined,
      },
    });
  });

  it("changes the dirty signature when the same dirty file content changes", () => {
    const first = createDirtyWorkspaceFileSignature(["doc"], {
      doc: { source: "first" },
    });
    const second = createDirtyWorkspaceFileSignature(["doc"], {
      doc: { source: "second" },
    });

    expect(first).not.toBe(second);
  });

  it("deduplicates overlapping workspace save operations", async () => {
    const runner = createWorkspaceSaveSingleFlight();
    const operations: string[] = [];
    let releaseFirstSave: (() => void) | undefined;
    const firstSaveFinished = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });

    const firstSave = runner.run(async () => {
      operations.push("first");
      await firstSaveFinished;
    });
    const overlappingSave = runner.run(async () => {
      operations.push("overlap");
    });

    expect(overlappingSave).toBe(firstSave);
    expect(operations).toEqual(["first"]);
    releaseFirstSave?.();
    await firstSave;
    await overlappingSave;

    await runner.run(async () => {
      operations.push("next");
    });

    expect(operations).toEqual(["first", "next"]);
  });
});

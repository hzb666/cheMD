import { describe, expect, it } from "vitest";

import type { WorkspaceFileEntry } from "../contracts";
import {
  closeAllEditorSessionTabs,
  closeEditorSessionTab,
  createEditorSession,
  getDirtyEditorSessionFileIds,
  getDirtyWorkspaceEditorSessionFileIds,
  markEditorSessionFileSaved,
  openScratchEditorSessionTab,
  replaceEditorSessionFileContent,
  reorderEditorSessionTabs,
  selectEditorSessionFile,
  updateEditorSessionSource,
} from "./editor-session";

const workspaceFile = (id: string, path = `${id}.chemd`): WorkspaceFileEntry => ({
  id,
  name: path.split("/").at(-1) ?? path,
  path,
  kind: "file",
  chemdKind: "document",
});

describe("editor session model", () => {
  it("marks the selected buffer dirty when source changes", () => {
    const file = workspaceFile("doc");
    const session = updateEditorSessionSource(
      createEditorSession(file, {
        source: "saved",
        savedContentHash: "hash-a",
      }),
      "changed",
    );

    expect(session.source).toBe("changed");
    expect(getDirtyEditorSessionFileIds(session)).toEqual(["doc"]);
  });

  it("selects existing buffers without losing unsaved source", () => {
    const first = workspaceFile("first");
    const second = workspaceFile("second");
    const session = selectEditorSessionFile(
      updateEditorSessionSource(createEditorSession(first, { source: "first" }), "dirty first"),
      second,
      { source: "second", savedContentHash: "hash-second" },
    );
    const selectedAgain = selectEditorSessionFile(session, first, { source: "stale disk" });

    expect(selectedAgain.selectedFileId).toBe("first");
    expect(selectedAgain.source).toBe("dirty first");
    expect(selectedAgain.savedSource).toBe("first");
    expect(getDirtyEditorSessionFileIds(selectedAgain)).toEqual(["first"]);
  });

  it("updates saved source and hash after a successful save", () => {
    const session = markEditorSessionFileSaved(
      updateEditorSessionSource(createEditorSession(workspaceFile("doc"), { source: "old" }), "new"),
      "doc",
      { contentHash: "hash-new", savedAt: "2026-05-17T00:00:00.000Z" },
    );

    expect(session.savedSource).toBe("new");
    expect(session.savedContentHash).toBe("hash-new");
    expect(session.savedAt).toBe("2026-05-17T00:00:00.000Z");
    expect(getDirtyEditorSessionFileIds(session)).toEqual([]);
  });

  it("replaces an existing buffer when a workspace file is reloaded", () => {
    const dirtySession = updateEditorSessionSource(
      createEditorSession(workspaceFile("doc"), {
        source: "old",
        savedContentHash: "hash-old",
      }),
      "local edits",
    );

    const reloaded = replaceEditorSessionFileContent(dirtySession, "doc", {
      source: "disk",
      savedContentHash: "hash-disk",
    });

    expect(reloaded.source).toBe("disk");
    expect(reloaded.savedSource).toBe("disk");
    expect(reloaded.savedContentHash).toBe("hash-disk");
    expect(getDirtyEditorSessionFileIds(reloaded)).toEqual([]);
  });

  it("blocks closing dirty tabs and reports the blocking tab", () => {
    const file = workspaceFile("doc");
    const session = selectEditorSessionFile(
      updateEditorSessionSource(createEditorSession(file, { source: "old" }), "new"),
      workspaceFile("other"),
      { source: "other" },
    );

    const result = closeEditorSessionTab(session, "doc");
    const closeAllResult = closeAllEditorSessionTabs(session);

    expect(result.closed).toBe(false);
    expect(result.blockedTab).toEqual(file);
    expect(closeAllResult.closed).toBe(false);
    expect(closeAllResult.blockedTab).toEqual(file);
  });

  it("creates scratch tabs and filters dirty workspace files", () => {
    const doc = workspaceFile("doc");
    const session = openScratchEditorSessionTab(createEditorSession(doc, { source: "saved" }));
    const dirtyScratch = updateEditorSessionSource(session, "scratch");

    expect(dirtyScratch.selectedFileId).toBe("untitled-editor-tab-1");
    expect(getDirtyEditorSessionFileIds(dirtyScratch)).toEqual(["untitled-editor-tab-1"]);
    expect(getDirtyWorkspaceEditorSessionFileIds(dirtyScratch, [doc], true)).toEqual([]);
  });

  it("reorders tabs only when ids match the current tab set", () => {
    const first = workspaceFile("first");
    const second = workspaceFile("second");
    const session = selectEditorSessionFile(
      createEditorSession(first, { source: "first" }),
      second,
      { source: "second" },
    );

    expect(reorderEditorSessionTabs(session, ["second", "first"]).openedTabs.map((tab) => tab.id))
      .toEqual(["second", "first"]);
    expect(reorderEditorSessionTabs(session, ["missing"]).openedTabs.map((tab) => tab.id))
      .toEqual(["first", "second"]);
  });
});

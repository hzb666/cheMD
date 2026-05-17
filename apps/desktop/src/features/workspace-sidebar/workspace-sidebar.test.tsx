import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFileEntry } from "../../contracts";
import type { InsightPaneProps } from "../../types";
import { ReferenceExplorer } from "./workspace-sidebar";

const fileEntry = (path: string, name = path.split("/").at(-1) ?? path): WorkspaceFileEntry => ({
  id: `file:${path}`,
  name,
  path,
  kind: "file",
  chemdKind: "document",
});

const renderExplorer = (props: Partial<Parameters<typeof ReferenceExplorer>[0]> = {}) =>
  renderToStaticMarkup(
    <ReferenceExplorer
      activeTool="files"
      files={[]}
      selectedFileId=""
      mode="sample"
      message=""
      visible
      workspaceName="No workspace"
      workspaceState="empty"
      insightProps={{} as InsightPaneProps}
      onOpenWorkspace={vi.fn()}
      onSelectFile={vi.fn()}
      {...props}
    />,
  );

describe("ReferenceExplorer", () => {
  it("marks the workspace picker as unavailable and busy while opening", () => {
    const html = renderExplorer({
      workspaceState: "opening",
      message: "Workspace is loading.",
    });

    expect(html).toContain("Opening workspace");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("aria-busy=\"true\"");
  });

  it("renders the selected workspace file in an expanded tree with aria levels", () => {
    const html = renderExplorer({
      mode: "workspace",
      workspaceState: "open",
      workspaceName: "Lab Workspace",
      selectedFileId: "file:experiments/run-a/main.chemd",
      files: [
        fileEntry("experiments/run-a/main.chemd"),
        fileEntry("notes.chemd"),
      ],
    });

    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-label="Workspace files"');
    expect(html).toContain("experiments");
    expect(html).toContain("run-a");
    expect(html).toContain("main.chemd");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-level="3"');
    expect(html).toContain("Lab Workspace");
  });
});

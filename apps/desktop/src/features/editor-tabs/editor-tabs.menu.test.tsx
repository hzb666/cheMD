import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFileEntry } from "../../contracts";
import { EditorTabActionsMenu } from "./editor-tabs.menu";

const fileEntry = (id: string, name: string, path = `experiments/${name}`): WorkspaceFileEntry => ({
  id,
  name,
  path,
  kind: "file",
  chemdKind: "document"
});

const renderMenu = ({
  tabs = [fileEntry("doc-a", "alpha.chemd"), fileEntry("doc-b", "beta.chemd")],
  filteredTabs = tabs,
  selectedFileId = "doc-a",
}: {
  tabs?: readonly WorkspaceFileEntry[];
  filteredTabs?: readonly WorkspaceFileEntry[];
  selectedFileId?: string;
} = {}) => renderToStaticMarkup(
  <EditorTabActionsMenu
    tabs={tabs}
    filteredTabs={filteredTabs}
    selectedFileId={selectedFileId}
    tabQuery=""
    menuActions={[{
      id: "terminal",
      label: "Terminal",
      active: true,
      onSelect: vi.fn()
    }]}
    onTabQueryChange={vi.fn()}
    onSelectFile={vi.fn()}
    onCloseFileTab={vi.fn()}
    onCloseAllFileTabs={vi.fn()}
    onClose={vi.fn()}
  />
);

describe("EditorTabActionsMenu", () => {
  it("renders filtered tabs, active tab state, workbench actions, and close commands", () => {
    const html = renderMenu({
      filteredTabs: [fileEntry("doc-b", "beta.chemd")],
      selectedFileId: "doc-b"
    });

    expect(html).toContain('role="menu"');
    expect(html).toContain("Search tabs");
    expect(html).not.toContain("alpha.chemd");
    expect(html).toContain("beta.chemd");
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Terminal");
    expect(html).toContain("Close all tabs");
  });

  it("disables close all when there are no open tabs", () => {
    const html = renderMenu({ tabs: [], filteredTabs: [], selectedFileId: "" });

    expect(html).toContain("Close all tabs");
    expect(html).toContain("disabled");
  });
});

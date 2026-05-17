import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFileEntry } from "../../contracts";
import { referenceBottomPanelDomId } from "./bottom-panel";

vi.mock("../../../../../vision/logo-01.svg?url", () => ({
  default: "/vision/logo-01.svg",
}));
vi.mock("../../../../../vision/logo-02.svg?url", () => ({
  default: "/vision/logo-02.svg",
}));

import {
  ReferenceActivityRail,
  ReferenceBrandLogo,
  ReferenceGlobalHeaderActions,
  ReferenceTabBar,
} from "./window-chrome";

const fileEntry = (id: string, name: string): WorkspaceFileEntry => ({
  id,
  name,
  path: `experiments/${name}`,
  kind: "file",
  chemdKind: "document",
});

describe("ReferenceActivityRail", () => {
  it("renders primary tools with the active tool pressed and preserves the settings control", () => {
    const html = renderToStaticMarkup(
      <ReferenceActivityRail
        activeTool="graph"
        settingsDialog={<button type="button">Settings</button>}
        onSelectTool={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Primary tools"');
    expect(html).toContain('aria-label="Files"');
    expect(html).toContain('aria-label="Reaction Graph"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Settings");
  });
});

describe("ReferenceBrandLogo", () => {
  it("renders separate light and dark theme logo assets", () => {
    const html = renderToStaticMarkup(<ReferenceBrandLogo />);

    expect(html).toContain("logo-01.svg");
    expect(html).toContain("logo-02.svg");
    expect(html).toContain("dark:hidden");
    expect(html).toContain("dark:block");
  });
});

describe("ReferenceTabBar", () => {
  it("renders open editor tabs with dirty and selected states plus window controls", () => {
    const html = renderToStaticMarkup(
      <ReferenceTabBar
        openedTabs={[
          fileEntry("doc-a", "alpha.chemd"),
          fileEntry("doc-b", "beta.chemd"),
        ]}
        dirtyFileIds={["doc-b"]}
        selectedFileId="doc-b"
        sidebarVisible={false}
        bottomPanel="terminal"
        onToggleTerminal={vi.fn()}
        onSelectFile={vi.fn()}
        onCloseFileTab={vi.fn()}
        onCloseAllFileTabs={vi.fn()}
        onReorderFileTabs={vi.fn()}
        onOpenNewTab={vi.fn()}
      />,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Open editor tabs"');
    expect(html).toContain("alpha.chemd");
    expect(html).toContain("beta.chemd");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-label="Unsaved changes"');
    expect(html).toContain('aria-label="Open new tab"');
    expect(html).toContain('aria-label="Minimize window"');
    expect(html).toContain('aria-label="Maximize window"');
    expect(html).toContain('aria-label="Close window"');
  });
});

describe("ReferenceGlobalHeaderActions", () => {
  it("links the active terminal toggle to the bottom panel region", () => {
    const html = renderToStaticMarkup(
      <ReferenceGlobalHeaderActions
        bottomPanel="terminal"
        onToggleTerminal={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Toggle terminal panel"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(`aria-controls="${referenceBottomPanelDomId}"`);
  });
});

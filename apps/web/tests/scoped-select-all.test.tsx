import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeTextToClipboard } from "../src/lib/write-text-to-clipboard";
import { EditorShell } from "../src/features/editor/components/EditorShell";

const usePreviewShellControllerMock = vi.fn();

vi.mock("../src/features/preview/hooks/usePreviewShellController", () => ({
  usePreviewShellController: (...args: unknown[]) => usePreviewShellControllerMock(...args)
}));

import PreviewShell from "../src/features/preview/components/PreviewShell";

describe("panel copy actions", () => {
  beforeEach(() => {
    usePreviewShellControllerMock.mockReset();
    usePreviewShellControllerMock.mockReturnValue({
      activeTab: "preview",
      setActiveTab: vi.fn(),
      previewFrameRef: { current: null },
      hydratedHtml: "<p>preview</p>",
      activeCode: '{"ok":true}'
    });
  });

  it("renders an icon copy button in the editor header", () => {
    const html = renderToStaticMarkup(
      <EditorShell
        source={"line 1\nline 2"}
        lineCount={2}
        profileId="eln-default"
        onSourceChange={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Copy editor source"');
    expect(html).toContain('data-copy-button="true"');
  });

  it("shows the preview copy button only when the JSON tab is active", () => {
    const previewHtml = renderToStaticMarkup(
      <PreviewShell
        html="<p>preview</p>"
        json='{"ok":true}'
        docxBridge='{"docx":true}'
        source="source"
      />
    );

    expect(previewHtml).not.toContain('aria-label="Copy JSON output"');

    usePreviewShellControllerMock.mockReturnValueOnce({
      activeTab: "json",
      setActiveTab: vi.fn(),
      previewFrameRef: { current: null },
      hydratedHtml: "<p>preview</p>",
      activeCode: '{"ok":true}'
    });

    const jsonHtml = renderToStaticMarkup(
      <PreviewShell
        html="<p>preview</p>"
        json='{"ok":true}'
        docxBridge='{"docx":true}'
        source="source"
      />
    );

    expect(jsonHtml).toContain('aria-label="Copy JSON output"');
    expect(jsonHtml).toContain('data-copy-button="true"');
  });

  it("writes text through the async clipboard API when available", async () => {
    const writeText = vi.fn(async () => undefined);
    const originalNavigator = globalThis.navigator;

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText
        }
      }
    });

    try {
      await writeTextToClipboard('{"ok":true}');
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator
      });
    }

    expect(writeText).toHaveBeenCalledWith('{"ok":true}');
  });
});

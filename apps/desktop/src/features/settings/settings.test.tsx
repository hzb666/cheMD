import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultSettings, type AppSettings, useSettings } from "./settings";

const storageKey = "chemd.desktop.settings.v1";

const readSettingsSnapshot = (): AppSettings => {
  let snapshot: AppSettings | null = null;

  function SettingsProbe() {
    snapshot = useSettings().settings;
    return null;
  }

  renderToStaticMarkup(<SettingsProbe />);

  if (!snapshot) {
    throw new Error("Settings probe did not render.");
  }
  return snapshot;
};

const stubStoredSettings = (settings: unknown) => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) =>
        key === storageKey ? JSON.stringify(settings) : null
      ),
      setItem: vi.fn()
    }
  });
};

describe("useSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores the persisted auto-save mode", () => {
    stubStoredSettings({
      ...defaultSettings,
      autoSaveMode: "onFocusLost"
    });

    expect(readSettingsSnapshot().autoSaveMode).toBe("onFocusLost");
  });

  it("sanitizes invalid persisted settings while keeping valid workspace preferences", () => {
    stubStoredSettings({
      theme: "dark",
      density: "dense",
      editorFontSize: 99,
      wordWrap: true,
      minimap: "yes",
      lineNumbers: "relative",
      autoSaveMode: "always",
      restoreLastWorkspace: true,
      lastWorkspacePath: "D:/Code/chemd",
      compileDebounceMs: "80",
      sidecarAutostart: true
    });

    expect(readSettingsSnapshot()).toEqual({
      ...defaultSettings,
      theme: "dark",
      editorFontSize: 18,
      wordWrap: true,
      restoreLastWorkspace: true,
      lastWorkspacePath: "D:/Code/chemd",
      compileDebounceMs: 100,
      sidecarAutostart: true
    });
  });
});

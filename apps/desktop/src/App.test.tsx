import { describe, expect, it } from "vitest";

import {
  isWorkspaceSaveShortcut,
  shouldRunImmediateWorkspaceAutoSave,
  shouldScheduleDelayedAutoSave,
} from "./App";

describe("desktop auto-save scheduling", () => {
  it("only schedules delayed saves when the setting explicitly allows delay auto-save", () => {
    expect(shouldScheduleDelayedAutoSave("afterDelay", "doc:hash")).toBe(true);
    expect(shouldScheduleDelayedAutoSave("off", "doc:hash")).toBe(false);
    expect(shouldScheduleDelayedAutoSave("onFocusLost", "doc:hash")).toBe(false);
    expect(shouldScheduleDelayedAutoSave("afterDelay", "")).toBe(false);
  });

  it("runs immediate workspace auto-save for dirty files unless auto-save is off", () => {
    expect(shouldRunImmediateWorkspaceAutoSave("afterDelay", "doc:hash")).toBe(true);
    expect(shouldRunImmediateWorkspaceAutoSave("onFocusLost", "doc:hash")).toBe(true);
    expect(shouldRunImmediateWorkspaceAutoSave("off", "doc:hash")).toBe(false);
    expect(shouldRunImmediateWorkspaceAutoSave("afterDelay", "")).toBe(false);
  });

  it("detects plain Ctrl or Command save shortcuts", () => {
    expect(isWorkspaceSaveShortcut({ key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isWorkspaceSaveShortcut({ key: "S", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isWorkspaceSaveShortcut({ key: "s", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false })).toBe(false);
    expect(isWorkspaceSaveShortcut({ key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe(false);
    expect(isWorkspaceSaveShortcut({ key: "p", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(false);
  });
});

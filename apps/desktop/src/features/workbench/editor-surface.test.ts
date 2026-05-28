import { describe, expect, it } from "vitest";

import {
  clampBottomPanelHeight,
  DEFAULT_BOTTOM_PANEL_HEIGHT,
} from "./use-reference-bottom-panel-resize";

import {
  clampPreviewWidthPercent,
  countSourceLines,
  formatStatusClockTime,
  getDelayUntilNextMinute,
  getEditorBreadcrumbItems,
  isBottomPanelToggleActive,
} from "./editor-surface";

describe("editor status clock", () => {
  it("formats the current time without seconds", () => {
    const formatted = formatStatusClockTime(new Date("2026-05-17T09:08:07.000"));

    expect(formatted).not.toContain(":07");
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it("schedules the next update at the next minute boundary", () => {
    expect(getDelayUntilNextMinute(new Date("2026-05-17T09:08:07.250"))).toBe(52_750);
    expect(getDelayUntilNextMinute(new Date("2026-05-17T09:08:00.000"))).toBe(60_000);
  });
});

describe("editor preview sizing", () => {
  it("keeps the preview pane within useful resize bounds", () => {
    expect(clampPreviewWidthPercent(12)).toBe(28);
    expect(clampPreviewWidthPercent(40)).toBe(40);
    expect(clampPreviewWidthPercent(80)).toBe(62);
  });
});

describe("editor source metrics", () => {
  it("counts source lines without splitting the full document", () => {
    expect(countSourceLines("")).toBe(1);
    expect(countSourceLines("a\nb\n")).toBe(3);
    expect(countSourceLines("a\r\nb")).toBe(2);
    expect(countSourceLines("a\rb")).toBe(2);
  });
});

describe("editor bottom panel toggle", () => {
  it("stays active for any open bottom panel tab", () => {
    expect(isBottomPanelToggleActive(null)).toBe(false);
    expect(isBottomPanelToggleActive("diagnostics")).toBe(true);
    expect(isBottomPanelToggleActive("terminal")).toBe(true);
    expect(isBottomPanelToggleActive("runtime")).toBe(true);
    expect(isBottomPanelToggleActive("storage")).toBe(true);
  });
});

describe("editor bottom panel sizing", () => {
  it("keeps the draggable bottom panel within useful vertical bounds", () => {
    expect(DEFAULT_BOTTOM_PANEL_HEIGHT).toBe(280);
    expect(clampBottomPanelHeight(120, 900)).toBe(160);
    expect(clampBottomPanelHeight(300, 900)).toBe(300);
    expect(clampBottomPanelHeight(800, 900)).toBe(520);
    expect(clampBottomPanelHeight(400, 480)).toBe(345);
  });
});

describe("editor breadcrumbs", () => {
  it("includes nested Chemd declaration labels for the active cursor line", () => {
    const source = `procedure proc-main {
  step s-heat = heat(duration: 2 h)
}
`;

    expect(getEditorBreadcrumbItems(source, 2, "run.chemd")).toEqual([
      "run.chemd",
      "procedure proc-main",
      "step s-heat",
    ]);
  });
});

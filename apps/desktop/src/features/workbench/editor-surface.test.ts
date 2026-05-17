import { describe, expect, it } from "vitest";

import { clampPreviewWidthPercent, formatStatusClockTime, getDelayUntilNextMinute } from "./editor-surface";

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

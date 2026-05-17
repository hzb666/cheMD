import { afterEach, describe, expect, it } from "vitest";

import {
  getDesktopPerformanceSnapshot,
  measureDesktopPerformance,
  measureDesktopPerformanceAsync,
  resetDesktopPerformanceMetrics,
} from "./performance-marks";

const perfGlobal = globalThis as typeof globalThis & {
  __CHEMD_DESKTOP_PERF_ENABLED__?: boolean;
};

describe("desktop performance marks", () => {
  afterEach(() => {
    perfGlobal.__CHEMD_DESKTOP_PERF_ENABLED__ = false;
    resetDesktopPerformanceMetrics();
  });

  it("records synchronous measurements when explicitly enabled", () => {
    perfGlobal.__CHEMD_DESKTOP_PERF_ENABLED__ = true;

    const result = measureDesktopPerformance("test.sync", () => "ok", {
      documentCount: 2,
    });
    const snapshot = getDesktopPerformanceSnapshot();

    expect(result).toBe("ok");
    expect(snapshot.metrics).toHaveLength(1);
    expect(snapshot.metrics[0]).toMatchObject({
      name: "test.sync",
      metadata: { documentCount: 2 },
    });
    expect(snapshot.summary["test.sync"]).toMatchObject({
      count: 1,
    });
  });

  it("records asynchronous measurements when explicitly enabled", async () => {
    perfGlobal.__CHEMD_DESKTOP_PERF_ENABLED__ = true;

    const result = await measureDesktopPerformanceAsync("test.async", async () => 42);
    const snapshot = getDesktopPerformanceSnapshot();

    expect(result).toBe(42);
    expect(snapshot.metrics[0]?.name).toBe("test.async");
    expect(snapshot.summary["test.async"].count).toBe(1);
  });
});

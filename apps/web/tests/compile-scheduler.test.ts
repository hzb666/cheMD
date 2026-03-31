import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPILE_DEBOUNCE_MS,
  createCompileScheduler
} from "../src/features/editor/lib/compile-scheduler";

describe("createCompileScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces repeated compile requests and only runs the latest one", async () => {
    vi.useFakeTimers();

    const compile = vi.fn((input: string) => input);
    const completed: string[] = [];
    const scheduler = createCompileScheduler(compile, { delayMs: 120 });

    scheduler.schedule("first", (result) => completed.push(result));
    scheduler.schedule("second", (result) => completed.push(result));

    await vi.advanceTimersByTimeAsync(119);
    expect(compile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledWith("second");
    expect(completed).toEqual(["second"]);
  });

  it("cancels pending compilation work", async () => {
    vi.useFakeTimers();

    const compile = vi.fn((input: string) => input);
    const onComplete = vi.fn();
    const scheduler = createCompileScheduler(compile, { delayMs: 80 });

    scheduler.schedule("first", onComplete);
    scheduler.cancel();

    await vi.advanceTimersByTimeAsync(80);

    expect(compile).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("exposes the default debounce used by the playground", () => {
    expect(DEFAULT_COMPILE_DEBOUNCE_MS).toBeGreaterThan(0);
  });
});

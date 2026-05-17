import { describe, expect, it } from "vitest";

import {
  createPreviewRenderCacheKey,
  createPreviewRenderScheduler,
} from "./use-rendered-preview";

describe("desktop preview render scheduling", () => {
  it("builds stable cache keys from render input and options", () => {
    const left = createPreviewRenderCacheKey({
      type: "molecule",
      smiles: "CCO",
      renderOptions: {
        export: { transparentBackground: true },
        structure: { backgroundColor: "#00000000" },
      },
    });
    const right = createPreviewRenderCacheKey({
      smiles: "CCO",
      type: "molecule",
      renderOptions: {
        structure: { backgroundColor: "#00000000" },
        export: { transparentBackground: true },
      },
    });

    expect(left).toBe(right);
  });

  it("limits concurrent render tasks", async () => {
    const flushQueue = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };
    const schedule = createPreviewRenderScheduler(2);
    let active = 0;
    let maxActive = 0;
    const resolvers: Array<() => void> = [];
    const task = (value: number) => schedule(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      active -= 1;
      return value;
    });

    const results = Promise.all([task(1), task(2), task(3)]);
    expect(maxActive).toBe(2);
    resolvers.shift()?.();
    await flushQueue();
    expect(maxActive).toBe(2);
    while (resolvers.length > 0) {
      resolvers.shift()?.();
      await flushQueue();
    }

    await expect(results).resolves.toEqual([1, 2, 3]);
    expect(maxActive).toBe(2);
  });

  it("continues queued render tasks after a rejected task", async () => {
    const schedule = createPreviewRenderScheduler(1);
    const calls: string[] = [];
    const failed = schedule(async () => {
      calls.push("failed");
      throw new Error("render failed");
    });
    const recovered = schedule(async () => {
      calls.push("recovered");
      return "ok";
    });

    await expect(failed).rejects.toThrow("render failed");
    await expect(recovered).resolves.toBe("ok");
    expect(calls).toEqual(["failed", "recovered"]);
  });
});

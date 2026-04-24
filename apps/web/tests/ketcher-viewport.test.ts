import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_KETCHER_ZOOM,
  syncKetcherViewport
} from "../src/features/chem-editor/lib/ketcher-viewport";

describe("syncKetcherViewport", () => {
  it("resets ketcher viewport to the fixed editing zoom and recenters the structure", () => {
    const zoom = vi.fn((value?: number) => (typeof value === "number" ? value : 0.42));
    const centerStruct = vi.fn();

    syncKetcherViewport({
      editor: {
        zoom,
        centerStruct
      }
    });

    expect(zoom).toHaveBeenNthCalledWith(1);
    expect(zoom).toHaveBeenNthCalledWith(2, DEFAULT_KETCHER_ZOOM);
    expect(centerStruct).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no editor viewport API is available", () => {
    expect(() => syncKetcherViewport({ editor: undefined })).not.toThrow();
  });
});

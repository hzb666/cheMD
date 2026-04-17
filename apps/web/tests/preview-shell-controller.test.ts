import { afterEach, describe, expect, it, vi } from "vitest";

import { handleInventoryHover } from "../src/features/preview/hooks/usePreviewShellController";

const createPreviewFrame = () => {
  const previewWindow = {
    postMessage: vi.fn()
  };

  return {
    frame: { contentWindow: previewWindow } as unknown as HTMLIFrameElement,
    postMessage: previewWindow.postMessage
  };
};

describe("usePreviewShellController inventory helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts async inventory results to the current preview frame", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => fetchPromise));

    const firstFrame = createPreviewFrame();
    const secondFrame = createPreviewFrame();
    let currentFrame = firstFrame.frame;

    const lookup = handleInventoryHover(
      {
        type: "molecule",
        blockId: "mol-1",
        smiles: "CCO"
      },
      {
        getPreviewFrame: () => currentFrame,
        previewBridgeToken: "preview-token",
        inventoryCache: new Map(),
        inventoryPending: new Map()
      }
    );

    expect(firstFrame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ state: "loading" }),
      "null"
    );

    currentFrame = secondFrame.frame;
    resolveFetch({
      ok: true,
      json: async () => ({
        type: "molecule",
        item: {
          notation: "CCO",
          displayName: "Ethanol",
          casNumber: "64-17-5",
          inventory: null
        }
      })
    } as Response);

    await lookup;

    expect(firstFrame.postMessage).toHaveBeenCalledTimes(1);
    expect(secondFrame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ state: "ready", blockId: "mol-1" }),
      "null"
    );
  });
});

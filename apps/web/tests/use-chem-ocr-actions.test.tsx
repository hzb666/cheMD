import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { useChemOcrActions } from "../src/features/ocr/hooks/useChemOcrActions";

interface HookResult {
  ocrBusy: boolean;
  applyMoleculeOcrFile: (file: File) => void;
  applyReactionOcrFile: (file: File) => void;
}

class HookResultCapture extends Error {
  constructor(readonly hookResult: HookResult) {
    super("hook result captured");
  }
}

const renderHook = (
  params: Parameters<typeof useChemOcrActions>[0]
): HookResult => {
  const TestComponent = () => {
    throw new HookResultCapture(useChemOcrActions(params));
  };

  try {
    renderToStaticMarkup(React.createElement(TestComponent));
  } catch (error) {
    if (error instanceof HookResultCapture) {
      return error.hookResult;
    }
  }

  throw new Error("failed to render test hook");
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("useChemOcrActions", () => {
  it("surfaces a molecule OCR failure even before the hook error state updates", async () => {
    const setEditorStatus = vi.fn();
    const hook = renderHook({
      moleculeOcr: {
        loading: false,
        error: null,
        runOcr: vi.fn().mockResolvedValue(null)
      },
      reactionOcr: {
        loading: false,
        error: null,
        runOcr: vi.fn()
      },
      setEditorStatus
    });

    hook.applyMoleculeOcrFile(new File(["molecule"], "molecule.png", { type: "image/png" }));
    await flushMicrotasks();

    expect(setEditorStatus).toHaveBeenCalledWith("OCR failed");
  });

  it("surfaces a reaction OCR failure even before the hook error state updates", async () => {
    const setEditorStatus = vi.fn();
    const hook = renderHook({
      moleculeOcr: {
        loading: false,
        error: null,
        runOcr: vi.fn()
      },
      reactionOcr: {
        loading: false,
        error: null,
        runOcr: vi.fn().mockResolvedValue(null)
      },
      setEditorStatus
    });

    hook.applyReactionOcrFile(new File(["reaction"], "reaction.png", { type: "image/png" }));
    await flushMicrotasks();

    expect(setEditorStatus).toHaveBeenCalledWith("Reaction OCR failed");
  });
});

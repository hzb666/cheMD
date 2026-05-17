import { describe, expect, it, vi } from "vitest";

vi.mock("@monaco-editor/react", () => ({
  Editor: () => null,
  loader: {
    config: vi.fn()
  }
}));

vi.mock("monaco-editor/esm/vs/editor/editor.api.js", () => ({}));

vi.mock("monaco-editor/esm/vs/editor/editor.worker?worker", () => ({
  default: class MonacoWorkerStub {}
}));

import {
  isSameChemdDocumentPath,
  resolveMonacoSourceJumpSelection
} from "./monaco-chemd-editor";

const model = {
  getLineCount: () => 20,
  getLineMaxColumn: (lineNumber: number) => {
    const columns: Record<number, number> = {
      4: 18,
      5: 12,
      7: 24
    };
    return columns[lineNumber] ?? 10;
  },
  getPositionAt: (offset: number) => {
    const positions: Record<number, { lineNumber: number; column: number }> = {
      100: { lineNumber: 12, column: 1 },
      180: { lineNumber: 16, column: 5 },
      240: { lineNumber: 18, column: 7 }
    };
    return positions[offset] ?? { lineNumber: 1, column: 1 };
  }
};

describe("MonacoChemdEditor source jump helpers", () => {
  it("matches current document paths across workspace-relative source refs", () => {
    expect(isSameChemdDocumentPath(
      "experiments/map.chemd",
      "/workspace/experiments/map.chemd"
    )).toBe(true);
    expect(isSameChemdDocumentPath(
      "chemd://desktop/experiments/map.chemd",
      "experiments/map.chemd"
    )).toBe(true);
  });

  it("rejects source refs that point to another document", () => {
    expect(isSameChemdDocumentPath(
      "experiments/other.chemd",
      "/workspace/experiments/map.chemd"
    )).toBe(false);
  });

  it("prefers source offsets when selecting a source-ref range", () => {
    expect(resolveMonacoSourceJumpSelection(model, {
      startLine: 12,
      endLine: 16,
      startOffset: 100,
      endOffset: 180
    })).toEqual({
      startLineNumber: 12,
      startColumn: 1,
      endLineNumber: 16,
      endColumn: 5
    });
  });

  it("falls back to line selection and clamps invalid line ranges", () => {
    expect(resolveMonacoSourceJumpSelection(model, {
      startLine: 4,
      endLine: 5,
      startColumn: 2
    })).toEqual({
      startLineNumber: 4,
      startColumn: 2,
      endLineNumber: 5,
      endColumn: 12
    });
  });
});

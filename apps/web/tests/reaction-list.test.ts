import { describe, expect, it } from "vitest";

import {
  formatReactionListForEditor,
  parseReactionListFromEditor
} from "../src/features/reaction-editor/lib/reaction-list";

describe("reaction list helpers", () => {
  it("formats reaction arrays into multi-line editor text", () => {
    expect(formatReactionListForEditor(["CCO", "O=O", "H2O"])).toBe("CCO\nO=O\nH2O");
  });

  it("parses multi-line and pipe-separated editor input into normalized arrays", () => {
    expect(parseReactionListFromEditor(" CCO | O=O \n H2O \n\n")).toEqual(["CCO", "O=O", "H2O"]);
  });
});

import { compileChemdForEditor } from "@chemd/language-service";
import { describe, expect, it } from "vitest";

import {
  createChemdDocumentSemanticTokensProvider,
  createChemdSelectionRanges,
  cleanupChemdSemanticTokenOutput,
  updateChemdSemanticTokenOutput,
} from "./semantic-tokens";

const source = `:::procedure #proc-main
ref: rxn-main
:::step s-heat
duration: 4 h
:::
:::
`;

describe("Chemd Monaco semantic token providers", () => {
  it("serves compiled semantic tokens through Monaco encoded token data", () => {
    const documentUri = "chemd://desktop/experiments/semantic.chemd";
    const output = compileChemdForEditor({ source, documentUri });
    updateChemdSemanticTokenOutput(documentUri, output);

    const provider = createChemdDocumentSemanticTokensProvider();
    const result = provider.provideDocumentSemanticTokens(
      { uri: { toString: () => documentUri }, getValue: () => source } as never,
      null,
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) }
    ) as { data: Uint32Array };

    expect(provider.getLegend().tokenTypes).toContain("variable");
    expect(result).toMatchObject({ data: expect.any(Uint32Array) });
    expect(Array.from(result.data).length).toBeGreaterThan(0);

    cleanupChemdSemanticTokenOutput(documentUri, output);
  });

  it("builds block-aware selection ranges from Chemd structure", () => {
    const ranges = createChemdSelectionRanges(source, {
      lineNumber: 4,
      column: 5,
    });

    expect(ranges).toEqual([
      { range: { startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 14 } },
      { range: { startLineNumber: 3, startColumn: 1, endLineNumber: 5, endColumn: 4 } },
      { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 6, endColumn: 4 } },
    ]);
  });
});

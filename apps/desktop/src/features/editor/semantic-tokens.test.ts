import { compileChemdForEditor } from "@chemd/language-service";
import { describe, expect, it } from "vitest";

import {
  createChemdDocumentSemanticTokensProvider,
  createChemdSelectionRanges,
  cleanupChemdSemanticTokenOutput,
  updateChemdSemanticTokenOutput,
} from "./semantic-tokens";

const source = `molecule mol_main {
  smiles: "CCO"
}

reaction rxn_main {
  reactants: [@mol_main]
  products: ["CC=O"]
}

procedure proc_main for @rxn_main {
  step s_heat = heat(duration = "4 h")
}
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
      lineNumber: 10,
      column: 5,
    });

    expect(ranges).toEqual([
      { range: { startLineNumber: 10, startColumn: 1, endLineNumber: 10, endColumn: 36 } },
      { range: { startLineNumber: 10, startColumn: 1, endLineNumber: 12, endColumn: 2 } },
    ]);
  });
});

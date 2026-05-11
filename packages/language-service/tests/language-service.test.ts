import { describe, expect, it } from "vitest";

import {
  compileChemdForEditor,
  toMonacoCodeActions,
  toMonacoMarker
} from "../src/index";

const source = `---
id: exp-language-service
title: Language service
date: 2026-05-12
---

:::chemd #mol-main
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: mol-main
products: product-main
:::

:::result #res-main
status: success
yield: 78%
:::
`;

describe("compileChemdForEditor", () => {
  it("maps compiler diagnostics and exposes patch proposals", () => {
    const output = compileChemdForEditor({
      source,
      options: { strictChemdKind: true }
    });

    expect(output.status).toBe("ok");
    const diagnostic = output.diagnostics.find((item) =>
      item.code === "W_CHEMD_KIND_AMBIGUOUS"
    );

    expect(diagnostic).toMatchObject({
      code: "W_CHEMD_KIND_AMBIGUOUS",
      severity: "warning",
      sourceNodeId: "mol-main"
    });
    expect(diagnostic?.quickFixes[0]).toMatchObject({
      diagnosticCode: "W_CHEMD_KIND_AMBIGUOUS",
      patch: {
        beforeHash: expect.any(String),
        edits: [expect.objectContaining({
          replacement: expect.stringContaining("kind: molecule")
        })]
      }
    });
  });

  it("builds outline, symbols, and Monaco payloads without Monaco dependency", () => {
    const output = compileChemdForEditor({ source });

    expect(output.status).toBe("ok");
    expect(output.outline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "metadata", label: "Language service" }),
      expect.objectContaining({ id: "rxn-main", kind: "reaction" }),
      expect.objectContaining({ id: "res-main", kind: "result" })
    ]));
    expect(output.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "rxn-main", kind: "reaction" }),
      expect.objectContaining({ id: "res-main", kind: "result" })
    ]));

    const warning = output.diagnostics.find((item) => item.severity === "warning");
    expect(warning ? toMonacoMarker(warning).severity : undefined).toBe(4);
    expect(warning ? toMonacoCodeActions(warning) : []).toEqual(expect.any(Array));
  });

  it("returns stable failed output when compile throws", () => {
    const output = compileChemdForEditor(
      { source },
      {
        compileChemd: () => {
          throw new Error("compiler unavailable");
        },
        now: () => new Date("2026-05-12T00:00:00.000Z")
      }
    );

    expect(output).toMatchObject({
      status: "failed",
      compiledAt: "2026-05-12T00:00:00.000Z",
      diagnostics: [{
        code: "LS_COMPILE_FAILED",
        severity: "error",
        message: "compiler unavailable"
      }],
      error: {
        code: "LS_COMPILE_FAILED",
        message: "compiler unavailable"
      }
    });
  });
});

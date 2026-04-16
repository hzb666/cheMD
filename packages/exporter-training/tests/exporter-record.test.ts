import { describe, expect, it } from "vitest";

import { buildLnf } from "@chemd/lnf";
import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import { exportTrainingRecordFromDocument } from "../src/index";

describe("training export", () => {
  it("includes v0.3 LNF and procedure lowering pairs when provided", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export
title: Export test
date: 2026-04-17
---

:::procedure #proc-main
1. 冷却至 0 °C。
:::
`));
    const checked = typecheckDocument(document);
    const lnf = buildLnf({
      document,
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      diagnostics: checked.diagnostics
    });
    const record = exportTrainingRecordFromDocument(document, {
      stepGraph: checked.stepGraph,
      v03Lnf: lnf,
      exportedAt: "2026-04-17T00:00:00.000Z"
    });

    expect(record.semantic_layer.v03_lnf?.schemaVersion).toBe("chemd-lnf/v0.3");
    expect(record.learning_layer.procedure_to_steps?.[0]?.steps[0]?.family).toBe("cool");
  });
});

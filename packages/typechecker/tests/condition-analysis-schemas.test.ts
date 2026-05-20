import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

const check = (source: string) => typecheckDocument(resolveChemd(parseChemd(source)));

describe("condition DSL v0.4", () => {
  it("parses declared factors, outcomes, and attempt sections", () => {
    const result = check(`---
id: exp-condition-dsl
title: Condition DSL
date: 2026-05-20
---

:::chemd #rxn-standard
kind: reaction
reactant: substrate
product: product
:::

:::result #res-standard
reaction: @rxn-standard
yield: 68 %
conversion: 85 %
:::

:::result #res-var1
reaction: @rxn-standard
yield: 72 %
conversion: 90 %
:::

:::condition-varies #cv-screen
standard: @rxn-standard
factor: solvent | baseline=THF
factor: temperature | baseline=25 C
outcome: yield | baseline=68 %
outcome: conversion | baseline=85 %

attempt: var1
result: @res-var1
solvent: MeCN
temperature: 40 C
yield: 72 %
conversion: 90 %
note: Higher conversion.
:::
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.typedGraph.nodes).toContainEqual(expect.objectContaining({
      kind: "condition_varies",
      nodeId: "cv-screen",
      factors: expect.arrayContaining([
        expect.objectContaining({ field: "solvent", baseline: "THF" }),
        expect.objectContaining({ field: "temperature", baseline: "25 C" })
      ]),
      outcomes: expect.arrayContaining([
        expect.objectContaining({ field: "yield", baseline: "68 %" })
      ]),
      attempts: expect.arrayContaining([
        expect.objectContaining({
          id: "var1",
          result: "@res-var1",
          factors: expect.objectContaining({ solvent: "MeCN" }),
          outcomes: expect.objectContaining({ yield: "72 %" })
        })
      ])
    }));
  });

  it("fails closed for unknown attempt fields and missing outcomes", () => {
    const source = `---
id: exp-condition-dsl-invalid
title: Invalid Condition DSL
date: 2026-05-20
---

:::condition-varies #cv-screen
factor: solvent | baseline=THF
outcome: yield | baseline=68 %
attempt: var1
temperature: 40 C
:::
`;
    const parsed = parseChemd(source);
    const result = typecheckDocument(resolveChemd(parsed));

    expect(parsed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_CONDITION_ATTEMPT_UNKNOWN_FIELD" })
    ]));
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_CONDITION_OUTCOME_MISSING" })
    ]));
  });
});

describe("analysis structured schemas", () => {
  it("normalizes TLC lanes and spot references", () => {
    const result = check(`---
id: exp-analysis-tlc
title: TLC Analysis
date: 2026-05-20
---

:::analysis #ana-tlc
type: tlc
lane: sm | source=@mat-aryl
spot: 0.62

lane: rxn | source=@sample-crude
spot: sm
spot: 0.31 ^3(4) product
mess: 0.55 (3)

lane: prod | source=@sample-product
spot: 0.30
:::
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.typedGraph.nodes).toContainEqual(expect.objectContaining({
      kind: "analysis",
      nodeId: "ana-tlc",
      normalizedAnalysis: expect.objectContaining({
        kind: "tlc",
        tlc: expect.objectContaining({
          lanes: expect.arrayContaining([
            expect.objectContaining({
              lane_role: "reaction_mixture",
              spots: expect.arrayContaining([
                expect.objectContaining({
                  raw: "sm",
                  is_reference: true,
                  source_spot_id: "lane1.spot1",
                  rf: 0.62
                }),
                expect.objectContaining({
                  rf: 0.31,
                  role: "product",
                  shape: "up",
                  size_rank: 3,
                  intensity_rank: 4
                })
              ])
            })
          ])
        })
      })
    }));
  });

  it("normalizes NMR, chromatography, and MS measurements", () => {
    const nmr = check(`---
id: exp-nmr
title: NMR
date: 2026-05-20
---

:::analysis #ana-nmr
type: nmr
spectrum: 1H NMR (400 MHz, CDCl3)
peak: 7.68-7.59 (m, 2H, ArCH)
peak: 3.56 (tt, J = 9.1, 6.0 Hz, 1H, CH(C=O))
:::
`);
    const lcms = check(`---
id: exp-lcms
title: LCMS
date: 2026-05-20
---

:::analysis #ana-lcms
type: lcms
method: @lcms-esi-pos
peak: 6.4 min (97 %, product)
ion: m/z 124.1 ([M+H]+, product)
:::
`);

    expect(nmr.diagnostics).toEqual([]);
    expect(lcms.diagnostics).toEqual([]);
    expect(nmr.typedGraph.nodes).toContainEqual(expect.objectContaining({
      normalizedAnalysis: expect.objectContaining({
        kind: "nmr",
        spectrum: expect.objectContaining({ nucleus: "1H" }),
        peaks: expect.arrayContaining([
          expect.objectContaining({ minShift: 7.59, maxShift: 7.68, multiplicity: "m", integration: "2H" })
        ])
      })
    }));
    expect(lcms.typedGraph.nodes).toContainEqual(expect.objectContaining({
      normalizedAnalysis: expect.objectContaining({
        kind: "lcms",
        peaks: expect.arrayContaining([
          expect.objectContaining({ retentionTime: expect.objectContaining({ value: 6.4 }), areaPercent: 97 })
        ]),
        ions: expect.arrayContaining([
          expect.objectContaining({ mz: 124.1, adduct: "[M+H]+", component: "product" })
        ])
      })
    }));
  });

  it("rejects type-specific field combinations that would hide meaning", () => {
    const result = check(`---
id: exp-analysis-invalid
title: Invalid Analysis
date: 2026-05-20
---

:::analysis #ana-nmr
type: nmr
ion: m/z 123.4 ([M]+)
:::

:::analysis #ana-lcms
type: lcms
peak: 6.4 min (97 %, product)
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_ANALYSIS_FIELD_FOR_TYPE" }),
      expect.objectContaining({ code: "E_ANALYSIS_ION_REQUIRED" })
    ]));
  });
});

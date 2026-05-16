import { describe, expect, it } from "vitest";

import { compileChemdForEditor } from "@chemd/language-service";

import { buildReactionIntelligenceJob } from "./job";

const sourceWithSmiles = `---
id: exp-intel
title: Intelligence fixture
date: 2026-05-13
---

:::chemd #mol-a
smiles: CCO
:::

:::chemd #mol-b
smiles: CC=O
:::

:::chemd #rxn-a
kind: reaction
reactants: @mol-a
products: @mol-b
conditions: air
:::
`;

describe("desktop reaction intelligence job builder", () => {
  it("builds a worker job from reactions with resolved participant SMILES", () => {
    const output = compileChemdForEditor({ source: sourceWithSmiles, documentUri: "fixture.chemd.md" });

    const result = buildReactionIntelligenceJob({
      compileOutput: output,
      source: sourceWithSmiles,
      documentUri: "fixture.chemd.md"
    });

    expect(result.state).toBe("ready");
    expect(result.job?.reactions).toHaveLength(1);
    expect(result.job?.reactions[0]).toMatchObject({
      reaction_entity_id: "rxn-a",
      canonical_rxn_smiles: "CCO>>CC=O",
      participant_signature: "mol-a=>mol-b"
    });
    expect(result.job?.provider_policy.allow_network).toBe(false);
  });

  it("skips reactions instead of inventing RXN SMILES when structures are missing", () => {
    const source = `:::chemd #rxn-a
kind: reaction
reactants: substrate
products: product
:::
`;
    const output = compileChemdForEditor({ source, documentUri: "missing.chemd.md" });

    const result = buildReactionIntelligenceJob({
      compileOutput: output,
      source,
      documentUri: "missing.chemd.md"
    });

    expect(result.state).toBe("skipped");
    expect(result.job).toBeNull();
    expect(result.skippedReactionIds).toEqual(["rxn-a"]);
  });
});

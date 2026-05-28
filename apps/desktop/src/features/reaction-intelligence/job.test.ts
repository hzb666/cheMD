import { describe, expect, it } from "vitest";

import { compileChemdForEditor } from "@chemd/language-service";

import { buildReactionIntelligenceJob } from "./job";

const sourceWithSmiles = `module exp_intel

meta {
  id: "exp-intel"
  title: "Intelligence fixture"
  date: "2026-05-13"
}

molecule mol-a {
  name: "Ethanol"
  smiles: "CCO"
}

molecule mol-b {
  name: "Acetaldehyde"
  smiles: "CC=O"
}

reaction rxn-a {
  reactants: [@mol-a]
  products: [@mol-b]
  conditions: "air"
}
`;

describe("desktop reaction intelligence job builder", () => {
  it("builds a worker job from reactions with resolved participant SMILES", () => {
    const output = compileChemdForEditor({ source: sourceWithSmiles, documentUri: "fixture.chemd" });

    const result = buildReactionIntelligenceJob({
      compileOutput: output,
      source: sourceWithSmiles,
      documentUri: "fixture.chemd"
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
    const source = `module exp_intel_missing

meta {
  id: "exp-intel-missing"
  title: "Missing structures"
  date: "2026-05-13"
}

reaction rxn-a {
  reactants: [substrate]
  products: [product]
}
`;
    const output = compileChemdForEditor({ source, documentUri: "missing.chemd" });

    const result = buildReactionIntelligenceJob({
      compileOutput: output,
      source,
      documentUri: "missing.chemd"
    });

    expect(result.state).toBe("skipped");
    expect(result.job).toBeNull();
    expect(result.skippedReactionIds).toEqual(["rxn-a"]);
  });
});

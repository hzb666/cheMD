import { describe, expect, it } from "vitest";

import {
  localChemicalLookupProvider,
  recognizeChemicalMentions
} from "../src/index";

describe("chemical lexicon", () => {
  it("recognizes common local aliases without external lookup", () => {
    const mentions = recognizeChemicalMentions("The residue was dissolved in DCM and purified with EtOAc.");

    expect(mentions.map((mention) => mention.normalizedName)).toEqual([
      "dichloromethane",
      "ethyl acetate"
    ]);
    expect(mentions.every((mention) => mention.source === "local-alias")).toBe(true);
  });

  it("prefers the longest overlapping workup phrase", () => {
    const mentions = recognizeChemicalMentions("The mixture was washed with saturated sodium bicarbonate solution.");

    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      text: "saturated sodium bicarbonate solution",
      normalizedName: "saturated sodium bicarbonate solution"
    });
  });

  it("recognizes reagent aliases and keeps local evidence", () => {
    const mentions = recognizeChemicalMentions("NaBH4 was added portionwise before quenching with brine.");

    expect(mentions.map((mention) => mention.normalizedName)).toEqual([
      "sodium borohydride",
      "brine"
    ]);
    expect(mentions[0].evidence).toContain("matched alias: NaBH4");
  });

  it("keeps unknown formula-like candidates separate from identified chemicals", () => {
    const mentions = recognizeChemicalMentions("The product C6H6 was detected by GC.");

    expect(mentions).toEqual([
      expect.objectContaining({
        text: "C6H6",
        normalizedName: "C6H6",
        source: "formula-like",
        category: "unknown"
      })
    ]);
  });

  it("exposes a local provider interface for optional external providers", async () => {
    const results = await localChemicalLookupProvider.lookupName("n-BuLi");

    expect(results[0]).toMatchObject({
      provider: "local-lexicon",
      canonicalName: "n-butyllithium",
      score: 0.94
    });
  });
});

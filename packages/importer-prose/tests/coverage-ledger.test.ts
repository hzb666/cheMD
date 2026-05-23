import { describe, expect, it } from "vitest";

import { importProse } from "../src/index";

describe("prose import coverage ledger", () => {
  it("warns for uncovered English action-like clauses inside a partially covered sentence", async () => {
    const result = await importProse(
      "The organic phases were washed with brine, dried over Na2SO4, filtered, and concentrated under reduced pressure."
    );
    const families = result.steps.map((step) => step.family);
    const uncoveredWarnings = result.diagnostics.filter((diagnostic) =>
      diagnostic.code === "W_IMPORT_PROSE_UNCOVERED_ACTION"
    );
    const uncoveredSpans = result.unparsedSpans.filter((span) =>
      span.reason === "uncovered_action_like"
    );

    expect(families).toEqual(expect.arrayContaining(["wash", "dry", "concentrate"]));
    expect(uncoveredWarnings).toEqual([
      expect.objectContaining({
        severity: "warning",
        span: expect.objectContaining({ text: "filtered" }),
        facts: expect.objectContaining({
          action: "filtered",
          family: "filter",
          source: "english_action_keyword"
        })
      })
    ]);
    expect(uncoveredSpans).toEqual([
      expect.objectContaining({ text: "filtered" })
    ]);
  });

  it("keeps full-sentence no_canonical_step without uncovered action warnings", async () => {
    const result = await importProse("The mixture was handled as usual.");

    expect(result.unparsedSpans).toContainEqual(expect.objectContaining({
      reason: "no_canonical_step",
      text: "The mixture was handled as usual."
    }));
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "W_IMPORT_PROSE_UNCOVERED_ACTION"
    );
  });

  it("does not warn when simple English workup actions are fully covered", async () => {
    const result = await importProse(
      "The organic phases were dried (MgSO4), filtered through Celite, and concentrated under reduced pressure."
    );

    expect(result.steps.map((step) => step.family)).toEqual(expect.arrayContaining([
      "dry",
      "filter",
      "concentrate"
    ]));
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "W_IMPORT_PROSE_UNCOVERED_ACTION"
    );
    expect(result.unparsedSpans.map((span) => span.reason)).not.toContain("uncovered_action_like");
  });
});

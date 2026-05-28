import { compileChemd } from "@chemd/compiler";
import { describe, expect, it } from "vitest";

import {
  renderChemdDraft,
  renderReactionBlock
} from "../src/index";
import type {
  ProseImportCandidate,
  ProseSourceSpan,
  ReactionCandidate,
  ReactionFactCandidate,
  ReactionFactRole
} from "../src/index";

const testSpan: ProseSourceSpan = {
  start: 0,
  end: 10,
  text: "test span"
};

const reactionFact = (
  role: ReactionFactRole,
  raw: string,
  confidence: number,
  id = `${role}-${raw}`
): ReactionFactCandidate => ({
  id,
  role,
  raw,
  confidence,
  sourceSpan: testSpan,
  evidence: ["test"],
  warnings: []
});

const makeImportCandidate = (
  reactionCandidate: ReactionCandidate
): ProseImportCandidate => ({
  sourceText: "Test reaction prose.",
  materials: [],
  quantities: [],
  steps: [
    {
      id: "step-1",
      family: "add",
      params: { materials: "sBuLi" },
      span: testSpan,
      confidence: 0.95,
      evidence: ["test"]
    }
  ],
  observations: [],
  procedureState: {
    finalState: {
      conditions: {},
      contents: [],
      index: 0,
      phaseMarkers: [],
      sourceStepFamily: "observe",
      sourceStepId: "initial",
      warnings: []
    },
    snapshots: [],
    warnings: []
  },
  reactionCandidates: [reactionCandidate],
  unparsedSpans: [],
  diagnostics: []
});

describe("reaction block rendering", () => {
  it("renders schema-driven reaction blocks from high-confidence candidates", () => {
    const reactionCandidate: ReactionCandidate = {
      id: "rxn1",
      source: "prose_import",
      confidence: 0.93,
      facts: [
        reactionFact("reactant", "substrate6", 0.95),
        reactionFact("reactant", "acyl-silane7", 0.92),
        reactionFact("product", "azetidine5", 0.91),
        reactionFact("reagent", "TMEDA", 0.9),
        reactionFact("reagent", "sBuLi", 0.89),
        reactionFact("reagent", "low-confidence-base", 0.74),
        reactionFact("solvent", "EtOAc", 0.76),
        reactionFact("solvent", "THF", 0.94),
        reactionFact("temperature", "-78 °C", 0.8),
        reactionFact("time", "15 min", 0.75),
        reactionFact("atmosphere", "nitrogen", 0.88),
        reactionFact("yield", "70%", 0.749)
      ],
      rejectedFacts: [],
      diagnostics: []
    };
    const lines = renderReactionBlock(reactionCandidate);

    expect(lines).toEqual([
      "reaction rxn1 {",
      "  reactants: [\"substrate6\", \"acyl-silane7\"]",
      "  products: [\"azetidine5\"]",
      "  reagents: \"TMEDA, sBuLi\"",
      "  solvent: \"THF\"",
      "  temperature: -78 C",
      "  time: 15 min",
      "  atmosphere: \"nitrogen\"",
      "}"
    ]);
  });

  it("renders reaction drafts before procedures and compiles the linked Chemd", () => {
    const reactionCandidate: ReactionCandidate = {
      id: "rxn1",
      source: "prose_import",
      confidence: 0.93,
      facts: [
        reactionFact("reactant", "substrate6", 0.95),
        reactionFact("product", "azetidine5", 0.91),
        reactionFact("reagent", "sBuLi", 0.9),
        reactionFact("solvent", "THF", 0.94),
        reactionFact("temperature", "-78 °C", 0.8),
        reactionFact("time", "15 min", 0.75)
      ],
      rejectedFacts: [],
      diagnostics: []
    };
    const chemd = renderChemdDraft(makeImportCandidate(reactionCandidate), {
      documentId: "exp-reaction-render",
      title: "Reaction render",
      date: "2026-05-23"
    });
    const result = compileChemd(chemd);

    expect(chemd.indexOf("reaction rxn1")).toBeLessThan(
      chemd.indexOf("procedure import_procedure")
    );
    expect(chemd).toContain("procedure import_procedure for @rxn1");
    expect(chemd).toContain("step s1 = add");
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("does not render empty reaction blocks when all facts are below threshold", () => {
    const reactionCandidate: ReactionCandidate = {
      id: "rxn-low",
      source: "prose_import",
      confidence: 0.5,
      facts: [
        reactionFact("reactant", "substrate6", 0.74),
        reactionFact("reagent", "sBuLi", 0.7)
      ],
      rejectedFacts: [],
      diagnostics: []
    };
    const chemd = renderChemdDraft(makeImportCandidate(reactionCandidate), {
      documentId: "exp-empty-reaction-render",
      title: "Empty reaction render",
      date: "2026-05-23"
    });
    const result = compileChemd(chemd);

    expect(renderReactionBlock(reactionCandidate)).toEqual([]);
    expect(chemd).not.toContain("reaction rxn_low");
    expect(chemd).not.toContain("for @rxn_low");
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });
});

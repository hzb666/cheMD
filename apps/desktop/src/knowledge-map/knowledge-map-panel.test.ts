import { describe, expect, it } from "vitest";

import {
  documentForceGraphStructureKey,
  reactionForceGraphStructureKey,
} from "./knowledge-map-panel";

describe("knowledge map force graph structure keys", () => {
  it("keeps document graph structure stable when only selection changes", () => {
    const base = {
      nodes: [{
        id: "doc-a",
        path: "doc-a.chemd",
        label: "doc-a.chemd",
        status: "ok",
        symbolCount: 2,
        incomingCount: 0,
        outgoingCount: 1,
        internalReferenceCount: 0,
        selected: false,
        val: 4,
      }],
      links: [],
    };
    const selected = {
      ...base,
      nodes: [{ ...base.nodes[0], selected: true, val: 10 }],
    };

    expect(documentForceGraphStructureKey(base)).toBe(documentForceGraphStructureKey(selected));
  });

  it("keeps reaction graph structure stable when only selection changes", () => {
    const base = {
      nodes: [{
        id: "rxn-a",
        reactionId: "rxn-a",
        label: "rxn-a",
        qualityTier: "semantic",
        selected: false,
        val: 4,
        x: 0,
        y: 0,
      }],
      links: [],
    };
    const selected = {
      ...base,
      nodes: [{ ...base.nodes[0], selected: true, val: 7 }],
    };

    expect(reactionForceGraphStructureKey(base)).toBe(reactionForceGraphStructureKey(selected));
  });
});

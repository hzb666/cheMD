import { describe, expect, it } from "vitest";

import {
  buildEditorGraphRagRecords,
  compileChemdForEditor,
  compileChemdLanguageServiceRequest,
  toMonacoCodeActions,
  toMonacoLanguageServiceModel,
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

const ambiguousKindSource = `---
id: exp-language-service
title: Language service
date: 2026-05-12
---

:::chemd #mol-main
name: Draft molecule
:::
`;

describe("compileChemdForEditor", () => {
  it("maps compiler diagnostics and exposes patch proposals", () => {
    const output = compileChemdForEditor({
      source: ambiguousKindSource
    });

    expect(output.status).toBe("ok");
    const diagnostic = output.diagnostics.find((item) =>
      item.code === "W_CHEMD_KIND_AMBIGUOUS"
    );

    expect(diagnostic).toMatchObject({
      code: "W_CHEMD_KIND_AMBIGUOUS",
      severity: "error",
      sourceNodeId: "mol-main"
    });
    expect(diagnostic?.quickFixes[0]).toMatchObject({
      diagnosticCode: "W_CHEMD_KIND_AMBIGUOUS",
      sourceRange: expect.objectContaining({
        startLine: expect.any(Number),
        startColumn: expect.any(Number)
      }),
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

    const model = toMonacoLanguageServiceModel(output);
    expect(model).toMatchObject({
      status: "ok",
      markers: expect.any(Array),
      codeActions: expect.any(Array),
      outline: output.outline,
      symbols: output.symbols
    });
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

  it("returns stale compile responses without invoking the compiler", () => {
    let compileCount = 0;
    const response = compileChemdLanguageServiceRequest({
      requestId: "compile-1",
      type: "compile",
      payload: { source }
    }, {
      compileChemd: () => {
        compileCount += 1;
        throw new Error("stale requests should not compile");
      }
    }, {
      latestRequestId: "compile-2"
    });

    expect(response).toEqual({
      requestId: "compile-1",
      type: "compile",
      status: "stale",
      stale: true
    });
    expect(compileCount).toBe(0);
  });

  it("turns compiler failures into structured worker errors", () => {
    const response = compileChemdLanguageServiceRequest({
      requestId: "compile-failure",
      type: "compile",
      payload: { source }
    }, {
      compileChemd: () => {
        throw new Error("compiler unavailable");
      },
      now: () => new Date("2026-05-12T00:00:00.000Z")
    });

    expect(response).toMatchObject({
      requestId: "compile-failure",
      type: "compile",
      status: "error",
      error: {
        code: "LS_COMPILE_FAILED",
        message: "compiler unavailable"
      },
      payload: {
        status: "failed",
        compiledAt: "2026-05-12T00:00:00.000Z"
      }
    });
  });

  it("keeps quick fixes as proposals and leaves source untouched", () => {
    const originalSource = ambiguousKindSource;
    const output = compileChemdForEditor({
      source: ambiguousKindSource
    });
    const proposal = output.diagnostics
      .flatMap((diagnostic) => diagnostic.quickFixes)[0];

    expect(ambiguousKindSource).toBe(originalSource);
    expect(proposal.patch.beforeHash).toEqual(expect.any(String));
    expect(proposal.patch.edits[0].replacement).not.toBe(ambiguousKindSource);
    expect(proposal.patch.edits[0].replacement).toContain("kind: molecule");
  });

  it("keeps empty and incomplete documents inside stable editor ranges", () => {
    const emptyOutput = compileChemdForEditor({ source: "" });
    const incompleteOutput = compileChemdForEditor({
      source: ":::chemd #mol-open\nkind: molecule\nsmiles: CCO"
    });

    expect(emptyOutput.status).toBe("ok");
    expect(incompleteOutput.status).toBe("ok");
    expect(emptyOutput.outline[0]?.range).toEqual({
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1
    });
    expect(incompleteOutput.outline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "mol-open",
        range: expect.objectContaining({
          startLine: 1,
          startColumn: 1,
          endLine: 3
        })
      })
    ]));
    expect(incompleteOutput.diagnostics.every((diagnostic) =>
      diagnostic.range.startLine >= 1
        && diagnostic.range.startColumn >= 1
        && diagnostic.range.endLine >= diagnostic.range.startLine
    )).toBe(true);
  });
});

describe("buildEditorGraphRagRecords", () => {
  const createdAt = "2026-05-12T01:02:03.000Z";

  const reactionRouteSource = `---
id: exp-route-records
title: Route records
date: 2026-05-12
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::chemd #mol-b
kind: molecule
smiles: CC=O
:::

:::chemd #rxn-step-01
kind: reaction
route: route-a
reactants: mol-a
products: mol-b
:::

:::chemd #rxn-step-02
kind: reaction
route: route-a
prev: rxn-step-01
reactants: mol-b
products: product-b
:::

:::result #res-step-02
reaction: rxn-step-02
status: success
yield: 82%
:::
`;

  it("builds reaction graph DTOs from outline, entities, route links, and RAG chunks", () => {
    const records = buildEditorGraphRagRecords({
      source: reactionRouteSource,
      documentUri: "file:///route.chemd",
      experimentId: "exp-route-records",
      revisionId: "rev-route-1",
      createdAt
    });

    expect(records.graphSnapshot).toMatchObject({
      graphSnapshotId: "rev-route-1::editor-graph-rag",
      experimentId: "exp-route-records",
      sourceRevisionIds: ["rev-route-1"],
      graphKind: "reaction",
      createdAt
    });
    expect(records.reactionGraphNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeKind: "block", blockId: "rxn-step-02" }),
      expect.objectContaining({
        nodeKind: "entity",
        entityId: expect.stringContaining("rxn-step-02"),
        blockId: "rxn-step-02"
      })
    ]));
    expect(records.reactionGraphEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ edgeType: "document_order", confidence: "high" }),
      expect.objectContaining({ edgeType: "block_contains_entity", confidence: "high" }),
      expect.objectContaining({ edgeType: "route_prev" }),
      expect.objectContaining({ edgeType: "evidence_link" })
    ]));
    expect(records.ragCitationCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentUri: "file:///route.chemd",
        revisionId: "rev-route-1",
        entityId: expect.stringContaining("res-step-02"),
        blockId: "res-step-02",
        sourceRange: expect.objectContaining({ startLine: 32 }),
        citation: expect.objectContaining({
          documentUri: "file:///route.chemd",
          revisionId: "rev-route-1"
        })
      })
    ]));
  });

  it("keeps markdown-only documents persistable with fallback source ranges", () => {
    const records = buildEditorGraphRagRecords({
      source: `---
id: exp-markdown-records
title: Markdown records
date: 2026-05-12
---

This observation is plain markdown with no Chemd blocks.
`,
      experimentId: "exp-markdown-records",
      revisionId: "rev-markdown-1",
      createdAt
    });

    expect(records.ragCitationCandidates.length).toBeGreaterThan(0);
    expect(records.ragCitationCandidates[0]).toMatchObject({
      revisionId: "rev-markdown-1",
      sourceRange: expect.objectContaining({ startLine: expect.any(Number) }),
      quality: expect.objectContaining({ range_source: expect.any(String) })
    });
  });

  it("links diagnostic evidence to editor source ranges", () => {
    const records = buildEditorGraphRagRecords({
      source: ambiguousKindSource,
      experimentId: "exp-language-service",
      revisionId: "rev-diagnostics-1",
      createdAt
    });

    expect(records.reactionGraphNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeKind: "diagnostic",
        payload: expect.objectContaining({
          code: "W_CHEMD_KIND_AMBIGUOUS",
          source_node_id: "mol-main"
        })
      })
    ]));
    expect(records.reactionGraphEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edgeType: "diagnostic_evidence",
        confidence: "high",
        evidence: expect.objectContaining({
          diagnostic_code: "W_CHEMD_KIND_AMBIGUOUS",
          source_node_id: "mol-main",
          source_range: expect.objectContaining({ startLine: expect.any(Number) })
        })
      })
    ]));
  });

  it("generates stable ids for the same source and revision", () => {
    const input = {
      source: reactionRouteSource,
      experimentId: "exp-route-records",
      revisionId: "rev-route-1",
      createdAt
    };
    const first = buildEditorGraphRagRecords(input);
    const second = buildEditorGraphRagRecords(input);

    expect(second.graphSnapshot.graphSnapshotId).toBe(first.graphSnapshot.graphSnapshotId);
    expect(second.reactionGraphNodes.map((node) => node.nodeId)).toEqual(
      first.reactionGraphNodes.map((node) => node.nodeId)
    );
    expect(second.reactionGraphEdges.map((edge) => edge.edgeId)).toEqual(
      first.reactionGraphEdges.map((edge) => edge.edgeId)
    );
    expect(second.ragCitationCandidates.map((candidate) => candidate.citationId)).toEqual(
      first.ragCitationCandidates.map((candidate) => candidate.citationId)
    );
  });
});

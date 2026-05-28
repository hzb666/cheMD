import { describe, expect, it } from "vitest";

import {
  buildEditorGraphRagRecords,
  compileChemdForEditor,
  compileChemdLanguageServiceRequest,
  toMonacoCodeActions,
  toMonacoLanguageServiceModel,
  toMonacoMarker,
  toMonacoSemanticTokensData
} from "../src/index";

const source = `module exp_language_service

meta {
  id: "exp-language-service"
  title: "Language service"
  date: "2026-05-12"
}

molecule mol-main {
  name: "main"
  smiles: "CCO"
}

molecule product-main {
  name: "product"
  smiles: "CC=O"
}

reaction rxn-main {
  reactants: [@mol-main]
  products: [@product-main]
}

result res-main for @rxn-main {
  status: success
  yield: 78%
}

procedure proc-main for @rxn-main {
  evidence: [@res-main]
  step charge = charge(inputs: [@mol-main])
  step heat = heat(duration: 2 h, depends_on: [charge])
}
`;

const legacySource = `---
id: legacy
---

:::chemd #rxn-main
reactants: a
:::
`;

const invalidFieldSource = `module exp_invalid_field

meta {
  id: "exp-invalid-field"
  title: "Invalid field"
  date: "2026-05-12"
}

reaction rxn-main {
  reactants: @mol-main
  products: ["product-main"]
}
`;

describe("compileChemdForEditor", () => {
  it("maps removed legacy syntax diagnostics without patch proposals", () => {
    const output = compileChemdForEditor({
      source: legacySource
    });

    expect(output.status).toBe("ok");
    expect(output.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E_LEGACY_FRONTMATTER_REMOVED",
        severity: "error",
        quickFixes: []
      }),
      expect.objectContaining({
        code: "E_LEGACY_FENCED_BLOCK_REMOVED",
        severity: "error",
        quickFixes: []
      })
    ]));
  });

  it("builds outline, symbols, and Monaco payloads from program declarations", () => {
    const output = compileChemdForEditor({ source });

    expect(output.status).toBe("ok");
    expect(output.outline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "module", label: "exp_language_service" }),
      expect.objectContaining({ kind: "metadata", label: "Language service" }),
      expect.objectContaining({ id: "rxn-main", kind: "reaction" }),
      expect.objectContaining({ id: "res-main", kind: "result" }),
      expect.objectContaining({
        id: "proc-main",
        kind: "procedure",
        children: expect.arrayContaining([
          expect.objectContaining({ id: "proc-main.charge", kind: "step" })
        ])
      })
    ]));
    expect(output.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "rxn-main", kind: "reaction" }),
      expect.objectContaining({ id: "res-main", kind: "result" }),
      expect.objectContaining({ id: "charge", kind: "step" })
    ]));
    expect(output.semanticTokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "keyword",
        modifiers: expect.arrayContaining(["block"])
      }),
      expect.objectContaining({
        type: "variable",
        modifiers: expect.arrayContaining(["declaration", "reaction"])
      }),
      expect.objectContaining({
        type: "property",
        range: expect.objectContaining({ startLine: expect.any(Number) })
      }),
      expect.objectContaining({
        type: "number",
        modifiers: expect.arrayContaining(["quantity"])
      }),
      expect.objectContaining({
        type: "variable",
        modifiers: expect.arrayContaining(["reference"])
      })
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
      symbols: output.symbols,
      semanticTokens: output.semanticTokens
    });
    expect(Array.from(toMonacoSemanticTokensData(output.semanticTokens)).length % 5).toBe(0);
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

  it("leaves source untouched when no quick fix proposals exist", () => {
    const originalSource = invalidFieldSource;
    const output = compileChemdForEditor({
      source: invalidFieldSource
    });

    expect(invalidFieldSource).toBe(originalSource);
    expect(output.diagnostics.flatMap((diagnostic) => diagnostic.quickFixes))
      .toEqual(expect.any(Array));
  });

  it("keeps empty and incomplete documents inside stable editor ranges", () => {
    const emptyOutput = compileChemdForEditor({ source: "" });
    const incompleteOutput = compileChemdForEditor({
      source: `module exp_open

meta {
  id: "exp-open"
  title: "Open"
  date: "2026-05-12"
}

molecule mol-open {
  name: "open"
  smiles: "CCO"`
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
          startLine: 9,
          startColumn: 1
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

  const reactionRouteSource = `module exp_route_records

meta {
  id: "exp-route-records"
  title: "Route records"
  date: "2026-05-12"
}

molecule mol-a {
  name: "mol a"
  smiles: "CCO"
}

molecule mol-b {
  name: "mol b"
  smiles: "CC=O"
}

molecule product-b {
  name: "product b"
  smiles: "CCC"
}

reaction rxn-step-01 {
  route: "route-a"
  reactants: [@mol-a]
  products: [@mol-b]
}

reaction rxn-step-02 {
  route: "route-a"
  prev: [@rxn-step-01]
  reactants: [@mol-b]
  products: [@product-b]
}

result res-step-02 for @rxn-step-02 {
  status: success
  yield: 82%
}
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
      expect.objectContaining({ edgeType: "evidence_link" })
    ]));
    expect(records.ragCitationCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentUri: "file:///route.chemd",
        revisionId: "rev-route-1",
        entityId: expect.stringContaining("res-step-02"),
        blockId: "res-step-02",
        sourceRange: expect.objectContaining({ startLine: expect.any(Number) }),
        citation: expect.objectContaining({
          documentUri: "file:///route.chemd",
          revisionId: "rev-route-1"
        })
      })
    ]));
  });

  it("keeps markdown-only documents persistable with fallback source ranges", () => {
    const records = buildEditorGraphRagRecords({
      source: `module exp_markdown_records

meta {
  id: "exp-markdown-records"
  title: "Markdown records"
  date: "2026-05-12"
}

/*md
This observation is plain markdown with no Chemd declarations.
*/
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
      source: invalidFieldSource,
      experimentId: "exp-invalid-field",
      revisionId: "rev-diagnostics-1",
      createdAt
    });

    expect(records.reactionGraphNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeKind: "diagnostic",
        payload: expect.objectContaining({
          code: "E_PROGRAM_FIELD_VALUE_KIND",
          source_node_id: "rxn-main"
        })
      })
    ]));
    expect(records.reactionGraphEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edgeType: "diagnostic_evidence",
        confidence: "high",
        evidence: expect.objectContaining({
          diagnostic_code: "E_PROGRAM_FIELD_VALUE_KIND",
          source_node_id: "rxn-main",
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

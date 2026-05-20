import { describe, expect, it } from "vitest";

import {
  compileChemdForEditor,
  type ChemdLanguageCompileSuccess,
  type ChemdLanguageCompileOutput
} from "@chemd/language-service";
import type {
  ChemdReactionIntelligenceArtifactV1,
  ReactionMapLayout
} from "@chemd/reaction-map";

import {
  buildKnowledgeMapViewModel,
  createKnowledgeMapSourceJumpIntent,
  filterKnowledgeMapNodes
} from "./knowledge-map";

const compile = (source: string): ChemdLanguageCompileOutput =>
  compileChemdForEditor({
    source,
    documentUri: "experiments/map.chemd",
    options: { procedureMode: "auto" }
  });

const outputWithReaction = (): ChemdLanguageCompileSuccess => ({
  status: "ok",
  documentUri: "experiments/map.chemd",
  compiledAt: "2026-05-13T00:00:00.000Z",
  diagnostics: [],
  outline: [
    {
      id: "mol-a",
      label: "mol-a",
      kind: "molecule",
      range: { startLine: 7, startColumn: 1, endLine: 10, endColumn: 4 }
    },
    {
      id: "rxn-a",
      label: "rxn-a",
      kind: "reaction",
      range: { startLine: 12, startColumn: 1, endLine: 16, endColumn: 4 }
    }
  ],
  semanticTokens: [],
  symbols: [
    {
      id: "mol-a",
      label: "mol-a",
      kind: "molecule",
      range: { startLine: 7, startColumn: 1, endLine: 10, endColumn: 4 },
      sourceNodeType: "molecule"
    },
    {
      id: "rxn-a",
      label: "rxn-a",
      kind: "reaction",
      range: { startLine: 12, startColumn: 1, endLine: 16, endColumn: 4 },
      sourceNodeType: "reaction"
    }
  ],
  result: ({
    document: {
      type: "document",
      meta: {
        id: "map-doc",
        title: "Knowledge map",
        date: "2026-05-13"
      },
      children: [
        {
          type: "molecule",
          id: "mol-a",
          name: "A",
          smiles: "CCO",
          sourceSpan: { start: 42, end: 80, startLine: 7, endLine: 10 }
        },
        {
          type: "reaction",
          id: "rxn-a",
          reactants: ["mol-a"],
          products: ["mol-b"],
          sourceSpan: { start: 100, end: 180, startLine: 12, endLine: 16 }
        },
        {
          type: "observation",
          id: "obs-a",
          text: "Reaction evidence",
          sourceSpan: { start: 181, end: 220, startLine: 18, endLine: 19 }
        }
      ],
      diagnostics: []
    },
    diagnostics: []
  } as unknown) as ChemdLanguageCompileSuccess["result"]
});

const outputWithRecentLanguageFeatures = (): ChemdLanguageCompileSuccess => ({
  ...outputWithReaction(),
  result: ({
    document: {
      type: "document",
      meta: {
        id: "language-feature-map-doc",
        title: "Language feature map",
        date: "2026-05-21"
      },
      children: [
        {
          type: "molecule",
          id: "mol-a",
          name: "A",
          smiles: "CCO",
          sourceSpan: { start: 42, end: 80, startLine: 7, endLine: 10 }
        },
        {
          type: "reaction",
          id: "rxn-a",
          reactants: ["@mol-a | 1 mmol"],
          products: ["@mol-b"],
          sourceSpan: { start: 100, end: 180, startLine: 12, endLine: 16 }
        },
        {
          type: "procedure",
          id: "proc-a",
          reaction: "rxn-a",
          steps: [{
            type: "step",
            stepId: "s1",
            family: "add",
            inputs: ["mol-a"],
            outputs: ["mol-b"],
            sourceSpan: { start: 181, end: 220, startLine: 18, endLine: 18 }
          }],
          controls: [{
            type: "control",
            controlId: "loop-1",
            kind: "repeat",
            children: [],
            sourceSpan: { start: 221, end: 240, startLine: 19, endLine: 19 }
          }],
          sourceSpan: { start: 181, end: 260, startLine: 18, endLine: 20 }
        },
        {
          type: "condition_varies",
          id: "screen-a",
          reaction: "rxn-a",
          changes: [],
          attempts: [{
            id: "a1",
            raw: "temp=80 C",
            reaction: "rxn-a",
            result: "res-a",
            changes: [],
            condition: []
          }],
          sourceSpan: { start: 261, end: 320, startLine: 22, endLine: 25 }
        },
        {
          type: "result",
          id: "res-a",
          reaction: "rxn-a",
          yield: "83%",
          sourceSpan: { start: 321, end: 350, startLine: 27, endLine: 27 }
        },
        {
          type: "analysis",
          id: "ana-a",
          type_name: "nmr",
          ref: "res-a",
          sourceSpan: { start: 351, end: 390, startLine: 29, endLine: 31 }
        },
        {
          type: "observation",
          id: "obs-a",
          ref: "rxn-a",
          events: [{
            type: "event",
            eventId: "evt-a",
            eventType: "color",
            linkedStepId: "s1",
            evidence: ["ana-a"],
            sourceSpan: { start: 391, end: 420, startLine: 33, endLine: 33 }
          }],
          sourceSpan: { start: 391, end: 450, startLine: 33, endLine: 35 }
        },
        {
          type: "trace",
          id: "trace-a",
          events: [{
            type: "trace_event",
            eventId: "trace-evt-a",
            eventType: "started",
            stepId: "s1",
            sourceSpan: { start: 451, end: 470, startLine: 37, endLine: 37 }
          }],
          sourceSpan: { start: 451, end: 500, startLine: 37, endLine: 39 }
        }
      ],
      diagnostics: []
    },
    diagnostics: []
  } as unknown) as ChemdLanguageCompileSuccess["result"]
});

const outputWithManyReactions = (count: number): ChemdLanguageCompileSuccess => {
  const symbols = Array.from({ length: count }, (_, index) => ({
    id: `rxn-${index + 1}`,
    label: `rxn-${index + 1}`,
    kind: "reaction",
    range: { startLine: index + 1, startColumn: 1, endLine: index + 1, endColumn: 8 },
    sourceNodeType: "reaction"
  }));

  return {
    ...outputWithReaction(),
    symbols,
    result: ({
      document: {
        type: "document",
        meta: {
          id: "large-map-doc",
          title: "Large knowledge map",
          date: "2026-05-13"
        },
        children: symbols.map((symbol) => ({
          type: "reaction",
          id: symbol.id,
          reactants: [`mol-${symbol.id}`],
          products: [`product-${symbol.id}`],
          sourceSpan: {
            start: symbol.range.startLine * 10,
            end: symbol.range.endLine * 10,
            startLine: symbol.range.startLine,
            endLine: symbol.range.endLine
          }
        })),
        diagnostics: []
      },
      diagnostics: []
    } as unknown) as ChemdLanguageCompileSuccess["result"]
  };
};

const outputWithManyReactionsWithoutSourceRefs = (
  count: number
): ChemdLanguageCompileSuccess => {
  const output = outputWithManyReactions(count);
  return {
    ...output,
    result: ({
      document: {
        ...output.result.document,
        children: output.result.document.children.map((child) => ({
          ...child,
          sourceSpan: undefined
        }))
      },
      diagnostics: output.result.diagnostics
    } as unknown) as ChemdLanguageCompileSuccess["result"]
  };
};

const reactionIntelligenceArtifact = (
  layout?: ReactionMapLayout
): ChemdReactionIntelligenceArtifactV1 => ({
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: "artifact::reaction-intel::map-doc",
  job_id: "job::reaction-intel::map-doc",
  graph_index_id: "graph-index::map-doc",
  generated_at: "2026-05-13T10:00:00.000Z",
  providers: [
    {
      provider_id: "rdkit::fixture",
      kind: "rdkit_fingerprint",
      status: "PASS",
      package_name: "rdkit",
      package_version: "fixture",
      warnings: []
    },
    {
      provider_id: "rxnfp::fixture",
      kind: "rxnfp",
      status: "SKIP",
      warnings: ["rxnfp_not_installed"]
    },
    {
      provider_id: "tmap::fixture",
      kind: "tmap_layout",
      status: "ERROR",
      warnings: ["tmap_layout_failed"]
    }
  ],
  reaction_features: [
    {
      reaction_entity_id: "rxn-1",
      source_hash: "hash-rxn-1",
      canonical_rxn_smiles: "CCO.O>>CC=O",
      fingerprint_refs: [{
        feature_ref_id: "feature::rxn-1::rdkit",
        provider: "rdkit",
        kind: "bit_vector",
        dimension: 2048,
        storage: "inline",
        hash: "feature-hash-rxn-1"
      }],
      warnings: []
    }
  ],
  similarity_edges: [
    {
      edge_id: "edge::rxn-1::rxn-2",
      from_reaction_entity_id: "rxn-1",
      to_reaction_entity_id: "rxn-2",
      score: 0.91,
      confidence: "high",
      basis: ["rdkit_fingerprint_tanimoto", "hybrid_consensus"],
      provider_ids: ["rdkit::fixture"],
      source_hashes: ["hash-rxn-1", "hash-rxn-2"],
      warnings: ["computed_edge_reviewed"]
    }
  ],
  layout,
  warnings: ["artifact_warning_for_review"]
});

describe("desktop knowledge map view model", () => {
  it("builds semantic summaries from successful compile output", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.state).toBe("ready");
    expect(viewModel.semanticTree?.document_id).toBe("map-doc");
    expect(viewModel.semanticSummary.nodeCount).toBeGreaterThan(1);
    expect(viewModel.semanticSummary.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: "MoleculeBlock" }),
      expect.objectContaining({ component: "ReactionBlock" })
    ]));
  });

  it("creates reaction map data with deterministic fallback layout", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.reactionSummary).toMatchObject({
      reactionCount: 1,
      layoutEngine: "deterministic_fallback"
    });
    expect(viewModel.reactionSummary.message).toContain("TMAP/worker");
    expect(viewModel.reactionMap.nodes[0]).toMatchObject({
      reaction_entity_id: "rxn-a",
      x: 0,
      y: 0
    });
    expect(viewModel.reactionIntelligenceArtifact).toBeNull();
  });

  it("builds a document semantic flow from compiled renderable nodes", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.semanticFlow.nodes.map((node) => node.laneId)).toEqual(
      expect.arrayContaining(["source", "materials", "reaction", "evidence"])
    );
    expect(viewModel.semanticFlow.nodes.find((node) => node.label === "rxn-a")).toMatchObject({
      laneId: "reaction",
      component: "ReactionBlock",
      sourceRef: expect.objectContaining({ startLine: 12, endLine: 16 })
    });
    expect(viewModel.semanticFlow.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "molecule::mol-a",
        targetId: "reaction::rxn-a",
        kind: "reactant",
        label: "reactant"
      }),
      expect.objectContaining({
        sourceId: "document::map-doc",
        targetId: "molecule::mol-a",
        kind: "contains"
      })
    ]));
  });

  it("maps recent language-layer nodes into the IDE graph without treating trace as graph facts", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithRecentLanguageFeatures());
    const nodeTypes = viewModel.semanticTree?.nodes.map((node) => node.node_type) ?? [];
    const flowNodeTypes = viewModel.semanticFlow.nodes.map((node) => node.nodeType);

    expect(nodeTypes).toEqual(expect.arrayContaining([
      "ChemdConditionAttemptNode",
      "ChemdObservationEventNode",
      "ChemdProcedureControlNode",
      "ChemdTraceNode",
      "ChemdTraceEventNode"
    ]));
    expect(nodeTypes).not.toContain("ChemdUnknownNode");
    expect(flowNodeTypes).toEqual(expect.arrayContaining([
      "ChemdConditionAttemptNode",
      "ChemdObservationEventNode",
      "ChemdProcedureControlNode"
    ]));
    expect(flowNodeTypes).not.toContain("ChemdTraceNode");
    expect(flowNodeTypes).not.toContain("ChemdTraceEventNode");
    expect(viewModel.semanticFlow.nodes.find((node) => node.label === "evt-a")).toMatchObject({
      laneId: "evidence",
      component: "ObservationEventBlock"
    });
    expect(viewModel.semanticFlow.nodes.find((node) => node.label === "screen-a.a1")).toMatchObject({
      laneId: "reaction",
      component: "ConditionAttemptBlock"
    });
    expect(viewModel.semanticFlow.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "reaction::rxn-a",
        targetId: "condition-attempt::screen-a.a1",
        kind: "semantic_relation",
        label: "attempt reaction"
      }),
      expect.objectContaining({
        sourceId: "condition-attempt::screen-a.a1",
        targetId: "result::res-a",
        kind: "semantic_relation",
        label: "attempt result"
      }),
      expect.objectContaining({
        sourceId: "result::res-a",
        targetId: "analysis::ana-a",
        kind: "semantic_relation",
        label: "analysis ref"
      }),
      expect.objectContaining({
        sourceId: "procedure-step::s1",
        targetId: "observation-event::evt-a",
        kind: "evidence",
        label: "event step"
      }),
      expect.objectContaining({
        sourceId: "observation-event::evt-a",
        targetId: "analysis::ana-a",
        kind: "evidence",
        label: "event evidence"
      })
    ]));
  });

  it("keeps no-artifact calls compatible with the deterministic fallback message", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.reactionIntelligenceArtifact).toBeNull();
    expect(viewModel.edgeBasisOptions).toEqual([]);
    expect(viewModel.reactionSummary.message).toContain("TMAP/worker");
  });

  it("summarizes reaction intelligence artifact providers, edges, basis, and warnings", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithManyReactions(2), {
      reactionIntelligenceArtifact: reactionIntelligenceArtifact()
    });

    expect(viewModel.reactionIntelligenceArtifact).toMatchObject({
      artifactId: "artifact::reaction-intel::map-doc",
      jobId: "job::reaction-intel::map-doc",
      generatedAt: "2026-05-13T10:00:00.000Z",
      providerStatusCounts: { PASS: 1, SKIP: 1, ERROR: 1 },
      computedEdgeCount: 1,
      computedBasis: ["hybrid_consensus", "rdkit_fingerprint_tanimoto"],
      warnings: ["artifact_warning_for_review"],
      layout: {
        fromArtifact: false,
        usesTmap: false,
        engine: "deterministic_fallback"
      }
    });
    expect(viewModel.reactionSummary.edgeCount).toBe(1);
    expect(viewModel.reactionMap.edges[0]).toMatchObject({
      from_reaction_entity_id: "rxn-1",
      to_reaction_entity_id: "rxn-2",
      basis: ["hybrid_consensus", "rdkit_fingerprint_tanimoto"]
    });
    expect(viewModel.edgeBasisOptions).toEqual([
      { value: "hybrid_consensus", label: "hybrid_consensus", edgeCount: 1 },
      {
        value: "rdkit_fingerprint_tanimoto",
        label: "rdkit_fingerprint_tanimoto",
        edgeCount: 1
      }
    ]);
  });

  it("filters graph nodes by edge basis and keeps cluster filtering composable", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithManyReactions(3), {
      reactionIntelligenceArtifact: reactionIntelligenceArtifact()
    });
    const rxnOneClusterId = viewModel.reactionMap.nodes.find((node) =>
      node.reaction_entity_id === "rxn-1"
    )?.cluster_id;

    expect(filterKnowledgeMapNodes(viewModel.reactionMap, {
      edgeBasis: "rdkit_fingerprint_tanimoto"
    }).map((node) => node.reaction_entity_id)).toEqual(["rxn-1", "rxn-2"]);
    expect(filterKnowledgeMapNodes(viewModel.reactionMap, {
      clusterId: rxnOneClusterId,
      edgeBasis: "rdkit_fingerprint_tanimoto"
    }).map((node) => node.reaction_entity_id)).toEqual(["rxn-1"]);
    expect(filterKnowledgeMapNodes(viewModel.reactionMap, {
      edgeBasis: "rxnfp_cosine"
    })).toEqual([]);
  });

  it("builds edge evidence rows for artifact explicit edges", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithManyReactions(2), {
      reactionIntelligenceArtifact: reactionIntelligenceArtifact()
    });

    expect(viewModel.edgeEvidenceRows).toHaveLength(1);
    expect(viewModel.edgeEvidenceRows[0]).toMatchObject({
      from: {
        reactionId: "rxn-1",
        label: "rxn-1"
      },
      to: {
        reactionId: "rxn-2",
        label: "rxn-2"
      },
      basis: ["hybrid_consensus", "rdkit_fingerprint_tanimoto"],
      score: 0.91,
      warnings: ["computed_edge_reviewed"],
      evidenceSources: [{
        evidenceId: "edge::rxn-1::rxn-2",
        source: "explicit_edge",
        basis: ["rdkit_fingerprint_tanimoto", "hybrid_consensus"],
        warnings: ["computed_edge_reviewed"]
      }]
    });
  });

  it("adds source refs and jump intents to both edge evidence endpoints", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithManyReactions(2), {
      reactionIntelligenceArtifact: reactionIntelligenceArtifact()
    });
    const row = viewModel.edgeEvidenceRows[0];

    expect(row.from.sourceRef).toMatchObject({
      label: "map.chemd L1-L1",
      startLine: 1,
      endLine: 1
    });
    expect(row.from.jumpIntent).toEqual({
      kind: "chemd-source-jump",
      nodeId: "reaction::rxn-1",
      semanticId: "rxn-1",
      sourceKind: "chemd",
      sourceUri: "experiments/map.chemd",
      range: {
        startLine: 1,
        endLine: 1,
        startOffset: 10,
        endOffset: 10
      }
    });
    expect(row.to.sourceRef).toMatchObject({
      label: "map.chemd L2-L2",
      startLine: 2,
      endLine: 2
    });
    expect(row.to.jumpIntent?.range).toMatchObject({
      startLine: 2,
      endLine: 2
    });
  });

  it("keeps edge evidence endpoints safe when reactions have no source refs", () => {
    const viewModel = buildKnowledgeMapViewModel(
      outputWithManyReactionsWithoutSourceRefs(2),
      { reactionIntelligenceArtifact: reactionIntelligenceArtifact() }
    );

    expect(viewModel.edgeEvidenceRows).toHaveLength(1);
    expect(viewModel.edgeEvidenceRows[0].from.sourceRef).toBeNull();
    expect(viewModel.edgeEvidenceRows[0].from.jumpIntent).toBeNull();
    expect(viewModel.edgeEvidenceRows[0].to.sourceRef).toBeNull();
    expect(viewModel.edgeEvidenceRows[0].to.jumpIntent).toBeNull();
  });

  it("uses artifact TMAP layout when the artifact carries a layout payload", () => {
    const fallbackLayout = buildKnowledgeMapViewModel(outputWithManyReactions(2)).reactionMap;
    const artifactLayout: ReactionMapLayout = {
      ...fallbackLayout,
      layout_engine: "tmap",
      generated_at: "2026-05-13T10:00:00.000Z"
    };
    const viewModel = buildKnowledgeMapViewModel(outputWithManyReactions(2), {
      reactionIntelligenceArtifact: reactionIntelligenceArtifact(artifactLayout)
    });

    expect(viewModel.reactionMap.layout_engine).toBe("tmap");
    expect(viewModel.reactionIntelligenceArtifact?.layout).toEqual({
      fromArtifact: true,
      usesTmap: true,
      engine: "tmap"
    });
    expect(viewModel.reactionSummary.message).toBe("Using external reaction map layout output.");
  });

  it("exposes expandable reaction renderable data with source refs", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.reactionRenderables).toHaveLength(1);
    expect(viewModel.reactionRenderables[0]).toMatchObject({
      semanticId: "rxn-a",
      component: "ReactionBlock",
      hydration: "visible",
      sourceRef: {
        label: "map.chemd L12-L16",
        startLine: 12,
        endLine: 16
      }
    });
  });

  it("builds source jump intents for renderable and evidence source refs", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithReaction());
    const reaction = viewModel.reactionRenderables[0];
    const evidence = viewModel.evidenceSourceRefs[0];

    expect(reaction.sourceRef?.intent).toEqual({
      kind: "chemd-source-jump",
      nodeId: "reaction::rxn-a",
      semanticId: "rxn-a",
      sourceKind: "chemd",
      sourceUri: "experiments/map.chemd",
      range: {
        startLine: 12,
        endLine: 16,
        startOffset: 100,
        endOffset: 180
      }
    });
    expect(evidence.sourceRef.intent?.range).toMatchObject({
      startLine: 18,
      endLine: 19
    });
  });

  it("returns null source jump intent when a source ref has no line", () => {
    expect(createKnowledgeMapSourceJumpIntent("node-a", "rxn-a", {
      source_kind: "chemd",
      source_uri: "experiments/map.chemd"
    })).toBeNull();
  });

  it("adds cluster badge data to reaction renderable rows", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithReaction());

    expect(viewModel.reactionRenderables[0].clusterBadge).toMatchObject({
      basis: "reaction_signature",
      confidence: "high",
      memberCount: 1
    });
  });

  it("builds a 1k reaction layout fixture without requiring TMAP", () => {
    const viewModel = buildKnowledgeMapViewModel(outputWithManyReactions(1000));

    expect(viewModel.reactionMap.nodes).toHaveLength(1000);
    expect(viewModel.reactionSummary).toMatchObject({
      reactionCount: 1000,
      layoutEngine: "deterministic_fallback"
    });
  });

  it("marks diagnostic output as degraded without losing semantic data", () => {
    const output = outputWithReaction();
    const viewModel = buildKnowledgeMapViewModel({
      ...output,
      diagnostics: [{
        code: "W_TEST",
        severity: "warning",
        message: "review required",
        range: {
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 2
        },
        quickFixes: []
      }]
    });

    expect(viewModel.state).toBe("degraded");
    expect(viewModel.semanticSummary.nodeCount).toBeGreaterThan(1);
  });

  it("returns failed state when compile output failed", () => {
    const failed = {
      status: "failed",
      documentUri: "experiments/bad.chemd",
      compiledAt: "2026-05-13T00:00:00.000Z",
      diagnostics: [],
      outline: [],
      semanticTokens: [],
      symbols: [],
      error: {
        code: "LS_COMPILE_FAILED",
        message: "failed"
      }
    } satisfies ChemdLanguageCompileOutput;
    const viewModel = buildKnowledgeMapViewModel(failed);

    expect(viewModel.state).toBe("failed");
    expect(viewModel.semanticTree).toBeNull();
    expect(viewModel.reactionSummary.reactionCount).toBe(0);
  });

  it("keeps empty documents explicit", () => {
    const viewModel = buildKnowledgeMapViewModel(compile(`---
id: empty-doc
title: Empty
date: 2026-05-13
---
`));

    expect(viewModel.state).toBe("empty");
    expect(viewModel.reactionSummary.reactionCount).toBe(0);
  });
});

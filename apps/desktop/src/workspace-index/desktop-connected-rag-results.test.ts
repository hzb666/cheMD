import { describe, expect, it } from "vitest";
import type { EditorGraphRagSourceRange } from "@chemd/language-service";

import type { DesktopWorkspaceRagResult } from "./desktop-rag-citation-gate";
import {
  mergeDesktopWorkspaceRagResults,
  normalizeConnectedRagRows,
  type DesktopConnectedRagRow
} from "./desktop-connected-rag-results";

const range = (startLine: number, endLine = startLine): EditorGraphRagSourceRange => ({
  startLine,
  startColumn: 1,
  endLine,
  endColumn: 20
});

const connectedRow = (
  overrides: Partial<DesktopConnectedRagRow> = {}
): DesktopConnectedRagRow => ({
  rowId: "connected-row-1",
  citationId: "citation-connected-1",
  revisionId: "revision-connected-1",
  chunkId: "chunk-connected-1",
  sourceRange: range(8, 10),
  documentPath: "experiments/connected.chemd.md",
  documentUri: "chemd-workspace://workspace/experiments/connected.chemd.md",
  text: "Connected evidence about solvent selection.",
  score: 0.82,
  ...overrides
});

const localResult = (
  overrides: Partial<DesktopWorkspaceRagResult> = {}
): DesktopWorkspaceRagResult => ({
  id: "rag-citation-local-1",
  citationId: "citation-local-1",
  revisionId: "revision-local-1",
  chunkId: "chunk-local-1",
  sourceRange: range(3),
  documentPath: "experiments/local.chemd.md",
  documentUri: "chemd-workspace://workspace/experiments/local.chemd.md",
  text: "Local evidence about reaction yield.",
  label: "Local evidence about reaction yield.",
  detail: "experiments/local.chemd.md citation-local-1 L3",
  locator: "citation-local-1 L3",
  ...overrides
});

describe("desktop connected RAG result normalization", () => {
  it("normalizes a valid connected pgvector row into a citation-backed panel result", () => {
    const normalized = normalizeConnectedRagRows([connectedRow()]);

    expect(normalized.blocked).toMatchObject({ count: 0, reasons: {} });
    expect(normalized.results).toEqual([
      expect.objectContaining({
        id: "connected-rag-citation-connected-1",
        citationId: "citation-connected-1",
        revisionId: "revision-connected-1",
        chunkId: "chunk-connected-1",
        sourceRange: range(8, 10),
        documentPath: "experiments/connected.chemd.md",
        documentUri: "chemd-workspace://workspace/experiments/connected.chemd.md",
        label: "Connected evidence about solvent selection.",
        locator: "citation-connected-1 L8-L10",
        source: "connected",
        score: 0.82
      })
    ]);
  });

  it("blocks connected rows that are missing a citation id", () => {
    const normalized = normalizeConnectedRagRows([
      connectedRow({
        rowId: "missing-citation",
        citationId: " "
      })
    ]);

    expect(normalized.results).toEqual([]);
    expect(normalized.blocked).toMatchObject({
      count: 1,
      reasons: { missing_required_field: 1 },
      items: [
        {
          rowId: "missing-citation",
          reason: "missing_required_field",
          missingFields: ["citationId"]
        }
      ]
    });
  });

  it("deduplicates local and connected results by citation or chunk", () => {
    const merged = mergeDesktopWorkspaceRagResults({
      localResults: [
        localResult({
          citationId: "citation-shared",
          chunkId: "chunk-shared"
        })
      ],
      connectedRows: [
        connectedRow({
          citationId: "citation-shared",
          chunkId: "chunk-shared",
          score: 0.95
        }),
        connectedRow({
          rowId: "same-chunk",
          citationId: "citation-connected-2",
          chunkId: "chunk-shared",
          score: 0.7
        })
      ]
    });

    expect(merged.results).toHaveLength(1);
    expect(merged.results[0]).toMatchObject({
      citationId: "citation-shared",
      chunkId: "chunk-shared",
      source: "connected"
    });
    expect(merged.blocked).toMatchObject({
      count: 2,
      reasons: { duplicate_result: 2 }
    });
  });

  it("sorts merged results by score first and lower distance next", () => {
    const merged = mergeDesktopWorkspaceRagResults({
      localResults: [],
      connectedRows: [
        connectedRow({
          rowId: "far-distance",
          citationId: "citation-distance-far",
          chunkId: "chunk-distance-far",
          score: null,
          distance: 0.8
        }),
        connectedRow({
          rowId: "high-score",
          citationId: "citation-score-high",
          chunkId: "chunk-score-high",
          score: 0.9,
          distance: 0.4
        }),
        connectedRow({
          rowId: "near-distance",
          citationId: "citation-distance-near",
          chunkId: "chunk-distance-near",
          score: null,
          distance: 0.2
        })
      ]
    });

    expect(merged.results.map((result) => result.chunkId)).toEqual([
      "chunk-score-high",
      "chunk-distance-near",
      "chunk-distance-far"
    ]);
  });
});

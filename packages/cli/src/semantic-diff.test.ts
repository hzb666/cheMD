import type { ChemdProgramDocument } from "@chemd/core";
import { describe, expect, it } from "vitest";

import { buildSemanticDiff } from "./semantic-diff";

const document = (
  yieldStartLine: number,
  yieldEndLine: number
): ChemdProgramDocument => ({
  type: "program_document",
  schemaVersion: "chemd-program-ast/v1",
  sourceLanguage: "chemd/program-v1",
  module: { kind: "module", name: "exp_diff", docs: [] },
  imports: [],
  meta: {
    kind: "meta",
    id: "exp-diff",
    title: "Diff",
    date: "2026-06-03",
    fields: {},
    docs: []
  },
  declarations: [
    {
      kind: "result",
      id: "res_main",
      qualifiedId: "exp_diff.res_main",
      docs: [],
      fields: {
        yield: {
          type: "percent",
          raw: "77%",
          value: 77,
          sourceSpan: {
            startLine: yieldStartLine,
            endLine: yieldEndLine
          }
        }
      },
      fieldSpans: {
        yield: {
          startLine: yieldStartLine,
          endLine: yieldEndLine
        }
      }
    }
  ],
  docs: [],
  diagnostics: [],
  source: ""
});

describe("buildSemanticDiff", () => {
  it("ignores volatile nested source mapping fields", () => {
    const diff = buildSemanticDiff(document(10, 10), document(20, 20));

    expect(diff.changes).toEqual([]);
  });

  it("ignores raw spelling when typed Chemd values are semantically equal", () => {
    const before = document(10, 10);
    const after: ChemdProgramDocument = {
      ...document(10, 10),
      declarations: before.declarations.map((item) =>
        item.kind === "result"
          ? {
              ...item,
              fields: {
                ...item.fields,
                yield: {
                  type: "percent",
                  raw: "77.0%",
                  value: 77
                }
              }
            }
          : item
      )
    };
    const diff = buildSemanticDiff(before, after);

    expect(diff.changes).toEqual([]);
  });

  it("diffs module meta imports and declaration field paths from the AST", () => {
    const before = document(10, 10);
    const after: ChemdProgramDocument = {
      ...document(10, 10),
      module: { kind: "module", name: "exp_diff_v2", docs: [] },
      imports: [
        {
          kind: "import",
          moduleName: "shared_solvents",
          from: "./shared-solvents.chemd",
          alias: "solvents",
          docs: []
        }
      ],
      meta: {
        ...before.meta,
        title: "Diff v2"
      },
      declarations: before.declarations.map((item) =>
        item.kind === "result"
          ? {
              ...item,
              fields: {
                ...item.fields,
                yield: {
                  type: "percent",
                  raw: "80%",
                  value: 80
                }
              }
            }
          : item
      )
    };
    const diff = buildSemanticDiff(before, after);

    expect(diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changeType: "changed",
        nodeType: "module",
        nodeId: "module",
        fields: expect.arrayContaining([
          expect.objectContaining({
            field: "name",
            before: "exp_diff",
            after: "exp_diff_v2"
          })
        ])
      }),
      expect.objectContaining({
        changeType: "changed",
        nodeType: "meta",
        nodeId: "exp-diff",
        fields: expect.arrayContaining([
          expect.objectContaining({
            field: "title",
            before: "Diff",
            after: "Diff v2"
          })
        ])
      }),
      expect.objectContaining({
        changeType: "added",
        nodeType: "import",
        nodeId: "solvents"
      }),
      expect.objectContaining({
        changeType: "changed",
        nodeType: "result",
        nodeId: "res_main",
        fields: expect.arrayContaining([
          expect.objectContaining({
            field: "fields.yield",
            before: expect.objectContaining({ type: "percent", value: 77 }),
            after: expect.objectContaining({ type: "percent", value: 80 })
          })
        ])
      })
    ]));
  });
});

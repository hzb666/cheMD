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
});

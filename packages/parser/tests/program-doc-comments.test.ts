import { describe, expect, it } from "vitest";

import { parseProgramDocComments } from "../src/program/doc-comments";

describe("program doc comments", () => {
  it("parses consecutive line doc comments and inline tokens", () => {
    const result = parseProgramDocComments(`/// Selected @rxn_var1 with \`yield\`
/// See :chem[PhBr] and [paper](https://example.test/paper).
reaction rxn_var1 {}`);

    expect(result.diagnostics).toEqual([]);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]).toMatchObject({
      type: "doc_comment",
      id: "doc_1",
      markdown: "Selected @rxn_var1 with `yield`\nSee :chem[PhBr] and [paper](https://example.test/paper).",
      attachment: { kind: "file" },
      exportPolicy: "render_rag",
      sourceSpan: {
        startLine: 1,
        startColumn: 1,
        endLine: 2
      }
    });
    expect(result.docs[0].references).toMatchObject([
      { raw: "@rxn_var1", source: "rxn_var1" }
    ]);
    expect(result.docs[0].inlineCode).toMatchObject([
      { raw: "`yield`", value: "yield" }
    ]);
    expect(result.docs[0].inlineChem).toMatchObject([
      { raw: ":chem[PhBr]", value: "PhBr" }
    ]);
    expect(result.docs[0].links).toMatchObject([
      { label: "paper", href: "https://example.test/paper", safe: true }
    ]);
  });

  it("parses markdown block doc comments", () => {
    const result = parseProgramDocComments(`/*md
# Heading

Narrative for @rxn_var1.
*/
molecule mol_1 {}`);

    expect(result.diagnostics).toEqual([]);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]).toMatchObject({
      id: "doc_1",
      markdown: "# Heading\n\nNarrative for @rxn_var1.",
      references: [{ raw: "@rxn_var1", source: "rxn_var1" }],
      sourceSpan: {
        startLine: 1,
        startColumn: 1,
        endLine: 5
      }
    });
  });

  it("adds source spans to unsafe markdown link diagnostics", () => {
    const result = parseProgramDocComments(
      "/// See [bad](javascript:alert(1)) before running."
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_UNSAFE_LINK_HREF",
        sourceSpan: expect.objectContaining({
          startLine: 1,
          startColumn: 5
        })
      })
    );
  });
});

import { describe, expect, it } from "vitest";

import type { ChemdProgramDocument, ChemdReferenceExpr, ChemdValue } from "@chemd/core";
import { resolveRenderProfile } from "@chemd/render-profile";

import { renderHtml } from "../src/index";

const stringValue = (value: string): ChemdValue => ({
  type: "string",
  raw: JSON.stringify(value),
  value
});

const quantityValue = (raw: string, unit: string, value?: number): ChemdValue => ({
  type: "quantity",
  raw,
  unit,
  value
});

const referenceValue = (target: string): ChemdReferenceExpr => ({
  type: "reference",
  refKind: "local",
  target,
  raw: `@${target}`
});

const createProgram = (): ChemdProgramDocument => ({
  type: "program_document",
  schemaVersion: "chemd-program-ast/v1",
  sourceLanguage: "chemd/program-v1",
  module: { kind: "module", name: "exp_html", docs: [] },
  meta: {
    kind: "meta",
    id: "exp-html-program",
    title: "Program HTML",
    date: "2026-05-29",
    fields: { operator: stringValue("Codex") },
    docs: []
  },
  imports: [],
  docs: [
    {
      type: "doc_comment",
      id: "doc-file",
      markdown: "# Notes\n\nFile level protocol.",
      attachment: { kind: "file" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_rag"
    },
    {
      type: "doc_comment",
      id: "doc-rxn",
      markdown: "Reaction card note.",
      attachment: { kind: "declaration", declarationId: "rxn_1" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_only"
    },
    {
      type: "doc_comment",
      id: "doc-agent",
      markdown: "Agent statement note.",
      attachment: { kind: "agent_statement", runId: "repair_1", statementId: "done" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "audit_only"
    }
  ],
  declarations: [
    {
      kind: "reaction",
      id: "rxn_1",
      qualifiedId: "exp_html.rxn_1",
      docs: [{ docId: "doc-rxn" }],
      fields: {
        reactant: referenceValue("mol_a"),
        temperature: quantityValue("80 C", "C", 80)
      }
    },
    {
      kind: "procedure",
      id: "proc_1",
      qualifiedId: "exp_html.proc_1",
      docs: [],
      evidence: [],
      children: [{
        kind: "step",
        id: "heat",
        family: "heat",
        args: { duration: quantityValue("2 h", "h", 2) },
        inputs: [referenceValue("mol_a")],
        outputs: [referenceValue("rxn_1")]
      }]
    },
    {
      kind: "agent_run",
      id: "repair_1",
      qualifiedId: "exp_html.repair_1",
      docs: [],
      goal: "repair source",
      status: "completed",
      toolCalls: [],
      evidence: [],
      patches: [],
      decisions: [],
      auditTimeline: [{ kind: "timeline_event", id: "done", event: "completed", summary: "Finished" }]
    }
  ],
  diagnostics: [{ code: "W_TEST", severity: "warning", message: "Check output" }]
});

describe("renderHtml", () => {
  it("renders program-native module, declarations, procedures, diagnostics, and agent audit", () => {
    const html = renderHtml(createProgram(), resolveRenderProfile(), {
      typedGraph: {
        documentId: "exp-html-program",
        nodes: [{ nodeId: "rxn_1", kind: "reaction" }],
        quantities: [],
        diagnostics: []
      }
    });

    expect(html).toContain("module exp_html");
    expect(html).toContain("Program HTML");
    expect(html).toContain("File level protocol.");
    expect(html).toContain("Reaction card note.");
    expect(html).toContain("Temperature");
    expect(html).toContain("80 C");
    expect(html).toContain("Procedure proc_1");
    expect(html).toContain("data-step-id=\"heat\"");
    expect(html).toContain("Agent Audit repair_1");
    expect(html).toContain("Finished");
    expect(html).toContain("W_TEST: Check output");
  });

  it("renders documentation markdown markers through bounded scanners", () => {
    const program = createProgram();
    program.docs[0].markdown = [
      "# Heading",
      "",
      "- [x] done",
      "1. ordered",
      "> quote",
      "",
      "[safe](https://example.test/path(a)) and `code`",
      "",
      "---"
    ].join("\n");

    const html = renderHtml(program, resolveRenderProfile());

    expect(html).toContain("chemd-markdown--h1");
    expect(html).toContain("chemd-task-checkbox");
    expect(html).toContain("<ol");
    expect(html).toContain("chemd-markdown-quote");
    expect(html).toContain('href="https://example.test/path(a)"');
    expect(html).toContain("chemd-inline-code");
    expect(html).toContain("chemd-markdown-hr");
  });

  it("keeps machine metadata out of visible program fields and renders procedure steps", () => {
    const html = renderHtml(createProgram(), resolveRenderProfile());

    expect(html).not.toContain("data-source-origin");
    expect(html).not.toContain("data-declared-kind");
    expect(html).not.toContain("data-ref");
    expect(html).not.toContain("Surface origin");
    expect(html).not.toContain("Declared kind");
    expect(html).not.toContain("<dt>Ref</dt>");
    expect(html).toContain("chemd-program-procedure");
    expect(html).toContain("data-step-id=\"heat\"");
    expect(html).toContain("<dt>Duration</dt><dd>2 h</dd>");
    expect(html).toContain("Inputs: @mol_a");
    expect(html).toContain("Outputs: @rxn_1");
  });

  it("accepts typed graph data through the program render document", () => {
    const html = renderHtml(createProgram(), resolveRenderProfile(), {
      typedGraph: {
        documentId: "exp-html-program",
        nodes: [{
          kind: "reaction",
          nodeId: "rxn_1"
        }],
        quantities: [],
        diagnostics: [{ code: "TG_WARN", severity: "warning", message: "Typed graph warning" }]
      }
    });

    expect(html).toContain("TG_WARN: Typed graph warning");
  });
});

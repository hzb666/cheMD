import type { ChemdProgramDocument, ChemdReferenceExpr, ChemdValue } from "@chemd/core";
import { describe, expect, it } from "vitest";

import { resolveRenderProfile } from "@chemd/render-profile";

import { renderDocxBridge, renderDocxMarkdown } from "../src/index";

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
  module: { kind: "module", name: "exp_docx", docs: [] },
  meta: {
    kind: "meta",
    id: "exp-docx",
    title: "Program DOCX",
    date: "2026-05-29",
    fields: { operator: stringValue("Codex") },
    docs: []
  },
  imports: [],
  docs: [
    {
      type: "doc_comment",
      id: "doc-file",
      markdown: "File level protocol.",
      attachment: { kind: "file" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_rag"
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
      kind: "molecule",
      id: "mol_a",
      qualifiedId: "exp_docx.mol_a",
      docs: [],
      fields: { name: stringValue("Aryl bromide") }
    },
    {
      kind: "reaction",
      id: "rxn_1",
      qualifiedId: "exp_docx.rxn_1",
      docs: [],
      fields: {
        reactant: referenceValue("mol_a"),
        temperature: quantityValue("80 C", "C", 80)
      }
    },
    {
      kind: "procedure",
      id: "proc_1",
      qualifiedId: "exp_docx.proc_1",
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
      qualifiedId: "exp_docx.repair_1",
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
  diagnostics: [{ code: "W_DOCX", severity: "warning", message: "Check output" }]
});

describe("DOCX bridge renderer", () => {
  it("renders program markdown from docs, declarations, procedure, agent audit, and diagnostics", () => {
    const markdown = renderDocxMarkdown(createProgram());

    expect(markdown).toContain("module: exp_docx");
    expect(markdown).toContain("# Program DOCX");
    expect(markdown).toContain("File level protocol.");
    expect(markdown).toContain("## Molecules");
    expect(markdown).toContain("### Molecule `mol_a`");
    expect(markdown).toContain("## Reactions");
    expect(markdown).toContain("- Temperature: 80 C");
    expect(markdown).toContain("## Procedure");
    expect(markdown).toContain("- Step heat: heat | duration=2 h | inputs=@mol_a | outputs=@rxn_1");
    expect(markdown).toContain("## Agent Audit");
    expect(markdown).toContain("Agent statement note.");
    expect(markdown).toContain("## Diagnostics");
  });

  it("emits v1.0 bridge payloads with semantic typed graph data", () => {
    const typedGraph = {
      documentId: "exp-docx",
      nodes: [{ nodeId: "rxn_1", kind: "reaction" }],
      quantities: [],
      diagnostics: []
    };
    const payload = JSON.parse(renderDocxBridge(createProgram(), resolveRenderProfile(), undefined, { typedGraph }));

    expect(payload).toMatchObject({
      version: "v1.0",
      program: {
        moduleName: "exp_docx",
        meta: { id: "exp-docx" }
      },
      semantic: {
        typedGraph: {
          nodes: [{ nodeId: "rxn_1" }]
        }
      },
      exportHints: {
        pipeline: "program-render-markdown-to-docx"
      }
    });
    expect(payload.document).toBeUndefined();
  });
});

import type { ChemdProgramDocument, ChemdReferenceExpr, ChemdValue } from "@chemd/core";
import { describe, expect, it } from "vitest";

import { renderJson } from "../src/index";

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
  module: { kind: "module", name: "exp_json", docs: [] },
  meta: {
    kind: "meta",
    id: "exp-json",
    title: "Program JSON",
    date: "2026-05-29",
    fields: { operator: stringValue("Codex") },
    docs: []
  },
  imports: [],
  docs: [
    {
      type: "doc_comment",
      id: "doc-file",
      markdown: "Protocol narrative for @rxn_1.",
      attachment: { kind: "file" },
      references: [{ type: "reference", kind: "object", raw: "@rxn_1", source: "rxn_1" }],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_rag"
    },
    {
      type: "doc_comment",
      id: "doc-rxn",
      markdown: "Reaction note.",
      attachment: { kind: "declaration", declarationId: "rxn_1" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_only"
    }
  ],
  declarations: [
    {
      kind: "molecule",
      id: "mol_a",
      qualifiedId: "exp_json.mol_a",
      docs: [],
      fields: { name: stringValue("Aryl bromide") }
    },
    {
      kind: "reaction",
      id: "rxn_1",
      qualifiedId: "exp_json.rxn_1",
      docs: [{ docId: "doc-rxn" }],
      fields: {
        reactant: referenceValue("mol_a"),
        temperature: quantityValue("80 C", "C", 80)
      }
    },
    {
      kind: "agent_run",
      id: "repair_1",
      qualifiedId: "exp_json.repair_1",
      docs: [],
      goal: "repair source",
      status: "completed",
      toolCalls: [{ kind: "tool", id: "shell", name: "shell_command", status: "ok" }],
      evidence: [],
      patches: [],
      decisions: [],
      auditTimeline: [{ kind: "timeline_event", id: "done", event: "completed" }]
    }
  ],
  diagnostics: []
});

describe("renderJson", () => {
  it("emits chemd-program-json/v1 without legacy body or markdown node output", () => {
    const payload = JSON.parse(renderJson(createProgram(), {
      typedGraph: {
        documentId: "exp-json",
        nodes: [{ kind: "reaction", nodeId: "rxn_1" }],
        quantities: [],
        diagnostics: []
      }
    }));
    const serialized = JSON.stringify(payload);

    expect(payload.program.schema_version).toBe("chemd-program-json/v1");
    expect(payload.program.module).toEqual({ name: "exp_json" });
    expect(payload.program.meta.fields.operator.text).toBe("Codex");
    expect(payload.program.declarations.rxn_1.fields.temperature.text).toBe("80 C");
    expect(payload.program.documentation["doc-file"].references).toEqual(["@rxn_1"]);
    expect(payload.program.agent_runs.repair_1.status).toBe("completed");
    expect(payload.semantic.typedGraph.nodes[0]).toMatchObject({ nodeId: "rxn_1" });
    expect(payload.document).toBeUndefined();
    expect(serialized).not.toContain("raw_children");
    expect(serialized).not.toContain("\"body\"");
    expect(serialized).not.toContain("\"type\":\"markdown\"");
  });
});

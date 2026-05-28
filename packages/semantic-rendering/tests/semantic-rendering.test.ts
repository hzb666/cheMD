import type { ChemdProgramDocument, ChemdReferenceExpr, ChemdValue } from "@chemd/core";
import { describe, expect, it } from "vitest";

import {
  buildProgramRenderDocument,
  buildChemdShellAttributes,
  buildSemanticRenderTree,
  type ChemdSemanticRenderDocument
} from "../src/index";

const createDocument = (children: unknown[]): ChemdSemanticRenderDocument => ({
  type: "document",
  meta: {
    id: "doc-1",
    title: "Semantic render test",
    date: "2026-05-13"
  },
  children,
  diagnostics: []
});

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
  module: { kind: "module", name: "exp_program", docs: [{ docId: "doc-module" }] },
  meta: {
    kind: "meta",
    id: "exp-program",
    title: "Program render test",
    date: "2026-05-29",
    fields: { operator: stringValue("Codex") },
    docs: []
  },
  imports: [],
  docs: [
    {
      type: "doc_comment",
      id: "doc-file",
      markdown: "File level protocol notes.",
      attachment: { kind: "file" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_rag"
    },
    {
      type: "doc_comment",
      id: "doc-module",
      markdown: "Module notes.",
      attachment: { kind: "module", moduleName: "exp_program" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_only"
    },
    {
      type: "doc_comment",
      id: "doc-rxn",
      markdown: "Reaction declaration note.",
      attachment: { kind: "declaration", declarationId: "rxn_1" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_rag"
    },
    {
      type: "doc_comment",
      id: "doc-temperature",
      markdown: "Keep this below reflux.",
      attachment: { kind: "field", declarationId: "rxn_1", fieldName: "temperature" },
      references: [],
      inlineChem: [],
      inlineCode: [],
      links: [],
      exportPolicy: "render_only"
    },
    {
      type: "doc_comment",
      id: "doc-agent",
      markdown: "Agent approved the patch.",
      attachment: { kind: "agent_statement", runId: "repair_1", statementId: "decision_1" },
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
      qualifiedId: "exp_program.mol_a",
      docs: [],
      fields: { name: stringValue("Aryl bromide") }
    },
    {
      kind: "reaction",
      id: "rxn_1",
      qualifiedId: "exp_program.rxn_1",
      docs: [{ docId: "doc-rxn" }],
      fields: {
        reactant: referenceValue("mol_a"),
        temperature: quantityValue("80 C", "C", 80)
      }
    },
    {
      kind: "procedure",
      id: "proc_1",
      qualifiedId: "exp_program.proc_1",
      docs: [],
      target: referenceValue("rxn_1"),
      evidence: [],
      children: [{
        kind: "step",
        id: "heat",
        family: "heat",
        args: { duration: quantityValue("2 h", "h", 2) },
        inputs: [referenceValue("mol_a")],
        outputs: [referenceValue("rxn_1")],
        dependsOn: []
      }]
    },
    {
      kind: "agent_run",
      id: "repair_1",
      qualifiedId: "exp_program.repair_1",
      docs: [],
      goal: "repair source",
      status: "completed",
      toolCalls: [{ kind: "tool", id: "shell", name: "shell_command", status: "ok" }],
      evidence: [],
      patches: [],
      decisions: [{ kind: "decision", id: "decision_1", decision: "approved" }],
      auditTimeline: [{ kind: "timeline_event", id: "done", event: "completed", summary: "Finished" }]
    }
  ],
  diagnostics: []
});

describe("semantic render tree", () => {
  it("builds a program render document with docs, declarations, procedures, and agent audit", () => {
    const renderDocument = buildProgramRenderDocument(createProgram(), {
      typedGraph: {
        documentId: "exp-program",
        nodes: [{ nodeId: "rxn_1", kind: "reaction" }, { nodeId: "heat", kind: "step" }],
        quantities: [],
        diagnostics: []
      }
    });

    expect(renderDocument.moduleName).toBe("exp_program");
    expect(renderDocument.sections.map((section) => section.kind)).toEqual([
      "documentation",
      "documentation",
      "declaration",
      "declaration",
      "procedure",
      "agent_run"
    ]);
    expect(renderDocument.sections.find((section) => section.kind === "declaration" && section.id === "rxn_1")).toMatchObject({
      fields: {
        temperature: { type: "quantity", raw: "80 C" }
      },
      fieldDocs: {
        temperature: [{ id: "doc-temperature" }]
      },
      typedNode: { nodeId: "rxn_1" }
    });
    expect(renderDocument.sections.find((section) => section.kind === "procedure")).toMatchObject({
      statements: [{ kind: "step", id: "heat", typedNode: { nodeId: "heat" } }]
    });
    expect(renderDocument.sections.find((section) => section.kind === "agent_run")).toMatchObject({
      statementDocs: [{ id: "doc-agent" }]
    });
  });

  it("builds molecule and reaction renderable nodes with stable ids", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "molecule", id: "mol-a", name: "A", smiles: "CCO" },
      { type: "reaction", id: "rxn-1", reactants: ["mol-a"], products: ["mol-b"] }
    ]));

    expect(tree.nodes.map((node) => node.node_id)).toEqual([
      "document::doc-1",
      "molecule::mol-a",
      "reaction::rxn-1"
    ]);
    expect(tree.nodes[1]).toMatchObject({
      node_type: "ChemdMoleculeNode",
      entity_id: "molecule::mol-a",
      render: { component: "MoleculeBlock", hydrate: "visible" }
    });
    expect(tree.nodes[2]).toMatchObject({
      node_type: "ChemdReactionNode",
      entity_id: "reaction::rxn-1",
      render: { component: "ReactionBlock", hydrate: "visible" }
    });
  });

  it("preserves procedure and result nodes in document order", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "procedure", id: "proc-1", steps: [{ type: "step", stepId: "s1", family: "add" }] },
      { type: "result", id: "res-1", yield: "83%" }
    ]));

    expect(tree.nodes.map((node) => node.node_type)).toEqual([
      "ChemdDocumentNode",
      "ChemdProcedureNode",
      "ChemdProcedureStepNode",
      "ChemdResultNode"
    ]);
    expect(tree.nodes.map((node) => node.node_id)).toEqual([
      "document::doc-1",
      "procedure::proc-1",
      "procedure-step::s1",
      "result::res-1"
    ]);
  });

  it("renders condition attempts, observation events, controls, and trace logs as first-class nodes", () => {
    const tree = buildSemanticRenderTree(createDocument([
      {
        type: "condition_varies",
        id: "screen-1",
        attempts: [{
          id: "a1",
          raw: "temp=80 C",
          result: "res-1",
          changes: [],
          condition: []
        }]
      },
      {
        type: "procedure",
        id: "proc-1",
        steps: [{ type: "step", stepId: "s1", family: "add" }],
        controls: [{ type: "control", controlId: "repeat-1", kind: "repeat", children: [] }]
      },
      {
        type: "observation",
        id: "obs-1",
        events: [{ type: "event", eventId: "evt-1", eventType: "color", linkedStepId: "s1" }]
      },
      {
        type: "trace",
        id: "trace-1",
        events: [{ type: "trace_event", eventId: "log-1", eventType: "started", stepId: "s1" }]
      }
    ]));

    expect(tree.nodes.map((node) => node.node_type)).toEqual(expect.arrayContaining([
      "ChemdConditionNode",
      "ChemdConditionAttemptNode",
      "ChemdProcedureControlNode",
      "ChemdObservationEventNode",
      "ChemdTraceNode",
      "ChemdTraceEventNode"
    ]));
    expect(tree.nodes.find((node) => node.node_type === "ChemdConditionAttemptNode")).toMatchObject({
      node_id: "condition-attempt::screen-1.a1",
      semantic_id: "screen-1.a1",
      attrs: {
        attempt_id: "a1",
        result: "res-1"
      }
    });
    expect(tree.nodes.filter((node) => node.node_type === "ChemdUnknownNode")).toEqual([]);
  });

  it("preserves source ranges and compiler diagnostics", () => {
    const document = createDocument([
      {
        type: "result",
        id: "res-source",
        yield: "91%",
        sourceSpan: { start: 10, end: 30, startLine: 3, endLine: 4 }
      }
    ]);
    const tree = buildSemanticRenderTree({
      document,
      sourceHash: "hash-1",
      diagnostics: [
        {
          code: "result.warning",
          severity: "warning",
          message: "Check isolated mass",
          nodeId: "res-source"
        }
      ]
    });

    const resultNode = tree.nodes.find((node) => node.semantic_id === "res-source");
    expect(resultNode?.source_ref).toEqual({
      source_kind: "chemd",
      source_uri: undefined,
      start_line: 3,
      end_line: 4,
      start_offset: 10,
      end_offset: 30,
      source_hash: "hash-1"
    });
    expect(resultNode?.diagnostics).toEqual([
      {
        code: "result.warning",
        severity: "warning",
        message: "Check isolated mass",
        node_id: "res-source",
        source_ref: undefined,
        facts: undefined
      }
    ]);
    expect(tree.warnings).toHaveLength(1);
  });

  it("builds data-chemd shell attributes without DOM or React output", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "reaction", id: "rxn-attrs", products: ["p1"] }
    ]));
    const reactionNode = tree.nodes[1];

    expect(buildChemdShellAttributes(reactionNode)).toEqual({
      "data-chemd-node-id": "reaction::rxn-attrs",
      "data-chemd-type": "ChemdReactionNode",
      "data-chemd-component": "ReactionBlock",
      "data-chemd-hydrate": "visible",
      "data-chemd-render-state": "placeholder",
      "data-chemd-document-id": "doc-1",
      "data-chemd-entity-id": "reaction::rxn-attrs",
      "data-chemd-semantic-id": "rxn-attrs"
    });
  });

  it("keeps unknown nodes renderable through a fallback directive", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "future_cluster_map", id: "map-1", label: "future" }
    ]));
    const unknownNode = tree.nodes[1];

    expect(unknownNode).toMatchObject({
      node_id: "unknown::map-1",
      node_type: "ChemdUnknownNode",
      render: {
        component: "UnknownChemdNode",
        hydrate: "never",
        fallback: "Unsupported Chemd node"
      },
      attrs: {
        type: "future_cluster_map",
        id: "map-1",
        label: "future",
        unknown_type: "future_cluster_map"
      }
    });
    expect(tree.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic_rendering.unknown_node_type",
      severity: "error"
    }));
  });
});

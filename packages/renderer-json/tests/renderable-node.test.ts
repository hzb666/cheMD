import { describe, expect, it } from "vitest";

import type { ProgramRenderDocument } from "@chemd/semantic-rendering";

import { buildRenderableNodeTree } from "../src/index";

const renderDocument = (): ProgramRenderDocument => ({
  schema_version: "chemd-program-render/v1",
  sourceLanguage: "chemd/program-v1",
  moduleName: "renderable_case",
  meta: {
    id: "exp-render",
    title: "Renderable",
    date: "2026-05-13",
    fields: {},
    docs: []
  },
  imports: [],
  sections: [
    {
      kind: "documentation",
      id: "file-docs",
      title: "Documentation",
      docs: [{
        id: "doc-file-1",
        markdown: "## Note\nInline content",
        attachment: { kind: "file" },
        references: [],
        exportPolicy: "render_rag",
        sourceSpan: { startLine: 2, startColumn: 1, endLine: 4, endColumn: 3 }
      }]
    },
    {
      kind: "declaration",
      declarationKind: "molecule",
      id: "mol-a",
      qualifiedId: "renderable_case.mol-a",
      docs: [],
      fieldDocs: {},
      fields: {
        name: { type: "string", raw: "\"Ethanol\"", value: "Ethanol" },
        smiles: { type: "string", raw: "\"CCO\"", value: "CCO" }
      }
    },
    {
      kind: "declaration",
      declarationKind: "reaction",
      id: "rxn-a",
      qualifiedId: "renderable_case.rxn-a",
      docs: [],
      fieldDocs: {},
      fields: {
        reactants: { type: "list", raw: "[@mol-a]", items: [{ type: "reference", raw: "@mol-a", refKind: "local", target: "mol-a" }] },
        products: { type: "list", raw: "[@mol-b]", items: [{ type: "reference", raw: "@mol-b", refKind: "local", target: "mol-b" }] }
      }
    },
    {
      kind: "procedure",
      id: "proc-a",
      qualifiedId: "renderable_case.proc-a",
      target: { raw: "@rxn-a", refKind: "local", target: "rxn-a" },
      evidence: [],
      docs: [],
      statements: [{
        kind: "step",
        id: "s_charge",
        family: "charge",
        args: { stage: { type: "identifier", raw: "setup", name: "setup" } },
        inputs: [{ raw: "@mol-a", refKind: "local", target: "mol-a" }],
        outputs: [],
        dependsOn: [],
        evidence: [],
        docs: []
      }]
    },
    {
      kind: "agent_run",
      id: "repair-001",
      qualifiedId: "renderable_case.repair-001",
      goal: "repair primary result",
      status: "completed",
      targetFiles: ["screen.chemd"],
      docs: [],
      toolCalls: [],
      evidence: [],
      patches: [],
      decisions: [],
      auditTimeline: [],
      statementDocs: []
    }
  ],
  diagnostics: [],
  semantic: {
    typedGraph: {
      documentId: "exp-render",
      nodes: [],
      quantities: [],
      diagnostics: []
    }
  }
});

describe("buildRenderableNodeTree", () => {
  it("builds a program-native renderable DTO from sections", () => {
    const tree = buildRenderableNodeTree(renderDocument());

    expect(tree.schemaVersion).toBe("chemd.renderable-node.v1");
    expect(tree.root.children.map((node) => node.kind)).toEqual([
      "documentation",
      "declaration",
      "declaration",
      "procedure",
      "agent_run"
    ]);
    expect(tree.root.children[1]).toMatchObject({
      nodeId: "document.02_mol-a.mol-a",
      kind: "declaration",
      label: "mol-a",
      directive: {
        kind: "hydrate",
        target: "molecule",
        hydration: { mode: "lazy", key: "document.02_mol-a.mol-a", status: "ready" }
      }
    });
    expect(tree.root.children[2].directive).toMatchObject({
      kind: "hydrate",
      target: "reaction"
    });
  });

  it("builds documentation text nodes with source refs", () => {
    const tree = buildRenderableNodeTree(renderDocument(), { sourceId: "file:///screen.chemd" });
    const doc = tree.root.children[0].children[0];

    expect(doc).toMatchObject({
      kind: "documentation",
      label: "## Note",
      directive: { kind: "text", text: "## Note\nInline content" },
      range: { startLine: 2, startColumn: 1, endLine: 4, endColumn: 3 },
      sourceRefs: [{
        sourceId: "file:///screen.chemd",
        range: { startLine: 2, startColumn: 1, endLine: 4, endColumn: 3 }
      }]
    });
  });

  it("preserves procedure step nesting", () => {
    const procedure = buildRenderableNodeTree(renderDocument()).root.children[3];

    expect(procedure.kind).toBe("procedure");
    expect(procedure.children[0]).toMatchObject({
      kind: "procedure_step",
      label: "charge s_charge",
      directive: {
        kind: "semantic",
        target: "procedure_step"
      }
    });
  });

  it("keeps stable ids across repeated builds", () => {
    const firstTree = buildRenderableNodeTree(renderDocument());
    const secondTree = buildRenderableNodeTree(renderDocument());

    expect(secondTree).toEqual(firstTree);
    expect(firstTree.root.children.map((node) => node.nodeId)).toEqual([
      "document.01_file-docs.file-docs",
      "document.02_mol-a.mol-a",
      "document.03_rxn-a.rxn-a",
      "document.04_proc-a.proc-a",
      "document.05_repair-001.repair-001"
    ]);
  });

  it("builds an empty document root", () => {
    const input = renderDocument();
    input.sections = [];

    const tree = buildRenderableNodeTree(input);

    expect(tree.root).toEqual({
      nodeId: "document",
      kind: "document",
      label: "Renderable",
      directive: { kind: "document", display: "flow" },
      children: []
    });
  });
});

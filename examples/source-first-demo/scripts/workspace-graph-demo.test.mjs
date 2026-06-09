import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildGraphViewerData,
  renderGraphViewerHtml
} from "./demo-workspace-graph.mjs";

const demoRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(demoRoot, "..", "..");
const scriptPath = path.join(demoRoot, "scripts", "demo-workspace-graph.mjs");

const graphIndex = {
  schema_version: "chemd-training-graph-index/v0.1",
  index_scope: {
    document_ids: ["doc-a", "doc-b"],
    sources: []
  },
  nodes: [
    { node_id: "doc::doc-a", node_type: "document", document_id: "doc-a", label: "Doc A" },
    { node_id: "doc::doc-b", node_type: "document", document_id: "doc-b", label: "Doc B" },
    { node_id: "rxn::doc-a::rxn_main", node_type: "reaction", document_id: "doc-a", label: "rxn_main" },
    { node_id: "proc::doc-a::proc_main", node_type: "procedure", document_id: "doc-a", label: "proc_main" },
    { node_id: "step::doc-a::proc_main::charge", node_type: "procedure_step", document_id: "doc-a", label: "charge" },
    { node_id: "step::doc-a::proc_main::heat", node_type: "procedure_step", document_id: "doc-a", label: "heat" },
    { node_id: "mol::doc-b::mol_shared", node_type: "molecule", document_id: "doc-b", label: "mol_shared" },
    { node_id: "mat::doc-b::cat_shared", node_type: "material", document_id: "doc-b", label: "cat_shared" },
    { node_id: "value::rxn::doc-a::rxn_main::temperature", node_type: "field_value", document_id: "doc-a", label: "temperature: reflux" }
  ],
  edges: [
    {
      edge_id: "workspace::document_imports_document::doc-a::doc-b",
      edge_type: "document_imports_document",
      from_node_id: "doc::doc-a",
      to_node_id: "doc::doc-b",
      document_id: "doc-a",
      confidence: 1,
      properties: { edge_source: "workspace_linker" }
    },
    {
      edge_id: "workspace::reaction_uses_imported_molecule::rxn::doc-a::rxn_main::mol::doc-b::mol_shared",
      edge_type: "reaction_uses_imported_molecule",
      from_node_id: "rxn::doc-a::rxn_main",
      to_node_id: "mol::doc-b::mol_shared",
      document_id: "doc-a",
      confidence: 1,
      properties: { edge_source: "workspace_linker" }
    },
    {
      edge_id: "kg::procedure_has_step::proc_main::charge",
      edge_type: "procedure_has_step",
      from_node_id: "proc::doc-a::proc_main",
      to_node_id: "step::doc-a::proc_main::charge",
      document_id: "doc-a",
      confidence: 1,
      properties: { edge_source: "procedure_logic" }
    },
    {
      edge_id: "kg::step_precedes_step::charge::heat",
      edge_type: "step_precedes_step",
      from_node_id: "step::doc-a::proc_main::charge",
      to_node_id: "step::doc-a::proc_main::heat",
      document_id: "doc-a",
      confidence: 1,
      properties: { edge_source: "procedure_logic" }
    },
    {
      edge_id: "workspace::procedure_step_uses_material::charge::cat",
      edge_type: "procedure_step_uses_material",
      from_node_id: "step::doc-a::proc_main::charge",
      to_node_id: "mat::doc-b::cat_shared",
      document_id: "doc-a",
      confidence: 1,
      properties: { edge_source: "workspace_linker" }
    }
  ],
  reaction_features: [],
  reaction_clusters: [],
  reaction_similarity_edges: [],
  warnings: []
};

test("buildGraphViewerData preserves edge types and marks cross-document edges", () => {
  const viewerData = buildGraphViewerData(graphIndex);

  assert.equal(viewerData.nodes.length, 9);
  assert.equal(viewerData.links.length, 5);
  assert.equal(
    viewerData.nodes.find((node) => node.id.startsWith("value::"))?.isValueNode,
    true
  );
  assert.deepEqual(viewerData.edgeTypes, [
    "document_imports_document",
    "procedure_has_step",
    "procedure_step_uses_material",
    "reaction_uses_imported_molecule",
    "step_precedes_step"
  ]);
  assert.equal(
    viewerData.links.find((link) => link.edgeType === "reaction_uses_imported_molecule")?.crossDocument,
    true
  );
  assert.equal(
    viewerData.links.find((link) => link.edgeType === "step_precedes_step")?.crossDocument,
    false
  );
});

test("buildGraphViewerData creates collapsed and sequence-oriented view modes", () => {
  const viewerData = buildGraphViewerData(graphIndex);

  assert.equal(viewerData.defaultView, "documents");
  assert.deepEqual(Object.keys(viewerData.views), [
    "documents",
    "procedure-sequence",
    "material-flow",
    "full"
  ]);
  assert.deepEqual(
    viewerData.views.documents.nodes.map((node) => node.nodeType).sort(),
    ["document", "document"]
  );
  assert.deepEqual(
    viewerData.views["procedure-sequence"].links.map((link) => link.edgeType),
    ["step_precedes_step"]
  );
  assert.equal(
    viewerData.views["procedure-sequence"].nodes.every((node) => typeof node.fx === "number" && typeof node.fy === "number"),
    true
  );
  assert.equal(
    viewerData.views["material-flow"].links.some((link) => link.edgeType === "procedure_step_uses_material"),
    true
  );
});

test("renderGraphViewerHtml embeds force-graph and graph payload", () => {
  const html = renderGraphViewerHtml(graphIndex, {
    title: "Fixture graph"
  });

  assert.match(html, /force-graph@1\.51\.4/);
  assert.match(html, /document_imports_document/);
  assert.match(html, /reaction_uses_imported_molecule/);
  assert.match(html, /Procedure Sequence/);
  assert.match(html, /Material Flow/);
  assert.match(html, /Cross-document only/);
});

test("demo-workspace-graph writes an HTML viewer for reaction-flight-deck", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chemd-workspace-graph-demo-"));
  const outPath = path.join(dir, "viewer.html");

  try {
    const result = spawnSync(process.execPath, [scriptPath, "--out", outPath], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(outPath), true);

    const html = readFileSync(outPath, "utf8");
    assert.match(html, /Chemd workspace graph/);
    assert.match(html, /demo-screen-comparison/);
    assert.match(html, /si-rsc-2009-aqueous-suzuki/);
    assert.match(html, /si-nature-2024-ptc-suzuki/);
    assert.match(html, /si-nature-2024-ptc-tbab/);
    assert.match(html, /real-si-comparison/);
    assert.match(html, /document_imports_document/);
    assert.match(html, /procedure_step_uses_material/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

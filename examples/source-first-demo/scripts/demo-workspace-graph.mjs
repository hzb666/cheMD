#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const demoRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(demoRoot, "..", "..");
const chemdCliPath = path.join(repoRoot, "packages", "cli", "bin", "chemd.mjs");
const defaultSourceFiles = [
  "examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd",
  "examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd",
  "examples/source-first-demo/reaction-flight-deck/amidation-benzylamide.chemd",
  "examples/source-first-demo/reaction-flight-deck/screen-comparison.chemd",
  "examples/source-first-demo/reaction-flight-deck/si-rsc-2009-aqueous-suzuki.chemd",
  "examples/source-first-demo/reaction-flight-deck/si-rsc-2011-neat-water-suzuki.chemd",
  "examples/source-first-demo/reaction-flight-deck/si-rsc-2019-continuous-flow.chemd",
  "examples/source-first-demo/reaction-flight-deck/si-nature-2024-ptc-suzuki.chemd",
  "examples/source-first-demo/reaction-flight-deck/si-nature-2024-ptc-tbab.chemd",
  "examples/source-first-demo/reaction-flight-deck/real-si-comparison.chemd"
];
const forceGraphCdn = "https://unpkg.com/force-graph@1.51.4/dist/force-graph.min.js";

const compareStrings = (left, right) => left.localeCompare(right, "en");

const uniqueStrings = (values) =>
  Array.from(new Set(values.filter((value) => typeof value === "string" && value.length > 0)))
    .sort(compareStrings);

const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const safeJsonForHtml = (value) =>
  JSON.stringify(value).replace(/</g, "\\u003c");

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const labelForNode = (node) =>
  node.label || node.original_id || node.entity_id || node.node_id;

const isValueNode = (node) => {
  const nodeType = String(node.node_type || "");
  const nodeId = String(node.node_id || "");
  return nodeType === "value"
    || nodeType.endsWith("_value")
    || nodeType.includes("value")
    || nodeId.startsWith("value::")
    || nodeId.startsWith("raw-value::");
};

const nodeValue = (node) => {
  if (node.node_type === "document") return 8;
  if (node.node_type === "reaction") return 6;
  if (node.node_type === "condition_screen") return 5;
  if (String(node.node_type).startsWith("runtime_")) return 3;
  return 4;
};

const uniqueById = (items) => Array.from(
  new Map(items.map((item) => [item.id, item])).values()
);

const endpointId = (value) =>
  value && typeof value === "object" ? value.id : value;

const cloneLink = (link) => ({
  ...link,
  source: endpointId(link.source),
  target: endpointId(link.target)
});

const createView = (id, label, description, nodes, links, layout = "force") => ({
  id,
  label,
  description,
  layout,
  summary: {
    nodeCount: nodes.length,
    edgeCount: links.length
  },
  nodes,
  links
});

const parseStepNodeId = (nodeId) => {
  const match = String(nodeId).match(/^step::([^:]+)::([^:]+)::(.+)$/);
  return match
    ? { documentId: match[1], procedureId: match[2], stepId: match[3] }
    : undefined;
};

const procedureKeyForStep = (nodeId) => {
  const parsed = parseStepNodeId(nodeId);
  return parsed ? `${parsed.documentId}::${parsed.procedureId}` : "";
};

const orderedStepsForProcedure = (stepIds, links) => {
  const stepSet = new Set(stepIds);
  const next = new Map();
  const incoming = new Set();

  links
    .filter((link) =>
      link.edgeType === "step_precedes_step"
      && stepSet.has(endpointId(link.source))
      && stepSet.has(endpointId(link.target))
    )
    .forEach((link) => {
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      next.set(source, [...(next.get(source) ?? []), target].sort(compareStrings));
      incoming.add(target);
    });

  const ordered = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
    (next.get(id) ?? []).forEach(visit);
  };

  stepIds.filter((id) => !incoming.has(id)).sort(compareStrings).forEach(visit);
  stepIds.sort(compareStrings).forEach(visit);
  return ordered;
};

const positionDocumentNodes = (nodes) => {
  const radius = Math.max(160, nodes.length * 38);
  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
    return {
      ...node,
      fx: 360 + Math.cos(angle) * radius,
      fy: 260 + Math.sin(angle) * radius,
      val: 9
    };
  });
};

const buildDocumentView = (nodes, links) => {
  const documentNodes = positionDocumentNodes(nodes.filter((node) => node.nodeType === "document"));
  const visibleIds = new Set(documentNodes.map((node) => node.id));
  const documentLinks = links
    .filter((link) =>
      link.edgeType === "document_imports_document"
      && visibleIds.has(endpointId(link.source))
      && visibleIds.has(endpointId(link.target))
    )
    .map(cloneLink);

  return createView(
    "documents",
    "Documents",
    "Collapsed module-level imports and cross-document dependencies.",
    documentNodes,
    documentLinks,
    "fixed"
  );
};

const buildProcedureSequenceView = (nodes, links) => {
  const stepNodes = nodes.filter((node) => node.nodeType === "procedure_step");
  const groups = new Map();
  stepNodes.forEach((node) => {
    const key = procedureKeyForStep(node.id);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), node.id]);
  });

  const positioned = [];
  const orderIndex = new Map();
  [...groups.entries()].sort(([left], [right]) => compareStrings(left, right)).forEach(([groupKey, stepIds], row) => {
    orderedStepsForProcedure(stepIds, links).forEach((stepId, index) => {
      const node = stepNodes.find((item) => item.id === stepId);
      if (!node) return;
      orderIndex.set(stepId, { row, index, groupKey });
      positioned.push({
        ...node,
        fx: 120 + index * 150,
        fy: 110 + row * 96,
        val: 5,
        viewGroup: groupKey
      });
    });
  });

  const visibleIds = new Set(positioned.map((node) => node.id));
  const sequenceLinks = links
    .filter((link) =>
      link.edgeType === "step_precedes_step"
      && visibleIds.has(endpointId(link.source))
      && visibleIds.has(endpointId(link.target))
    )
    .map(cloneLink);

  return createView(
    "procedure-sequence",
    "Procedure Sequence",
    "Procedure steps arranged by recorded step_precedes_step order.",
    positioned,
    sequenceLinks,
    "fixed"
  );
};

const MATERIAL_FLOW_EDGE_TYPES = new Set([
  "procedure_targets_reaction",
  "procedure_step_uses_molecule",
  "procedure_step_uses_material",
  "reaction_uses_imported_molecule",
  "reaction_produces_imported_product",
  "result_describes_reaction"
]);

const buildMaterialFlowView = (nodes, links) => {
  const flowLinks = links
    .filter((link) => MATERIAL_FLOW_EDGE_TYPES.has(link.edgeType))
    .map(cloneLink);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIds = new Set(flowLinks.flatMap((link) => [endpointId(link.source), endpointId(link.target)]));
  const byColumnCount = new Map();
  const flowNodes = uniqueById([...nodeIds].flatMap((id) => {
    const node = nodeById.get(id);
    if (!node) return [];
    const column = node.nodeType === "molecule" || node.nodeType === "material" || node.nodeType === "batch" || node.nodeType === "sample"
      ? 0
      : node.nodeType === "procedure_step" || node.nodeType === "procedure"
        ? 1
        : 2;
    const columnIndex = byColumnCount.get(column) ?? 0;
    byColumnCount.set(column, columnIndex + 1);
    return [{
      ...node,
      fx: 110 + column * 310,
      fy: 80 + columnIndex * 56,
      val: node.nodeType === "procedure_step" ? 5 : node.val
    }];
  }));

  return createView(
    "material-flow",
    "Material Flow",
    "Reactions and procedure steps linked to shared reagent entities.",
    flowNodes,
    flowLinks.filter((link) =>
      flowNodes.some((node) => node.id === endpointId(link.source))
      && flowNodes.some((node) => node.id === endpointId(link.target))
    ),
    "fixed"
  );
};

const buildFullView = (nodes, links) =>
  createView(
    "full",
    "Full Entity Graph",
    "Every graph node and edge emitted by chemd graph.",
    nodes.map((node) => ({ ...node })),
    links.map(cloneLink)
  );

const buildViewerViews = (nodes, links) => {
  const views = [
    buildDocumentView(nodes, links),
    buildProcedureSequenceView(nodes, links),
    buildMaterialFlowView(nodes, links),
    buildFullView(nodes, links)
  ];
  return Object.fromEntries(views.map((view) => [view.id, view]));
};

export const buildGraphViewerData = (graphIndex) => {
  const rawNodes = Array.isArray(graphIndex.nodes) ? graphIndex.nodes : [];
  const rawEdges = Array.isArray(graphIndex.edges) ? graphIndex.edges : [];
  const rawSimilarityEdges = Array.isArray(graphIndex.reaction_similarity_edges)
    ? graphIndex.reaction_similarity_edges
    : [];
  const nodeById = new Map(rawNodes.map((node) => [node.node_id, node]));

  const nodes = rawNodes.map((node) => ({
    id: node.node_id,
    label: labelForNode(node),
    documentId: node.document_id || "",
    entityId: node.entity_id || "",
    nodeType: node.node_type || "unknown",
    originalId: node.original_id || "",
    isValueNode: isValueNode(node),
    properties: asObject(node.properties),
    val: nodeValue(node)
  }));

  const graphLinks = rawEdges.flatMap((edge) => {
    const source = nodeById.get(edge.from_node_id);
    const target = nodeById.get(edge.to_node_id);
    if (!source || !target) return [];

    return [{
      id: edge.edge_id,
      source: edge.from_node_id,
      target: edge.to_node_id,
      edgeType: edge.edge_type || "unknown",
      documentId: edge.document_id || "",
      confidence: edge.confidence ?? null,
      properties: asObject(edge.properties),
      edgeSource: asObject(edge.properties).edge_source || "",
      crossDocument: Boolean(source.document_id && target.document_id && source.document_id !== target.document_id)
    }];
  });

  const similarityLinks = rawSimilarityEdges.flatMap((edge) => {
    if (!nodeById.has(edge.from_reaction_entity_id) || !nodeById.has(edge.to_reaction_entity_id)) {
      return [];
    }

    const source = nodeById.get(edge.from_reaction_entity_id);
    const target = nodeById.get(edge.to_reaction_entity_id);
    return [{
      id: edge.edge_id,
      source: edge.from_reaction_entity_id,
      target: edge.to_reaction_entity_id,
      edgeType: "reaction_similarity",
      documentId: "",
      confidence: edge.score ?? null,
      properties: {
        basis: Array.isArray(edge.basis) ? edge.basis.join(", ") : "",
        warnings: Array.isArray(edge.warnings) ? edge.warnings.join(", ") : ""
      },
      edgeSource: "reaction_similarity",
      crossDocument: Boolean(source?.document_id && target?.document_id && source.document_id !== target.document_id)
    }];
  });

  const links = [...graphLinks, ...similarityLinks];

  return {
    schemaVersion: graphIndex.schema_version || "unknown",
    summary: {
      documentCount: graphIndex.index_scope?.document_ids?.length ?? 0,
      nodeCount: nodes.length,
      edgeCount: links.length,
      graphEdgeCount: graphLinks.length,
      similarityEdgeCount: similarityLinks.length,
      warningCount: Array.isArray(graphIndex.warnings) ? graphIndex.warnings.length : 0
    },
    documentIds: uniqueStrings(nodes.map((node) => node.documentId)),
    nodeTypes: uniqueStrings(nodes.map((node) => node.nodeType)),
    edgeTypes: uniqueStrings(links.map((link) => link.edgeType)),
    nodes,
    links,
    defaultView: "documents",
    views: buildViewerViews(nodes, links),
    warnings: Array.isArray(graphIndex.warnings) ? graphIndex.warnings : []
  };
};

export const renderGraphViewerHtml = (graphIndex, options = {}) => {
  const data = buildGraphViewerData(graphIndex);
  const title = options.title || "Chemd workspace graph";
  const escapedTitle = escapeHtml(title);
  const payload = safeJsonForHtml(data);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <script src="${forceGraphCdn}"></script>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --ink: #182033;
      --muted: #627084;
      --line: #d9e0ea;
      --accent: #246b8f;
      --accent-strong: #17485f;
      --cross: #b4541f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      display: grid;
      grid-template-columns: minmax(19rem, 24rem) minmax(0, 1fr);
      min-height: 100vh;
    }
    aside {
      border-right: 1px solid var(--line);
      background: var(--panel);
      padding: 1rem;
      overflow: auto;
    }
    h1 {
      margin: 0 0 .75rem;
      font-size: 1.1rem;
      line-height: 1.25;
      letter-spacing: 0;
    }
    h2 {
      margin: 1rem 0 .5rem;
      font-size: .78rem;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: .06em;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .5rem;
      margin-bottom: 1rem;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: .4rem;
      padding: .55rem;
      background: #f9fbfe;
    }
    .metric strong, .metric span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .metric strong { font-size: 1rem; }
    .metric span { color: var(--muted); font-size: .72rem; }
    label {
      display: grid;
      gap: .35rem;
      margin: .65rem 0;
      color: var(--muted);
      font-size: .78rem;
    }
    select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: .35rem;
      background: #fff;
      color: var(--ink);
      padding: .48rem .55rem;
      font: inherit;
    }
    .check {
      display: flex;
      align-items: center;
      gap: .45rem;
      color: var(--ink);
    }
    .check input { margin: 0; }
    #graph {
      position: relative;
      min-height: 100vh;
      background:
        linear-gradient(#e9eef6 1px, transparent 1px),
        linear-gradient(90deg, #e9eef6 1px, transparent 1px);
      background-size: 32px 32px;
    }
    #empty {
      position: absolute;
      inset: 1rem;
      display: none;
      place-items: center;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: .5rem;
      background: rgba(255,255,255,.82);
      text-align: center;
      padding: 1rem;
    }
    pre {
      max-height: 16rem;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: .4rem;
      background: #0f1724;
      color: #d8e3f2;
      padding: .75rem;
      font-size: .72rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .legend {
      display: grid;
      gap: .35rem;
      color: var(--muted);
      font-size: .76rem;
      line-height: 1.4;
    }
    .legend span { color: var(--ink); }
    @media (max-width: 860px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      #graph { min-height: 70vh; }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <h1>${escapedTitle}</h1>
      <section class="summary" id="summary"></section>

      <h2>Filters</h2>
      <label>View mode
        <select id="view-mode"></select>
      </label>
      <label>Document
        <select id="document-filter"></select>
      </label>
      <label>Node type
        <select id="node-type-filter"></select>
      </label>
      <label>Edge type
        <select id="edge-type-filter"></select>
      </label>
      <label class="check">
        <input id="cross-document-filter" type="checkbox">
        Cross-document only
      </label>
      <label class="check">
        <input id="hide-value-nodes" type="checkbox" checked>
        Hide value nodes
      </label>

      <h2>Legend</h2>
      <div class="legend">
        <div><span>Node color</span>: document id</div>
        <div><span>Node size</span>: document/reaction/entity weight</div>
        <div><span>Orange links</span>: cross-document edges</div>
        <div><span>Blue links</span>: same-document edges</div>
      </div>

      <h2>Selection</h2>
      <pre id="inspector">Click a node or edge.</pre>
    </aside>
    <section id="graph">
      <div id="empty"></div>
    </section>
  </main>
  <script id="graph-data" type="application/json">${payload}</script>
  <script>
    const viewerData = JSON.parse(document.getElementById("graph-data").textContent);
    const graphElement = document.getElementById("graph");
    const emptyElement = document.getElementById("empty");
    const inspector = document.getElementById("inspector");
    const controls = {
      viewMode: document.getElementById("view-mode"),
      document: document.getElementById("document-filter"),
      nodeType: document.getElementById("node-type-filter"),
      edgeType: document.getElementById("edge-type-filter"),
      crossOnly: document.getElementById("cross-document-filter"),
      hideValues: document.getElementById("hide-value-nodes")
    };

    const addOptions = (select, values, allLabel) => {
      select.innerHTML = "";
      const all = document.createElement("option");
      all.value = "all";
      all.textContent = allLabel;
      select.appendChild(all);
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    };

    const setOptions = (select, entries) => {
      select.innerHTML = "";
      entries.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });
    };

    const renderSummary = (activeGraph) => {
      const summary = document.getElementById("summary");
      summary.innerHTML = "";
      [
        ["Programs", viewerData.summary.documentCount],
        ["Nodes", activeGraph.summary.nodeCount],
        ["Edges", activeGraph.summary.edgeCount],
        ["Warnings", viewerData.summary.warningCount]
      ].forEach(([label, value]) => {
        const item = document.createElement("div");
        item.className = "metric";
        item.innerHTML = "<strong>" + value + "</strong><span>" + label + "</span>";
        summary.appendChild(item);
      });
    };

    const colorForDocument = (documentId) => {
      if (!documentId) return "#64748b";
      let hash = 0;
      for (let index = 0; index < documentId.length; index += 1) {
        hash = ((hash << 5) - hash + documentId.charCodeAt(index)) | 0;
      }
      const hue = Math.abs(hash) % 300;
      return "hsl(" + hue + " 48% 45%)";
    };

    const formatSelection = (value) =>
      JSON.stringify(value, null, 2);

    const nodeLabel = (node) =>
      node.label + "<br>" + node.nodeType + "<br>" + (node.documentId || "no document");

    const linkLabel = (link) =>
      link.edgeType + "<br>" + link.source + " -> " + link.target;

    const filteredGraph = () => {
      const activeGraph = viewerData.views[controls.viewMode.value] || viewerData.views[viewerData.defaultView] || {
        nodes: viewerData.nodes,
        links: viewerData.links,
        summary: { nodeCount: viewerData.nodes.length, edgeCount: viewerData.links.length }
      };
      const selectedDocument = controls.document.value;
      const selectedNodeType = controls.nodeType.value;
      const selectedEdgeType = controls.edgeType.value;
      const crossOnly = controls.crossOnly.checked;
      const hideValues = controls.hideValues.checked;

      const baseNodes = activeGraph.nodes.filter((node) => {
        if (hideValues && node.isValueNode) return false;
        if (selectedDocument !== "all" && node.documentId !== selectedDocument) return false;
        if (selectedNodeType !== "all" && node.nodeType !== selectedNodeType) return false;
        return true;
      });
      const visibleIds = new Set(baseNodes.map((node) => node.id));
      const links = activeGraph.links.flatMap((link) => {
        const source = typeof link.source === "object" ? link.source.id : link.source;
        const target = typeof link.target === "object" ? link.target.id : link.target;
        if (!visibleIds.has(source) || !visibleIds.has(target)) return [];
        if (selectedEdgeType !== "all" && link.edgeType !== selectedEdgeType) return [];
        if (crossOnly && !link.crossDocument) return [];
        return [{ ...link, source, target }];
      });

      if (crossOnly) {
        const linkedIds = new Set(links.flatMap((link) => [link.source, link.target]));
        return {
          nodes: baseNodes.filter((node) => linkedIds.has(node.id)),
          links
        };
      }

      return { nodes: baseNodes, links };
    };

    setOptions(
      controls.viewMode,
      Object.values(viewerData.views).map((view) => [view.id, view.label])
    );
    controls.viewMode.value = viewerData.defaultView || "documents";
    addOptions(controls.document, viewerData.documentIds, "All documents");
    addOptions(controls.nodeType, viewerData.nodeTypes, "All node types");
    addOptions(controls.edgeType, viewerData.edgeTypes, "All edge types");
    renderSummary(viewerData.views[controls.viewMode.value] || {
      summary: { nodeCount: viewerData.nodes.length, edgeCount: viewerData.links.length }
    });

    if (typeof ForceGraph !== "function") {
      emptyElement.style.display = "grid";
      emptyElement.textContent = "force-graph did not load. Check network access or the CDN URL.";
    } else {
      const graph = ForceGraph()(graphElement)
        .backgroundColor("rgba(255,255,255,0)")
        .nodeId("id")
        .nodeLabel(nodeLabel)
        .nodeVal("val")
        .nodeColor((node) => colorForDocument(node.documentId))
        .linkLabel(linkLabel)
        .linkColor((link) => link.crossDocument ? "rgba(180,84,31,.72)" : "rgba(36,107,143,.42)")
        .linkWidth((link) => link.crossDocument ? 2.25 : 1)
        .linkDirectionalArrowLength(4)
        .linkDirectionalArrowRelPos(0.84)
        .cooldownTicks(100)
        .enableNodeDrag(true)
        .onNodeClick((node) => {
          inspector.textContent = formatSelection(node);
        })
        .onLinkClick((link) => {
          inspector.textContent = formatSelection(link);
        });

      const resize = () => {
        graph.width(graphElement.clientWidth).height(graphElement.clientHeight);
      };
      const render = () => {
        const activeGraph = viewerData.views[controls.viewMode.value] || viewerData.views[viewerData.defaultView];
        renderSummary(activeGraph || {
          summary: { nodeCount: viewerData.nodes.length, edgeCount: viewerData.links.length }
        });
        const next = filteredGraph();
        emptyElement.style.display = next.nodes.length === 0 ? "grid" : "none";
        emptyElement.textContent = "No graph elements match the current filters.";
        graph.graphData(next).d3ReheatSimulation();
      };

      Object.values(controls).forEach((control) => control.addEventListener("change", render));
      window.addEventListener("resize", resize);
      resize();
      render();
    }
  </script>
</body>
</html>
`;
};

const parseArgs = (argv) => {
  const result = {
    files: [],
    jsonPath: "",
    outPath: "",
    title: "Chemd workspace graph"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      result.jsonPath = argv[++index] || "";
    } else if (arg === "--out") {
      result.outPath = argv[++index] || "";
    } else if (arg === "--title") {
      result.title = argv[++index] || result.title;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else {
      result.files.push(arg);
    }
  }

  return result;
};

const usage = () => [
  "Usage:",
  "  node examples/source-first-demo/scripts/demo-workspace-graph.mjs [--out viewer.html]",
  "  node examples/source-first-demo/scripts/demo-workspace-graph.mjs --json graph.json [--out viewer.html]",
  "  node examples/source-first-demo/scripts/demo-workspace-graph.mjs <file.chemd...> [--out viewer.html]",
  "",
  "Without files or --json, the script renders examples/source-first-demo/reaction-flight-deck."
].join("\n");

const loadGraphIndexFromCli = (files) => {
  const result = spawnSync(process.execPath, [
    chemdCliPath,
    "graph",
    ...files,
    "--format",
    "json"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `chemd graph failed with ${result.status}`);
  }

  return JSON.parse(result.stdout);
};

const loadGraphIndex = (args) => {
  if (args.jsonPath) {
    return JSON.parse(readFileSync(path.resolve(args.jsonPath), "utf8"));
  }

  const files = args.files.length > 0 ? args.files : defaultSourceFiles;
  return loadGraphIndexFromCli(files);
};

const defaultOutPath = () =>
  path.join(demoRoot, "workspace-graph", "workspace-graph.html");

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const graphIndex = loadGraphIndex(args);
  const outPath = path.resolve(args.outPath || defaultOutPath());
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderGraphViewerHtml(graphIndex, { title: args.title }));
  process.stdout.write(`Wrote ${outPath}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

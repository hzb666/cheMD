import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, LinkObject, NodeObject } from "force-graph";
import { ChevronDown, ChevronRight, Filter, GitGraph, LocateFixed } from "lucide-react";

import type {
  EdgeEvidenceRow,
  KnowledgeMapViewModel,
  RenderableSourceRef,
  SemanticFlowDiagram,
  SemanticFlowEdge,
  SemanticFlowLaneId,
  SemanticFlowNode,
  SourceJumpIntent
} from "./knowledge-map";
import type { PostgresStatus } from "../contracts";
import type { WorkspaceIndexViewModel } from "../workspace-index/workspace-index";
import { filterKnowledgeMapNodes } from "./knowledge-map";

interface KnowledgeMapPanelProps {
  mode?: "compact" | "full";
  viewModel: KnowledgeMapViewModel;
  workspaceIndexViewModel: WorkspaceIndexViewModel;
  postgresStatus: PostgresStatus;
  onSourceJump?: (intent: SourceJumpIntent) => void;
}

const toolPanelClassName = "flex min-h-0 flex-col gap-4 text-sm data-[mode=full]:gap-5 data-[mode=full]:text-base";
const graphSectionClassName = "flex min-h-0 flex-col gap-3 border-b border-white/45 pb-4 last:border-b-0 last:pb-0";
const graphSectionHeadingClassName = "flex min-w-0 items-center justify-between gap-3";
const graphSummaryClassName = "grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-4 gap-y-1.5 text-xs [&>div]:min-w-0 [&>span]:min-w-0 [&_span]:block [&_span]:text-muted-foreground [&_strong]:block [&_strong]:min-w-0 [&_strong]:truncate [&_strong]:text-sm [&_strong]:text-foreground";
const emptyCopyClassName = "m-0 text-xs leading-relaxed text-muted-foreground";
const inspectorClassName = "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2 border-t border-white/35 py-2 text-xs [&>code]:font-mono [&>code]:text-muted-foreground [&>p]:col-span-full [&>p]:m-0 [&>p]:truncate [&>p]:text-muted-foreground [&>span]:font-semibold [&>span]:uppercase [&>span]:text-primary [&>strong]:min-w-0 [&>strong]:truncate";
const resultListClassName = "m-0 flex list-none flex-col gap-0 p-0";
const resultRowClassName = "flex min-w-0 items-center gap-2 border-t border-white/35 py-2 text-xs first:border-t-0 first:pt-0";
const resultKindClassName = "flex-none text-xs font-semibold uppercase text-primary";
const resultMainClassName = "flex min-w-0 flex-1 flex-col gap-1 [&>small]:min-w-0 [&>small]:truncate [&>small]:text-muted-foreground [&>strong]:min-w-0 [&>strong]:truncate";
const resultCodeClassName = "font-mono text-xs text-muted-foreground";
const toolSearchClassName = "flex min-w-0 flex-col gap-1 text-xs text-muted-foreground [&_select]:h-8 [&_select]:min-w-0 [&_select]:rounded-md [&_select]:border [&_select]:border-slate-300/75 [&_select]:bg-white/80 [&_select]:px-2 [&_select]:text-xs [&_select]:text-foreground [&_select]:shadow-[0_1px_2px_rgba(15,23,42,0.04)] [&_select]:outline-none [&_select]:transition [&_select:hover]:border-slate-400 [&_select:hover]:bg-white [&_select:focus-visible]:border-primary/45 [&_select:focus-visible]:ring-2 [&_select:focus-visible]:ring-ring/40";
const canvasClassName = "relative min-h-80 overflow-hidden rounded-lg border border-white/40 bg-white/20 md:min-h-96 xl:min-h-[31rem] [&>canvas]:block";
const canvasEmptyClassName = "absolute inset-0 m-0 flex items-center justify-center p-4 text-center text-xs leading-relaxed text-muted-foreground";
const renderableListClassName = "m-0 flex list-none flex-col gap-0 p-0";
const renderableRowClassName = "min-w-0 border-t border-white/35 py-2 text-xs first:border-t-0 first:pt-0";
const renderableToggleClassName = "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-transparent px-0 py-1.5 text-left text-xs font-medium transition-colors hover:bg-white/25";
const renderableDetailClassName = "border-t border-white/35 py-2 text-xs";
const sourceChipClassName = "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground";
const sourceButtonClassName = "inline-flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded-md border border-white/35 bg-white/25 px-2 text-xs text-primary transition-colors hover:bg-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const semanticFlowShellClassName = "min-w-0 rounded-lg border border-white/40 bg-white/20 p-2";
const semanticFlowCanvasClassName = "relative overflow-auto rounded-md bg-white/35";
const semanticFlowNodeClassName = "absolute z-10 flex min-w-0 flex-col justify-between rounded-md border px-2.5 py-2 text-left text-xs shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&>small]:truncate [&>small]:text-muted-foreground [&>span]:truncate [&>span]:font-semibold";
const semanticFlowLaneClassName = "absolute top-0 z-0 rounded-md border border-white/35 bg-white/20 px-2 py-1.5 text-xs [&>small]:block [&>small]:truncate [&>small]:text-muted-foreground [&>strong]:block [&>strong]:truncate";

export const KnowledgeMapPanel = ({
  mode = "full",
  viewModel,
  workspaceIndexViewModel,
  postgresStatus,
  onSourceJump
}: KnowledgeMapPanelProps) => (
  <div className={toolPanelClassName} data-mode={mode}>
    <DocumentGraphSection mode={mode} viewModel={workspaceIndexViewModel} postgresStatus={postgresStatus} />
    <CurrentDocumentGraphSection mode={mode} viewModel={viewModel} onSourceJump={onSourceJump} />
  </div>
);

type DocumentGraphSectionProps = {
  mode: "compact" | "full";
  viewModel: WorkspaceIndexViewModel;
  postgresStatus: PostgresStatus;
};

const DocumentGraphSection = ({
  mode,
  viewModel,
  postgresStatus
}: DocumentGraphSectionProps) => {
  const postgresReady = postgresStatus.state === "ready"
    && postgresStatus.configured
    && postgresStatus.vectorInstalled === true
    && postgresStatus.schemaReady === true;
  const documentGraph = useMemo(
    () => postgresReady ? buildDocumentGraph(viewModel) : { nodes: [], links: [] },
    [postgresReady, viewModel]
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  if (!postgresReady) {
    return (
      <section className={`${graphSectionClassName} ${mode === "full" ? "gap-4 pb-5" : ""}`} aria-label="Workspace document graph">
        <div className={graphSectionHeadingClassName}>
          <span className="text-sm font-semibold text-foreground">Document Graph</span>
          <strong className="truncate font-mono text-xs text-muted-foreground">workspace PostgreSQL required</strong>
        </div>
        <p className={emptyCopyClassName}>
          Bind this workspace to a ready PostgreSQL profile before generating the cross-document graph.
        </p>
      </section>
    );
  }
  const selectedDocument = documentGraph.nodes.find((node) =>
    node.id === selectedDocumentId
  ) ?? documentGraph.nodes[0] ?? null;

  return (
    <section className={`${graphSectionClassName} ${mode === "full" ? "gap-4 pb-5" : ""}`} aria-label="Workspace document graph">
      <div className={graphSectionHeadingClassName}>
        <span className="text-sm font-semibold text-foreground">Document Graph</span>
        <strong className="truncate font-mono text-xs text-muted-foreground">{documentGraph.nodes.length} docs / {documentGraph.links.length} links</strong>
      </div>
      <div className={graphSummaryClassName}>
        <div><span>State</span><strong>{viewModel.state}</strong></div>
        <div><span>Symbols</span><strong>{viewModel.symbols.length}</strong></div>
        <div><span>Refs</span><strong>{viewModel.references.length}</strong></div>
      </div>
      <p className={emptyCopyClassName}>{viewModel.message}</p>
      {mode === "full" ? (
        <DocumentGraphCanvas
          graph={documentGraph}
          selectedDocumentId={selectedDocument?.id}
          onSelectDocument={setSelectedDocumentId}
        />
      ) : null}
      {selectedDocument ? <DocumentInspector document={selectedDocument} /> : null}
      <DocumentGraphEdgeList links={documentGraph.links} limit={mode === "full" ? 12 : 5} />
    </section>
  );
};

type DocumentInspectorProps = {
  document: DocumentForceGraphNode;
};

const DocumentInspector = ({
  document
}: DocumentInspectorProps) => (
  <div className={inspectorClassName}>
    <span>{document.status}</span>
    <strong title={document.path}>{document.label}</strong>
    <code>{document.symbolCount} symbols</code>
    <p>
      {document.outgoingCount} outgoing, {document.incomingCount} incoming,
      {" "}{document.internalReferenceCount} internal refs
    </p>
  </div>
);

type DocumentGraphEdgeListProps = {
  links: readonly DocumentForceGraphLink[];
  limit?: number;
};

const DocumentGraphEdgeList = ({
  links,
  limit = 12
}: DocumentGraphEdgeListProps) => (
  <div className={resultListClassName} role="list" aria-label="Cross-document references">
    {links.slice(0, limit).map((link) => (
      <div key={link.id} className={resultRowClassName} role="listitem">
        <span className={resultKindClassName}>{link.statuses.join("/")}</span>
        <div className={resultMainClassName}>
          <strong title={`${link.sourceLabel} -> ${link.targetLabel}`}>
            {link.sourceLabel} {"->"} {link.targetLabel}
          </strong>
          <small title={link.fields.join(", ")}>{link.fields.join(" / ")}</small>
        </div>
        <code className={resultCodeClassName}>{link.referenceCount} refs</code>
      </div>
    ))}
    {links.length === 0 ? (
      <p className={emptyCopyClassName}>No cross-document references are indexed yet.</p>
    ) : null}
  </div>
);

type CurrentDocumentGraphSectionProps = {
  mode: "compact" | "full";
  viewModel: KnowledgeMapViewModel;
  onSourceJump?: (intent: SourceJumpIntent) => void;
};

const CurrentDocumentGraphSection = ({
  mode,
  viewModel,
  onSourceJump
}: CurrentDocumentGraphSectionProps) => {
  const [selectedClusterId, setSelectedClusterId] = useState<string>("all");
  const [selectedEdgeBasis, setSelectedEdgeBasis] = useState<string>("all");
  const [selectedReactionId, setSelectedReactionId] = useState<string | null>(null);
  const [expandedReactionIds, setExpandedReactionIds] = useState<string[]>([]);
  const graphNodes = useMemo(
    () => filterKnowledgeMapNodes(viewModel.reactionMap, {
      clusterId: selectedClusterId,
      edgeBasis: selectedEdgeBasis
    }),
    [selectedClusterId, selectedEdgeBasis, viewModel.reactionMap]
  );
  const edgeEvidenceRows = useMemo(
    () => filterEdgeEvidenceRows(viewModel.edgeEvidenceRows, selectedEdgeBasis),
    [selectedEdgeBasis, viewModel.edgeEvidenceRows]
  );
  const selectedNode = useMemo(() => graphNodes.find((node) =>
    node.reaction_entity_id === selectedReactionId
  ) ?? graphNodes[0], [graphNodes, selectedReactionId]);
  const selectedCluster = useMemo(() => viewModel.reactionMap.clusters.find((cluster) =>
    cluster.cluster_id === selectedNode?.cluster_id
  ), [viewModel.reactionMap.clusters, selectedNode?.cluster_id]);

  const handleToggleRenderable = useCallback((nodeId: string) => {
    setExpandedReactionIds((current) =>
      current.includes(nodeId)
        ? current.filter((item) => item !== nodeId)
        : [...current, nodeId]
    );
  }, []);

  return (
    <section className={`${graphSectionClassName} ${mode === "full" ? "gap-4 pb-5" : ""}`} aria-label="Current document reaction graph">
        <div className={graphSectionHeadingClassName}>
          <span className="text-sm font-semibold text-foreground">Current Document Graph</span>
          <strong className="truncate font-mono text-xs text-muted-foreground">{viewModel.reactionSummary.reactionCount} reactions / {viewModel.reactionSummary.edgeCount} edges</strong>
        </div>
      <div className={graphSummaryClassName}>
        <div><span>State</span><strong>{viewModel.state}</strong></div>
        <div><span>Reactions</span><strong>{viewModel.reactionSummary.reactionCount}</strong></div>
        <div><span>Clusters</span><strong>{viewModel.reactionSummary.clusterCount}</strong></div>
      </div>
      <p className={emptyCopyClassName}>{viewModel.reactionSummary.message}</p>
      {mode === "full" ? <ReactionIntelligenceArtifactSummary viewModel={viewModel} /> : null}
      <label className={toolSearchClassName}>
        <Filter size={14} />
        <select
          value={selectedClusterId}
          aria-label="Filter reaction map by cluster"
          onChange={(event) => {
            setSelectedClusterId(event.target.value);
            setSelectedReactionId(null);
          }}
        >
          <option value="all">All clusters</option>
          {viewModel.reactionMap.clusters.map((cluster) => (
            <option key={cluster.cluster_id} value={cluster.cluster_id}>
              {cluster.label}
            </option>
          ))}
        </select>
      </label>
      <label className={toolSearchClassName}>
        <Filter size={14} />
        <select
          value={selectedEdgeBasis}
          aria-label="Filter reaction map by edge basis"
          onChange={(event) => {
            setSelectedEdgeBasis(event.target.value);
            setSelectedReactionId(null);
          }}
        >
          <option value="all">All basis</option>
          {viewModel.edgeBasisOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.edgeCount})
            </option>
          ))}
        </select>
      </label>
      {mode === "full" ? (
        <ReactionLayoutCanvas
          nodes={graphNodes}
          edges={viewModel.reactionMap.edges}
          selectedReactionId={selectedNode?.reaction_entity_id}
          onSelectReaction={setSelectedReactionId}
        />
      ) : null}
      {selectedNode ? (
        <div className={inspectorClassName}>
          <span>{selectedNode.quality_tier ?? "semantic"}</span>
          <strong title={selectedNode.reaction_entity_id}>{selectedNode.reaction_entity_id}</strong>
          <code>{selectedCluster?.basis ?? "no-cluster"}</code>
          <p>{selectedCluster?.shared_features.join(", ") || "No shared features available."}</p>
        </div>
      ) : null}
      {mode === "full" ? (
        <EdgeEvidencePanel
          rows={edgeEvidenceRows}
          onSourceJump={onSourceJump}
        />
      ) : null}
      <div className={resultListClassName} role="list">
        {graphNodes.slice(0, mode === "full" ? 20 : 8).map((node) => (
          <div key={node.reaction_entity_id} className={resultRowClassName} role="listitem">
            <GitGraph size={13} />
            <span className={resultKindClassName}>{node.cluster_id ? "clustered" : "reaction"}</span>
            <strong className="min-w-0 truncate" title={node.reaction_entity_id}>{node.reaction_entity_id}</strong>
            <code className={resultCodeClassName}>{Math.round(node.x)},{Math.round(node.y)}</code>
          </div>
        ))}
        {graphNodes.length === 0 ? (
          <p className={emptyCopyClassName}>No reactions match the current filters.</p>
        ) : null}
      </div>
      {mode === "full" ? (
        <>
          <div className={graphSummaryClassName}>
            <div><span>Semantic</span><strong>{viewModel.semanticSummary.nodeCount}</strong></div>
            <div><span>Hydrate</span><strong>{viewModel.semanticSummary.heavyNodeCount}</strong></div>
            <div><span>Warnings</span><strong>{viewModel.semanticSummary.warningCount}</strong></div>
          </div>
          <SemanticFlowPanel
            diagram={viewModel.semanticFlow}
            onSourceJump={onSourceJump}
          />
          <ReactionRenderableList
            viewModel={viewModel}
            expandedReactionIds={expandedReactionIds}
            onToggle={handleToggleRenderable}
            onSourceJump={onSourceJump}
          />
          <div className={resultListClassName} role="list" aria-label="Reaction clusters">
            {viewModel.clusters.slice(0, 6).map((cluster) => (
              <div key={cluster.id} className={resultRowClassName} role="listitem">
                <span className={resultKindClassName}>{cluster.basis}</span>
                <strong className="min-w-0 truncate" title={cluster.label}>{cluster.label}</strong>
                <code className={resultCodeClassName}>{cluster.memberCount}</code>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
};

const filterEdgeEvidenceRows = (
  rows: readonly EdgeEvidenceRow[],
  selectedBasis: string
): EdgeEvidenceRow[] => {
  if (selectedBasis === "all") {
    return [...rows];
  }
  return rows.filter((row) => row.basis.includes(selectedBasis));
};

const formatEdgeScore = (score: number | null): string =>
  score === null ? "score pending" : score.toFixed(2);

type EdgeEvidencePanelProps = {
  rows: readonly EdgeEvidenceRow[];
  onSourceJump?: (intent: SourceJumpIntent) => void;
};

const EdgeEvidencePanel = ({
  rows,
  onSourceJump
}: EdgeEvidencePanelProps) => {
  const sourceReadyCount = rows.filter((row) =>
    row.from.sourceRef !== null || row.to.sourceRef !== null
  ).length;
  return (
    <div className={renderableListClassName} role="list" aria-label="Graph edge evidence">
      <div className={resultRowClassName} role="listitem">
        <span className={resultKindClassName}>Edge Evidence</span>
        <div className={resultMainClassName}>
          <strong>{rows.length} visible edges</strong>
          <small>{sourceReadyCount} source refs ready</small>
        </div>
        <code className={resultCodeClassName}>graph</code>
      </div>
      {rows.slice(0, 12).map((row) => (
        <div key={row.edgeId} className={resultRowClassName} role="listitem">
          <span className={resultKindClassName}>{row.evidenceSources[0]?.source ?? "edge"}</span>
          <div className={resultMainClassName}>
            <strong title={`${row.from.reactionId} -> ${row.to.reactionId}`}>
              {row.from.label} {"->"} {row.to.label}
            </strong>
            <small title={row.basis.join(", ")}>
              {row.basis.join(" / ") || "basis pending"}
            </small>
            <small title={row.evidenceSources.map((item) => item.evidenceId).join(", ")}>
              {row.evidenceSources.length > 0
                ? row.evidenceSources.map((item) => item.evidenceId ?? item.source).join(", ")
                : "evidence pending"}
            </small>
            {row.warnings.length > 0 ? (
              <small title={row.warnings.join(", ")}>
                {row.warnings.join(", ")}
              </small>
            ) : null}
          </div>
          <code className={resultCodeClassName}>{formatEdgeScore(row.score)}</code>
          <SourceRefAction
            sourceRef={row.from.sourceRef ?? row.to.sourceRef}
            onSourceJump={onSourceJump}
            missingLabel="Source pending"
          />
        </div>
      ))}
      {rows.length === 0 ? (
        <p className={emptyCopyClassName}>No graph edges match the current evidence filters.</p>
      ) : null}
    </div>
  );
};

type ReactionIntelligenceArtifactSummaryProps = {
  viewModel: KnowledgeMapViewModel;
};

const ReactionIntelligenceArtifactSummary = ({
  viewModel
}: ReactionIntelligenceArtifactSummaryProps) => {
  const summary = viewModel.reactionIntelligenceArtifact;
  if (!summary) {
    return null;
  }
  return (
    <>
      <div className={graphSummaryClassName} aria-label="Reaction intelligence artifact summary">
        <div><span>Artifact</span><strong title={summary.artifactId}>{summary.artifactId}</strong></div>
        <div><span>Job</span><strong title={summary.jobId}>{summary.jobId}</strong></div>
        <div><span>Generated</span><strong>{summary.generatedAt}</strong></div>
      </div>
      <div className={graphSummaryClassName}>
        <div><span>PASS</span><strong>{summary.providerStatusCounts.PASS}</strong></div>
        <div><span>SKIP</span><strong>{summary.providerStatusCounts.SKIP}</strong></div>
        <div><span>ERROR</span><strong>{summary.providerStatusCounts.ERROR}</strong></div>
      </div>
      <div className={resultListClassName} role="list" aria-label="Reaction intelligence computed basis">
        <div className={resultRowClassName} role="listitem">
          <span className={resultKindClassName}>{summary.layout.fromArtifact ? "artifact layout" : "fallback layout"}</span>
          <strong className="min-w-0 truncate">{summary.layout.usesTmap ? "TMAP" : summary.layout.engine}</strong>
          <code className={resultCodeClassName}>{summary.computedEdgeCount} edges</code>
        </div>
        {summary.computedBasis.slice(0, 6).map((basis) => (
          <div key={basis} className={resultRowClassName} role="listitem">
            <span className={resultKindClassName}>Basis</span>
            <strong className="min-w-0 truncate" title={basis}>{basis}</strong>
            <code className={resultCodeClassName}>{summary.graphIndexId}</code>
          </div>
        ))}
        {summary.warnings.slice(0, 4).map((warning) => (
          <div key={warning} className={resultRowClassName} role="listitem">
            <span className={resultKindClassName}>Warning</span>
            <strong className="min-w-0 truncate" title={warning}>{warning}</strong>
            <code className={resultCodeClassName}>artifact</code>
          </div>
        ))}
      </div>
    </>
  );
};

type ReactionRenderableListProps = {
  viewModel: KnowledgeMapViewModel;
  expandedReactionIds: readonly string[];
  onToggle: (nodeId: string) => void;
  onSourceJump?: (intent: SourceJumpIntent) => void;
};

const flowLaneWidth = 178;
const flowLaneGap = 18;
const flowNodeWidth = 154;
const flowNodeHeight = 74;
const flowHeaderHeight = 50;
const flowNodeGapY = 26;
const flowPadding = 12;

type FlowNodeBox = SemanticFlowNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SemanticFlowLayout = {
  boxes: FlowNodeBox[];
  width: number;
  height: number;
};

const semanticFlowLaneIndex = (
  laneId: SemanticFlowLaneId,
  diagram: SemanticFlowDiagram
): number =>
  Math.max(0, diagram.lanes.findIndex((lane) => lane.id === laneId));

const buildSemanticFlowLayout = (
  diagram: SemanticFlowDiagram
): SemanticFlowLayout => {
  const laneCounts = new Map<SemanticFlowLaneId, number>();
  const boxes = diagram.nodes.map((node) => {
    const laneIndex = semanticFlowLaneIndex(node.laneId, diagram);
    const laneOffset = laneCounts.get(node.laneId) ?? 0;
    laneCounts.set(node.laneId, laneOffset + 1);
    return {
      ...node,
      x: flowPadding + laneIndex * (flowLaneWidth + flowLaneGap) + 12,
      y: flowHeaderHeight + flowPadding + laneOffset * (flowNodeHeight + flowNodeGapY),
      width: flowNodeWidth,
      height: flowNodeHeight
    };
  });
  const maxLaneCount = Math.max(1, ...laneCounts.values());
  return {
    boxes,
    width: flowPadding * 2 + diagram.lanes.length * flowLaneWidth + (diagram.lanes.length - 1) * flowLaneGap,
    height: flowHeaderHeight + flowPadding * 2 + maxLaneCount * flowNodeHeight + (maxLaneCount - 1) * flowNodeGapY
  };
};

const flowNodeById = (
  boxes: readonly FlowNodeBox[]
): ReadonlyMap<string, FlowNodeBox> =>
  new Map(boxes.map((box) => [box.id, box]));

const edgePath = (
  edge: SemanticFlowEdge,
  boxesById: ReadonlyMap<string, FlowNodeBox>
): string | null => {
  const source = boxesById.get(edge.sourceId);
  const target = boxesById.get(edge.targetId);
  if (!source || !target) return null;
  const startX = source.x + source.width;
  const startY = source.y + source.height / 2;
  const endX = target.x;
  const endY = target.y + target.height / 2;
  const midX = startX + Math.max(30, (endX - startX) / 2);
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
};

const semanticNodeTone = (node: SemanticFlowNode): string => {
  if (node.diagnosticSeverity === "error") return "border-red-300 bg-red-50 text-red-950";
  if (node.diagnosticSeverity === "warning") return "border-amber-300 bg-amber-50 text-amber-950";
  if (node.laneId === "materials") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (node.laneId === "reaction") return "border-sky-300 bg-sky-50 text-sky-950";
  if (node.laneId === "results") return "border-violet-200 bg-violet-50 text-violet-950";
  if (node.laneId === "analysis") return "border-indigo-200 bg-indigo-50 text-indigo-950";
  if (node.laneId === "evidence") return "border-orange-200 bg-orange-50 text-orange-950";
  return "border-slate-200 bg-white text-slate-950";
};

const semanticEdgeColor = (kind: SemanticFlowEdge["kind"]): string => {
  switch (kind) {
    case "reactant": return "oklch(55% 0.11 165 / 0.76)";
    case "product": return "oklch(56% 0.13 255 / 0.76)";
    case "contains": return "oklch(64% 0.04 250 / 0.42)";
    case "evidence": return "oklch(60% 0.12 55 / 0.72)";
    case "document_order": return "oklch(55% 0.05 250 / 0.54)";
  }
};

type SemanticFlowPanelProps = {
  diagram: SemanticFlowDiagram;
  onSourceJump?: (intent: SourceJumpIntent) => void;
};

const SemanticFlowPanel = ({
  diagram,
  onSourceJump
}: SemanticFlowPanelProps) => {
  const layout = useMemo(() => buildSemanticFlowLayout(diagram), [diagram]);
  const boxesById = useMemo(() => flowNodeById(layout.boxes), [layout.boxes]);
  return (
    <div className={semanticFlowShellClassName} aria-label="Document semantic flow diagram">
      <div className={graphSectionHeadingClassName}>
        <span className="text-sm font-semibold text-foreground">Document Semantic Flow</span>
        <strong className="truncate font-mono text-xs text-muted-foreground">{diagram.nodes.length} nodes / {diagram.edges.length} edges</strong>
      </div>
      <p className={emptyCopyClassName}>{diagram.message}</p>
      <div className={semanticFlowCanvasClassName}>
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          {diagram.lanes.map((lane, index) => (
            <div
              key={lane.id}
              className={semanticFlowLaneClassName}
              style={{
                left: flowPadding + index * (flowLaneWidth + flowLaneGap),
                width: flowLaneWidth,
                height: layout.height - flowPadding
              }}
            >
              <strong>{lane.label}</strong>
              <small>{lane.detail}</small>
            </div>
          ))}
          <svg className="absolute inset-0 z-[1]" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id="semantic-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(55% 0.05 250 / 0.58)" />
              </marker>
            </defs>
            {diagram.edges.map((edge) => {
              const path = edgePath(edge, boxesById);
              return path ? (
                <path
                  key={edge.id}
                  d={path}
                  fill="none"
                  stroke={semanticEdgeColor(edge.kind)}
                  strokeDasharray={edge.kind === "contains" ? "4 5" : undefined}
                  strokeWidth={edge.kind === "document_order" ? 1.2 : 1.8}
                  markerEnd="url(#semantic-flow-arrow)"
                />
              ) : null;
            })}
          </svg>
          {layout.boxes.map((node) => {
            const action = node.sourceRef?.intent;
            const content = (
              <>
                <span title={node.label}>{node.label}</span>
                <small title={node.detail}>{node.detail}</small>
                <small title={node.component}>{node.component}</small>
              </>
            );
            const style = {
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height
            };
            return action && onSourceJump ? (
              <button
                key={node.id}
                type="button"
                className={`${semanticFlowNodeClassName} ${semanticNodeTone(node)} cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)]`}
                style={style}
                onClick={() => onSourceJump(action)}
              >
                {content}
              </button>
            ) : (
              <div
                key={node.id}
                className={`${semanticFlowNodeClassName} ${semanticNodeTone(node)}`}
                style={style}
              >
                {content}
              </div>
            );
          })}
          {diagram.nodes.length === 0 ? (
            <p className={canvasEmptyClassName}>No semantic flow nodes to draw.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const ReactionRenderableList = memo(({
  viewModel,
  expandedReactionIds,
  onToggle,
  onSourceJump
}: ReactionRenderableListProps) => (
  <div className={renderableListClassName} role="list" aria-label="Reaction renderable nodes">
    {viewModel.reactionRenderables.slice(0, 12).map((node) => {
      const expanded = expandedReactionIds.includes(node.nodeId);
      return (
        <div key={node.nodeId} className={renderableRowClassName} role="listitem">
          <button
            type="button"
            className={renderableToggleClassName}
            aria-expanded={expanded}
            onClick={() => onToggle(node.nodeId)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{node.component}</span>
            <strong className="min-w-0 truncate" title={node.title}>{node.title}</strong>
          </button>
          {node.clusterBadge ? (
            <span className={sourceChipClassName} title={node.clusterBadge.label}>
              {node.clusterBadge.basis} / {node.clusterBadge.confidence}
            </span>
          ) : null}
          <SourceRefAction sourceRef={node.sourceRef} onSourceJump={onSourceJump} />
          {expanded ? (
            <div className={renderableDetailClassName}>
              <code className={resultCodeClassName}>{node.hydration}</code>
              {node.children.length > 0 ? node.children.map((child) => (
                <span key={child.nodeId} title={child.nodeType}>
                  {child.label}
                </span>
              )) : <span>No child renderables</span>}
            </div>
          ) : null}
        </div>
      );
    })}
    {viewModel.evidenceSourceRefs.slice(0, 6).map((evidence) => (
      <div key={evidence.nodeId} className={`${renderableRowClassName} flex items-center gap-2`} role="listitem">
        <span className={resultKindClassName}>Evidence</span>
        <strong className="min-w-0 truncate" title={evidence.label}>{evidence.label}</strong>
        <SourceRefAction sourceRef={evidence.sourceRef} onSourceJump={onSourceJump} />
      </div>
    ))}
  </div>
));

type SourceRefActionProps = {
  sourceRef: RenderableSourceRef | null;
  onSourceJump?: (intent: SourceJumpIntent) => void;
  missingLabel?: string;
};

const SourceRefAction = ({
  sourceRef,
  onSourceJump,
  missingLabel
}: SourceRefActionProps) => {
  if (!sourceRef) {
    return <span className={sourceChipClassName}>{missingLabel ?? "No source"}</span>;
  }
  if (!sourceRef.intent || !onSourceJump) {
    return <span className={sourceChipClassName}>{sourceRef.label}</span>;
  }
  const intent = sourceRef.intent;
  return (
    <button
      type="button"
      className={sourceButtonClassName}
      onClick={() => onSourceJump(intent)}
    >
      <LocateFixed size={13} />
      <span className="truncate">{sourceRef.label}</span>
    </button>
  );
};

type DocumentForceGraphNode = NodeObject & {
  id: string;
  path: string;
  label: string;
  status: string;
  symbolCount: number;
  incomingCount: number;
  outgoingCount: number;
  internalReferenceCount: number;
  selected: boolean;
  val: number;
};

type DocumentForceGraphLink = LinkObject<DocumentForceGraphNode> & {
  id: string;
  source: string | DocumentForceGraphNode;
  target: string | DocumentForceGraphNode;
  sourceLabel: string;
  targetLabel: string;
  referenceCount: number;
  statuses: string[];
  fields: string[];
};

type DocumentForceGraphData = GraphData<DocumentForceGraphNode, DocumentForceGraphLink>;

type DocumentGraphStats = {
  symbolCount: number;
  incomingCount: number;
  outgoingCount: number;
  internalReferenceCount: number;
};

type DocumentGraphLinkAccumulator = {
  source: string;
  target: string;
  referenceCount: number;
  statuses: string[];
  fields: string[];
};

const fileLabel = (path: string): string =>
  path.replace(/\\/g, "/").split("/").pop() ?? path;

const uniqueSorted = (values: readonly string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "en")
  );

const createDocumentStats = (
  documents: NonNullable<WorkspaceIndexViewModel["index"]>["documents"]
): Map<string, DocumentGraphStats> =>
  new Map(documents.map((document) => [
    document.uri,
    {
      symbolCount: 0,
      incomingCount: 0,
      outgoingCount: 0,
      internalReferenceCount: 0
    }
  ]));

const addDocumentSymbolStats = (
  stats: Map<string, DocumentGraphStats>,
  symbols: NonNullable<WorkspaceIndexViewModel["index"]>["symbols"]
): void => {
  for (const symbol of symbols) {
    const entry = stats.get(symbol.documentUri);
    if (entry) {
      entry.symbolCount += 1;
    }
  }
};

const resolveReferenceTargetUris = (
  targetSymbolIds: readonly string[],
  symbolById: ReadonlyMap<string, NonNullable<WorkspaceIndexViewModel["index"]>["symbols"][number]>,
  documentByUri: ReadonlyMap<string, NonNullable<WorkspaceIndexViewModel["index"]>["documents"][number]>
): string[] =>
  uniqueSorted(targetSymbolIds
    .map((symbolId) => symbolById.get(symbolId)?.documentUri)
    .filter((uri): uri is string => Boolean(uri && documentByUri.has(uri))));

const incrementStat = (
  stats: Map<string, DocumentGraphStats>,
  documentUri: string,
  field: keyof Omit<DocumentGraphStats, "symbolCount">
): void => {
  const entry = stats.get(documentUri);
  if (entry) {
    entry[field] += 1;
  }
};

const updateDocumentLink = (
  linksByPair: Map<string, DocumentGraphLinkAccumulator>,
  sourceUri: string,
  targetUri: string,
  status: string,
  field: string
): void => {
  const key = `${sourceUri}->${targetUri}`;
  const existing = linksByPair.get(key) ?? {
    source: sourceUri,
    target: targetUri,
    referenceCount: 0,
    statuses: [],
    fields: []
  };
  existing.referenceCount += 1;
  existing.statuses = uniqueSorted([...existing.statuses, status]);
  existing.fields = uniqueSorted([...existing.fields, field]);
  linksByPair.set(key, existing);
};

type RecordDocumentReferenceInput = {
  stats: Map<string, DocumentGraphStats>;
  linksByPair: Map<string, DocumentGraphLinkAccumulator>;
  sourceUri: string;
  targetUri: string;
  status: string;
  field: string;
};

const recordDocumentReference = ({
  stats,
  linksByPair,
  sourceUri,
  targetUri,
  status,
  field
}: RecordDocumentReferenceInput): void => {
  if (targetUri === sourceUri) {
    incrementStat(stats, sourceUri, "internalReferenceCount");
    return;
  }
  incrementStat(stats, sourceUri, "outgoingCount");
  incrementStat(stats, targetUri, "incomingCount");
  updateDocumentLink(linksByPair, sourceUri, targetUri, status, field);
};

const createDocumentGraphNodes = (
  documents: NonNullable<WorkspaceIndexViewModel["index"]>["documents"],
  stats: ReadonlyMap<string, DocumentGraphStats>
): DocumentForceGraphNode[] =>
  documents.map((document) => {
    const stat = stats.get(document.uri);
    const degree = (stat?.incomingCount ?? 0) + (stat?.outgoingCount ?? 0);
    return {
      id: document.uri,
      path: document.path ?? document.uri,
      label: fileLabel(document.path ?? document.uri),
      status: document.status,
      symbolCount: stat?.symbolCount ?? 0,
      incomingCount: stat?.incomingCount ?? 0,
      outgoingCount: stat?.outgoingCount ?? 0,
      internalReferenceCount: stat?.internalReferenceCount ?? 0,
      selected: false,
      val: Math.max(4, Math.min(12, 4 + degree))
    };
  });

const createDocumentGraphLinks = (
  linksByPair: ReadonlyMap<string, DocumentGraphLinkAccumulator>,
  nodes: readonly DocumentForceGraphNode[]
): DocumentForceGraphLink[] => {
  const labelByUri = new Map(nodes.map((node) => [node.id, node.label]));
  return [...linksByPair.entries()].map(([id, link]) => ({
    id,
    source: link.source,
    target: link.target,
    sourceLabel: labelByUri.get(link.source) ?? fileLabel(link.source),
    targetLabel: labelByUri.get(link.target) ?? fileLabel(link.target),
    referenceCount: link.referenceCount,
    statuses: link.statuses,
    fields: link.fields
  }));
};

const buildDocumentGraph = (
  viewModel: WorkspaceIndexViewModel
): DocumentForceGraphData => {
  const index = viewModel.index;
  if (!index) {
    return { nodes: [], links: [] };
  }

  const symbolById = new Map(index.symbols.map((symbol) => [symbol.symbolId, symbol]));
  const documentByUri = new Map(index.documents.map((document) => [document.uri, document]));
  const stats = createDocumentStats(index.documents);
  const linksByPair = new Map<string, DocumentGraphLinkAccumulator>();
  addDocumentSymbolStats(stats, index.symbols);

  for (const reference of index.references) {
    const targetUris = resolveReferenceTargetUris(reference.targetSymbolIds, symbolById, documentByUri);

    if (targetUris.length === 0) {
      incrementStat(stats, reference.documentUri, "outgoingCount");
      continue;
    }
    targetUris.forEach((targetUri) =>
      recordDocumentReference({
        stats,
        linksByPair,
        sourceUri: reference.documentUri,
        targetUri,
        status: reference.status,
        field: reference.field
      })
    );
  }

  const nodes = createDocumentGraphNodes(index.documents, stats);
  return { nodes, links: createDocumentGraphLinks(linksByPair, nodes) };
};

type DocumentGraphCanvasProps = {
  graph: DocumentForceGraphData;
  selectedDocumentId?: string;
  onSelectDocument: (documentId: string) => void;
};

const documentNodeColor = (node: DocumentForceGraphNode): string => {
  if (node.selected) {
    return "oklch(31% 0.04 260)";
  }
  if (node.status === "failed") {
    return "oklch(58% 0.15 28)";
  }
  return node.incomingCount + node.outgoingCount > 0
    ? "oklch(56% 0.11 215)"
    : "oklch(64% 0.04 250)";
};

const documentLinkColor = (link: DocumentForceGraphLink): string =>
  link.statuses.includes("ambiguous")
    ? "oklch(63% 0.12 65 / 0.72)"
    : "oklch(58% 0.07 250 / 0.54)";

const documentGraphLabel = (node: DocumentForceGraphNode): string =>
  `${node.label}<br/>${node.symbolCount} symbols`;

const DocumentGraphCanvas = ({
  graph,
  selectedDocumentId,
  onSelectDocument
}: DocumentGraphCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const graphData = useMemo<DocumentForceGraphData>(() => ({
    nodes: graph.nodes.map((node) => ({
      ...node,
      selected: node.id === selectedDocumentId,
      val: node.id === selectedDocumentId ? Math.max(node.val, 10) : node.val
    })),
    links: graph.links
  }), [graph, selectedDocumentId]);

  const graphDataRef = useRef(graphData);
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  useEffect(() => {
    if (!containerRef.current || graphRef.current) {
      return;
    }

    let isMounted = true;
    import("force-graph").then((module) => {
      if (!isMounted || !containerRef.current) return;
      const ForceGraph = module.default;
      const graphInstance = new ForceGraph(containerRef.current)
        .backgroundColor("rgba(255,255,255,0)")
        .nodeId("id")
        .nodeLabel((node) => documentGraphLabel(node as DocumentForceGraphNode))
        .nodeVal("val")
        .nodeColor((node) => documentNodeColor(node as DocumentForceGraphNode))
        .linkLabel((link) => {
          const documentLink = link as DocumentForceGraphLink;
          return `${documentLink.sourceLabel} -> ${documentLink.targetLabel}`;
        })
        .linkColor((link) => documentLinkColor(link as DocumentForceGraphLink))
        .linkWidth((link) => Math.max(1, Math.min(4, (link as DocumentForceGraphLink).referenceCount)))
        .linkDirectionalArrowLength(4)
        .linkDirectionalArrowRelPos(0.84)
        .cooldownTicks(90)
        .enableNodeDrag(true)
        .onNodeClick((node) => onSelectDocument((node as DocumentForceGraphNode).id));

      graphRef.current = graphInstance;
      graphInstance.graphData(graphDataRef.current).d3ReheatSimulation();
    });

    return () => {
      isMounted = false;
      if (graphRef.current) {
        graphRef.current.pauseAnimation();
        graphRef.current._destructor();
        graphRef.current = null;
      }
    };
  }, [onSelectDocument]);

  useEffect(() => {
    graphRef.current
      ?.graphData(graphData)
      .d3ReheatSimulation();
  }, [graphData]);

  useEffect(() => {
    const container = containerRef.current;
    const graphInstance = graphRef.current;
    if (!container || !graphInstance) {
      return;
    }

    const resize = () => {
      graphInstance
        .width(Math.max(container.clientWidth, 280))
        .height(Math.max(container.clientHeight, 220));
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={canvasClassName}
      role="img"
      aria-label="Workspace document force graph"
    >
      {graph.nodes.length === 0 ? (
        <p className={canvasEmptyClassName}>No workspace documents to draw.</p>
      ) : null}
    </div>
  );
};

type ReactionLayoutCanvasProps = {
  nodes: KnowledgeMapViewModel["reactionMap"]["nodes"];
  edges: KnowledgeMapViewModel["reactionMap"]["edges"];
  selectedReactionId?: string;
  onSelectReaction: (reactionId: string) => void;
};

type ReactionForceGraphNode = NodeObject & {
  id: string;
  reactionId: string;
  label: string;
  clusterId?: string;
  qualityTier: string;
  selected: boolean;
  val: number;
};

type ReactionForceGraphLink = LinkObject<ReactionForceGraphNode> & {
  source: string | ReactionForceGraphNode;
  target: string | ReactionForceGraphNode;
  edgeId: string;
  basis: string[];
  score: number | null;
};

type ReactionForceGraphData = GraphData<ReactionForceGraphNode, ReactionForceGraphLink>;

const buildForceGraphData = (
  nodes: ReactionLayoutCanvasProps["nodes"],
  edges: ReactionLayoutCanvasProps["edges"],
  selectedReactionId?: string
): ReactionForceGraphData => {
  const visibleIds = new Set(nodes.map((node) => node.reaction_entity_id));
  return {
    nodes: nodes.map((node) => ({
      id: node.reaction_entity_id,
      reactionId: node.reaction_entity_id,
      label: node.procedure_signature ?? node.condition_signature ?? node.reaction_entity_id,
      clusterId: node.cluster_id,
      qualityTier: node.quality_tier ?? "semantic",
      selected: node.reaction_entity_id === selectedReactionId,
      val: node.reaction_entity_id === selectedReactionId ? 7 : 4,
      x: node.x * 36,
      y: node.y * 36
    })),
    links: edges
      .filter((edge) =>
        visibleIds.has(edge.from_reaction_entity_id)
        && visibleIds.has(edge.to_reaction_entity_id)
      )
      .map((edge) => ({
        source: edge.from_reaction_entity_id,
        target: edge.to_reaction_entity_id,
        edgeId: `${edge.from_reaction_entity_id}->${edge.to_reaction_entity_id}:${edge.basis.join("|")}`,
        basis: [...edge.basis],
        score: "score" in edge && typeof edge.score === "number" ? edge.score : null
      }))
  };
};

const reactionNodeColor = (node: ReactionForceGraphNode): string => {
  if (node.selected) {
    return "oklch(31% 0.04 260)";
  }
  return node.clusterId ? "oklch(56% 0.11 215)" : "oklch(62% 0.09 160)";
};

const reactionLinkColor = (link: ReactionForceGraphLink): string =>
  link.basis.includes("hybrid_consensus")
    ? "oklch(55% 0.12 30 / 0.72)"
    : "oklch(58% 0.07 250 / 0.48)";

const forceGraphLabel = (node: ReactionForceGraphNode): string =>
  `${node.label}<br/>${node.qualityTier}`;

const ReactionLayoutCanvas = ({
  nodes,
  edges,
  selectedReactionId,
  onSelectReaction
}: ReactionLayoutCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const graphData = useMemo(
    () => buildForceGraphData(nodes, edges, selectedReactionId),
    [edges, nodes, selectedReactionId]
  );

  const graphDataRef = useRef(graphData);
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  useEffect(() => {
    if (!containerRef.current || graphRef.current) {
      return;
    }

    let isMounted = true;
    import("force-graph").then((module) => {
      if (!isMounted || !containerRef.current) return;
      const ForceGraph = module.default;
      const graph = new ForceGraph(containerRef.current)
        .backgroundColor("rgba(255,255,255,0)")
        .nodeId("id")
        .nodeLabel((node) => forceGraphLabel(node as ReactionForceGraphNode))
        .nodeVal("val")
        .nodeColor((node) => reactionNodeColor(node as ReactionForceGraphNode))
        .linkColor((link) => reactionLinkColor(link as ReactionForceGraphLink))
        .linkWidth((link) => {
          const reactionLink = link as ReactionForceGraphLink;
          return reactionLink.score ? Math.max(1, reactionLink.score * 2.4) : 1;
        })
        .linkDirectionalArrowLength(3.5)
        .linkDirectionalArrowRelPos(0.86)
        .cooldownTicks(80)
        .enableNodeDrag(true)
        .onNodeClick((node) => onSelectReaction((node as ReactionForceGraphNode).reactionId));

      graphRef.current = graph;
      graph.graphData(graphDataRef.current).d3ReheatSimulation();
    });

    return () => {
      isMounted = false;
      if (graphRef.current) {
        graphRef.current.pauseAnimation();
        graphRef.current._destructor();
        graphRef.current = null;
      }
    };
  }, [onSelectReaction]);

  useEffect(() => {
    graphRef.current
      ?.graphData(graphData)
      .d3ReheatSimulation();
  }, [graphData]);

  useEffect(() => {
    const container = containerRef.current;
    const graph = graphRef.current;
    if (!container || !graph) {
      return;
    }

    const resize = () => {
      graph
        .width(Math.max(container.clientWidth, 280))
        .height(Math.max(container.clientHeight, 220));
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={canvasClassName}
      role="img"
      aria-label="Reaction force graph"
    >
      {nodes.length === 0 ? (
        <p className={canvasEmptyClassName}>No reactions to draw.</p>
      ) : null}
    </div>
  );
};

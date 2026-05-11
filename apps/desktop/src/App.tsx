import { invoke } from "@tauri-apps/api/core";
import { Activity, AlertTriangle, Bot, CheckCircle2, ChevronRight, CircleDot, Database, FileCode2, Files, FlaskConical, GitGraph, Lightbulb, PanelBottom, PlayCircle, RefreshCw, ScrollText, Search, Settings, ShieldCheck, Sparkles, Square, UploadCloud, Wrench, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { appendToolCall, applyPatchDecision, approvePatchDecision, attachEvidence, createAgentRun, createToolResult, getAuditTimeline, proposePatch, rejectPatchDecision, transitionAgentRunStatus, type AgentAuditEvent, type AgentEvidence, type AgentRun, type AgentToolCall, type PatchDecision, type PatchProposal } from "@chemd/agent-tools";
import { buildEditorGraphRagRecords, compileChemdForEditor, type ChemdEditorDiagnostic, type ChemdLanguageCompileOutput, type ChemdOutlineItem, type ChemdQuickFixProposal, type ChemdTextEdit } from "@chemd/language-service";

import { shellFiles, shellPostgresStatus, shellSidecarStatus, shellWorkspace, type DesktopCommandError, type DesktopCommandMap, type PostgresStatus, type RuntimeState, type SidecarStatus, type WorkspaceFileEntry, type WorkspaceHandle } from "./desktop-contracts";
import { buildPersistRuntimeGraphRagCommandInput } from "./desktop-runtime-persistence";

type WorkspaceState = "empty" | "opening" | "open" | "error"; type DocumentMode = "sample" | "workspace";
type SidecarOperation = "start" | "stop" | "refresh" | "logs";
type AgentMessageTone = "info" | "warning" | "success" | "danger";
type AgentMessage = { tone: AgentMessageTone; text: string };
type QuickFixCandidate = { diagnostic: ChemdEditorDiagnostic; quickFix: ChemdQuickFixProposal };
type AgentOperationResult = { run: AgentRun; message: AgentMessage };
type PersistOperationState = "idle" | "pending" | "success" | "failure";
type PersistSummary = {
  graphSnapshotId: string;
  counts: DesktopCommandMap["persist_runtime_graph_rag"]["output"]["counts"];
};
type PersistState = {
  state: PersistOperationState;
  message: string;
  summary: PersistSummary | null;
};
type PersistBuildInput = {
  source: string;
  workspace: WorkspaceHandle;
  file: WorkspaceFileEntry;
  compileOutput: ChemdLanguageCompileOutput;
  agentRun: AgentRun | null;
};
type PersistControllerInput = PersistBuildInput & {
  mode: DocumentMode;
  postgresStatus: PostgresStatus;
};
type DesktopWorkbenchProps = {
  workspace: WorkspaceHandle;
  workspaceState: WorkspaceState;
  sidecarController: ReturnType<typeof useSidecarController>;
  postgresController: ReturnType<typeof usePostgresController>;
  persistController: ReturnType<typeof usePersistRuntimeController>;
  output: ChemdLanguageCompileOutput;
  compileError?: string;
  files: WorkspaceFileEntry[];
  selectedFile: WorkspaceFileEntry;
  selectedFileId: string;
  mode: DocumentMode;
  message: string;
  source: string;
  savedSource: string;
  rootPath: string;
  canSave: boolean;
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
  onRootPathChange: (value: string) => void;
  onSave: () => void;
  onOpenWorkspace: () => void;
  onSelectFile: (file: WorkspaceFileEntry) => void;
  onSourceChange: (nextSource: string) => void;
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
};

const sampleSources: Record<string, string> = {
  "suzuki-screen.chemd.md": "---\nid: exp-desktop-suzuki\ntitle: Suzuki coupling condition screen\ndate: 2026-05-12\n---\n\n:::chemd #mol-aryl-bromide\nsmiles: Cc1ccc(Br)cc1\n:::\n\n:::chemd #rxn-screen\nkind: reaction\nreactants: mol-aryl-bromide, phenylboronic-acid\nproducts: biaryl-product\nconditions:\n  catalyst: Pd(PPh3)4\n  base: K2CO3\n  solvent: dioxane/water\n:::\n\n:::result #screen-result\nstatus: pending\nyield: 78%\n:::\n",
  "calibration.chemd.md": "---\nid: exp-desktop-calibration\ntitle: HPLC calibration record\ndate: 2026-05-12\n---\n\n:::sample #std-a\nname: caffeine standard\namount: 2.0 mg\n:::\n\n:::analysis #calibration\nmethod: HPLC-UV\ntarget: caffeine\nresult: linear fit accepted\n:::\n"
};

const activityItems = [{ id: "files", label: "Files", icon: Files, active: true }, { id: "search", label: "RAG Search", icon: Search, active: false }, { id: "graph", label: "Reaction Graph", icon: GitGraph, active: false }, { id: "agent", label: "Agent Runs", icon: Bot, active: false }, { id: "settings", label: "Settings", icon: Settings, active: false }];

const statusToneByState: Record<RuntimeState, string> = { ready: "success", placeholder: "pending", degraded: "warning", offline: "danger" };
const workspaceStateLabel: Record<WorkspaceState, string> = { empty: "Empty", opening: "Opening", open: "Open", error: "Fallback" };
const agentStatusLabel: Record<AgentRun["status"], string> = {
  created: "Created",
  running: "Running",
  waiting_for_approval: "Awaiting approval",
  applying_patch: "Applying patch",
  validating: "Validating",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  canceled: "Canceled"
};
const auditEventLabel: Record<AgentAuditEvent["type"], string> = {
  run_created: "Run",
  status_transitioned: "Status",
  tool_call_appended: "Tool",
  evidence_attached: "Evidence",
  patch_proposed: "Patch",
  patch_approved: "Approve",
  patch_rejected: "Reject",
  patch_applied: "Apply",
  decision_blocked: "Blocked"
};

const invokeDesktop = async <Command extends keyof DesktopCommandMap>(
  command: Command,
  input: DesktopCommandMap[Command]["input"]
): Promise<DesktopCommandMap[Command]["output"]> =>
  input === undefined ? invoke(command) : invoke(command, input as Record<string, unknown>);

const getSampleSource = (file: WorkspaceFileEntry): string =>
  sampleSources[file.name] ?? sampleSources["suzuki-screen.chemd.md"];

const getDisplayableError = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  if (commandError?.message) {
    return commandError.detail ? `${commandError.message}: ${commandError.detail}` : commandError.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown desktop command failure";
};

const getSidecarErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return firstLine || "chem-service command failed";
};

const getPostgresErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return firstLine || "Postgres status unavailable";
};

const formatPostgresValue = (value: string | number | boolean | null): string => {
  if (value === null) return "unknown";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
};

const getPostgresBadgeDetail = (status: PostgresStatus): string => {
  if (!status.configured) return "Postgres is not configured";
  return [
    status.source ? `source ${status.source}` : null,
    status.host ? `host ${status.host}` : null,
    status.database ? `database ${status.database}` : null,
    status.user ? `user ${status.user}` : null
  ].filter(Boolean).join(" / ") || "Postgres is configured; inspect the runtime panel for details";
};

const getLineStarts = (source: string): number[] => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
};

const getOffset = (source: string, line: number, column: number): number => {
  const lineStart = getLineStarts(source)[Math.max(0, line - 1)] ?? source.length;
  return Math.min(source.length, lineStart + Math.max(0, column - 1));
};

const applyTextEdits = (source: string, edits: readonly ChemdTextEdit[]): string =>
  [...edits]
    .sort((left, right) =>
      getOffset(source, right.range.startLine, right.range.startColumn)
      - getOffset(source, left.range.startLine, left.range.startColumn)
    )
    .reduce((next, edit) => {
      const start = getOffset(next, edit.range.startLine, edit.range.startColumn);
      const end = getOffset(next, edit.range.endLine, edit.range.endColumn);
      return `${next.slice(0, start)}${edit.replacement}${next.slice(end)}`;
    }, source);

const createEditorSourceHash = (source: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const initialPersistState: PersistState = {
  state: "idle",
  message: "Graph/RAG payload is ready for a configured Postgres runtime.",
  summary: null
};

const redactSensitiveRuntimeText = (message: string): string =>
  message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/(\/\/[^:\s/]+:)[^@\s/]+(@)/g, "$1[redacted]$2")
    .replace(/\b(?:database_url|password|passwd|pwd)=\S+/gi, (match) => {
      const [key] = match.split("=", 1);
      return `${key}=[redacted]`;
    });

const getPersistErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return redactSensitiveRuntimeText(firstLine || "Persist graph failed");
};

const summarizeGraphSnapshotId = (graphSnapshotId: string): string =>
  graphSnapshotId.length <= 38
    ? graphSnapshotId
    : `${graphSnapshotId.slice(0, 16)}...${graphSnapshotId.slice(-16)}`;

const formatPersistCounts = (counts: PersistSummary["counts"]): string =>
  `${counts.snapshots} snapshot / ${counts.nodes} nodes / ${counts.edges} edges / ${counts.citations} citations / ${counts.agentRuns} agent runs / ${counts.agentToolCalls} tools / ${counts.patchProposals} patches`;

const getPersistDisabledReason = ({
  mode,
  file,
  postgresStatus,
  compileStatus
}: {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  postgresStatus: PostgresStatus;
  compileStatus: ChemdLanguageCompileOutput["status"];
}): string | null => {
  if (mode !== "workspace") return "Open a local workspace file before persisting Graph/RAG records.";
  if (file.kind !== "file") return "Select a file before persisting Graph/RAG records.";
  if (!postgresStatus.configured) return "Configure Postgres before persisting Graph/RAG records.";
  if (postgresStatus.state !== "ready") return "Postgres must be reachable before persisting Graph/RAG records.";
  if (postgresStatus.vectorInstalled !== true) return "Install pgvector before persisting Graph/RAG records.";
  if (postgresStatus.schemaReady !== true) return "Run PostgreSQL migrations before persisting Graph/RAG records.";
  if (compileStatus === "failed") return "Resolve the compile failure before persisting Graph/RAG records.";
  return null;
};

const buildPersistCommandInput = ({
  source,
  workspace,
  file,
  compileOutput,
  agentRun
}: PersistBuildInput): DesktopCommandMap["persist_runtime_graph_rag"]["input"] => {
  const sourceHash = createEditorSourceHash(source);
  const documentHash = createEditorSourceHash(`${workspace.workspaceId}:${file.path}`);
  const revisionId = `desktop:${documentHash}:fnv1a:${sourceHash}`;
  const experimentId = `desktop:${workspace.workspaceId}:${documentHash}`;
  const records = buildEditorGraphRagRecords({
    source,
    documentUri: file.path,
    experimentId,
    revisionId,
    createdAt: new Date().toISOString(),
    compileOutput
  });
  const input = buildPersistRuntimeGraphRagCommandInput({
    records,
    source,
    workspace: {
      workspaceId: workspace.workspaceId,
      rootPath: workspace.rootPath,
      displayName: workspace.displayName
    },
    document: {
      path: file.path,
      documentId: file.id,
      documentUri: file.path,
      name: file.name,
      revisionId,
      experimentId
    },
    agentRun
  });
  return input as unknown as DesktopCommandMap["persist_runtime_graph_rag"]["input"];
};

const formatRange = (range: ChemdTextEdit["range"]): string =>
  `L${range.startLine}:C${range.startColumn}-L${range.endLine}:C${range.endColumn}`;

const formatSidecarStartedAt = (startedAt: string | null): string => {
  if (!startedAt) {
    return "not running";
  }
  const numericTimestamp = Number(startedAt);
  const date = Number.isFinite(numericTimestamp)
    ? new Date(numericTimestamp)
    : new Date(startedAt);
  return Number.isNaN(date.getTime()) ? startedAt : date.toLocaleString();
};

const createAgentId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getLatestPatchProposal = (run: AgentRun | null): PatchProposal | undefined =>
  run?.patchProposals[run.patchProposals.length - 1];

const findPatchDecision = (
  run: AgentRun | null,
  patchProposalId: string | undefined,
  kind: PatchDecision["kind"]
): PatchDecision | undefined =>
  patchProposalId === undefined
    ? undefined
    : run?.patchDecisions.find((decision) =>
        decision.patchProposalId === patchProposalId && decision.kind === kind
      );

const createDiagnosticEvidence = (
  diagnostic: ChemdEditorDiagnostic,
  quickFix: ChemdQuickFixProposal,
  file: WorkspaceFileEntry
): AgentEvidence => ({
  kind: "diagnostic",
  documentId: file.id,
  filePath: file.path,
  sourceRange: diagnostic.range,
  summary: `${diagnostic.code}: ${diagnostic.message}`,
  citation: {
    citationId: `diagnostic:${quickFix.id}`,
    sourceLabel: `${diagnostic.code} quick fix`,
    documentId: file.id,
    filePath: file.path,
    sourceRange: diagnostic.range
  }
});

const createQuickFixPatchProposal = (
  diagnostic: ChemdEditorDiagnostic,
  quickFix: ChemdQuickFixProposal,
  file: WorkspaceFileEntry,
  evidence: AgentEvidence
): PatchProposal => ({
  patchProposalId: createAgentId("patch"),
  documentId: file.id,
  baseRevisionId: quickFix.patch.beforeHash,
  beforeHash: quickFix.patch.beforeHash,
  title: quickFix.title,
  rationale: `Use language-service quick fix for ${diagnostic.code}: ${diagnostic.message}`,
  edits: quickFix.patch.edits,
  evidence: [evidence]
});

const createProposalToolCall = ({
  runId,
  toolCallId,
  workspaceId,
  file,
  candidate,
  evidence,
  at
}: {
  runId: string;
  toolCallId: string;
  workspaceId: string;
  file: WorkspaceFileEntry;
  candidate: QuickFixCandidate;
  evidence: AgentEvidence;
  at: string;
}): AgentToolCall => ({
  toolCallId,
  agentRunId: runId,
  workspaceId,
  toolName: "propose_repair",
  payload: {
    diagnosticCode: candidate.diagnostic.code,
    quickFixId: candidate.quickFix.id,
    filePath: file.path
  },
  status: "ok",
  startedAt: at,
  finishedAt: at,
  result: createToolResult({
    toolCallId,
    status: "ok",
    payload: {
      title: candidate.quickFix.title,
      edits: candidate.quickFix.patch.edits.length
    },
    evidence: [evidence]
  })
});

const createAgentProposalRun = (
  candidate: QuickFixCandidate,
  file: WorkspaceFileEntry,
  workspaceId: string
): AgentOperationResult => {
  const now = new Date().toISOString();
  const runId = createAgentId("run");
  const toolCallId = createAgentId("tool");
  const evidence = createDiagnosticEvidence(candidate.diagnostic, candidate.quickFix, file);
  const patchProposal = createQuickFixPatchProposal(
    candidate.diagnostic,
    candidate.quickFix,
    file,
    evidence
  );
  const toolCall = createProposalToolCall({
    runId,
    toolCallId,
    workspaceId,
    file,
    candidate,
    evidence,
    at: now
  });
  const createdRun = createAgentRun({
    agentRunId: runId,
    workspaceId,
    goal: `Prepare quick fix patch for ${file.path}`,
    targetFiles: [file.path],
    createdAt: now
  });
  const runningResult = transitionAgentRunStatus(createdRun, {
    status: "running",
    at: now,
    summary: "Collected current language-service diagnostics."
  });
  if (!runningResult.ok) {
    return { run: runningResult.run, message: { tone: "danger", text: runningResult.error.message } };
  }

  const toolResult = appendToolCall(runningResult.run, {
    toolCall,
    at: now,
    summary: `Proposed repair from quick fix ${candidate.quickFix.id}.`
  });
  if (!toolResult.ok) {
    return { run: toolResult.run, message: { tone: "danger", text: toolResult.error.message } };
  }

  const evidenceResult = attachEvidence(toolResult.run, {
    evidence: [evidence],
    at: now,
    summary: `Attached diagnostic evidence for ${candidate.diagnostic.code}.`
  });
  if (!evidenceResult.ok) {
    return { run: evidenceResult.run, message: { tone: "danger", text: evidenceResult.error.message } };
  }

  const proposalResult = proposePatch(evidenceResult.run, {
    patchProposal,
    at: now,
    summary: `Patch proposal awaits explicit approval: ${patchProposal.title}.`
  });
  return {
    run: proposalResult.run,
    message: proposalResult.ok
      ? { tone: "info", text: "Review the patch proposal, then approve before applying." }
      : { tone: "danger", text: proposalResult.error.message }
  };
};

const approveAgentRunPatch = (run: AgentRun): AgentOperationResult | null => {
  const activeProposal = getLatestPatchProposal(run);
  if (!activeProposal) return null;

  const result = approvePatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    userApprovalId: createAgentId("approval"),
    reason: "User explicitly approved patch proposal.",
    decidedAt: new Date().toISOString()
  });
  return {
    run: result.run,
    message: result.ok
      ? { tone: "success", text: "Patch approved. Apply is now enabled for the current buffer." }
      : { tone: "danger", text: result.error.message }
  };
};

const applyAgentRunPatch = (
  run: AgentRun,
  source: string
): { result: AgentOperationResult; nextSource?: string } | null => {
  const activeProposal = getLatestPatchProposal(run);
  const approvedDecision = findPatchDecision(run, activeProposal?.patchProposalId, "approved");
  if (!activeProposal || !approvedDecision) return null;

  const appliedResult = applyPatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    userApprovalId: approvedDecision.userApprovalId,
    reason: "Applied approved patch to current editor buffer.",
    decidedAt: new Date().toISOString(),
    currentBeforeHash: createEditorSourceHash(source)
  });
  if (!appliedResult.ok) {
    return {
      result: {
        run: appliedResult.run,
        message: { tone: "danger", text: appliedResult.error.message }
      }
    };
  }

  const completedResult = transitionAgentRunStatus(appliedResult.run, {
    status: "completed",
    at: new Date().toISOString(),
    summary: "Applied approved patch to the editor buffer.",
    finalSummary: "Patch applied locally. Save remains under the normal workspace save flow."
  });
  return {
    nextSource: applyTextEdits(source, activeProposal.edits),
    result: {
      run: completedResult.run,
      message: completedResult.ok
        ? { tone: "success", text: "Patch applied to the editor buffer. Use Save to persist it." }
        : { tone: "danger", text: completedResult.error.message }
    }
  };
};

const rejectAgentRunPatch = (run: AgentRun): AgentOperationResult | null => {
  const activeProposal = getLatestPatchProposal(run);
  if (!activeProposal) return null;

  const rejectedResult = rejectPatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    reason: "User rejected patch proposal.",
    decidedAt: new Date().toISOString()
  });
  if (!rejectedResult.ok) {
    return {
      run: rejectedResult.run,
      message: { tone: "danger", text: rejectedResult.error.message }
    };
  }

  const canceledResult = transitionAgentRunStatus(rejectedResult.run, {
    status: "canceled",
    at: new Date().toISOString(),
    summary: "Patch proposal rejected by user.",
    finalSummary: "No editor changes were applied."
  });
  return {
    run: canceledResult.run,
    message: canceledResult.ok
      ? { tone: "warning", text: "Patch rejected. The editor buffer was not changed." }
      : { tone: "danger", text: canceledResult.error.message }
  };
};

const PanelHeader = ({ eyebrow, title, meta }: { eyebrow: string; title: string; meta: string }) => (
  <div className="desktop-panel-header">
    <div className="desktop-panel-title-group"><p className="desktop-panel-eyebrow">{eyebrow}</p><h2>{title}</h2></div>
    <span className="desktop-panel-meta">{meta}</span>
  </div>
);

const StatusBadge = ({ label, state, detail }: { label: string; state: RuntimeState; detail: string }) => (
  <span className="desktop-status-badge" data-state={statusToneByState[state]} title={detail}><span className="desktop-status-dot" />{label}</span>
);

const SidecarButton = ({
  label,
  loadingLabel,
  icon: Icon,
  operation,
  activeOperation,
  disabled,
  onClick
}: {
  label: string;
  loadingLabel: string;
  icon: typeof PlayCircle;
  operation: SidecarOperation;
  activeOperation: SidecarOperation | null;
  disabled: boolean;
  onClick: () => void;
}) => {
  const loading = activeOperation === operation;
  return (
    <button type="button" className="desktop-button" disabled={disabled} aria-busy={loading} onClick={onClick}>
      <Icon size={14} />
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
};

const SidecarControlPanel = ({
  status,
  logTail,
  operation,
  message,
  errorMessage,
  onStart,
  onStop,
  onRefresh,
  onLoadLogs
}: {
  status: SidecarStatus;
  logTail: string[];
  operation: SidecarOperation | null;
  message: string | null;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onLoadLogs: () => void;
}) => {
  const busy = operation !== null;
  const canStart = !busy && status.state !== "ready" && status.pid === null;
  const canStop = !busy && (status.state === "ready" || status.pid !== null);
  const visibleLogTail = logTail.length > 0 ? logTail : status.logTail;

  return (
    <section className="desktop-sidecar-panel" aria-label="chem-service sidecar controls">
      <div className="desktop-sidecar-heading">
        <div className="desktop-agent-subhead"><FlaskConical size={14} /><span>chem-service sidecar</span></div>
        <StatusBadge label={status.label} state={status.state} detail={status.detail} />
      </div>
      <div className="desktop-sidecar-actions">
        <SidecarButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!canStart} onClick={onStart} />
        <SidecarButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!canStop} onClick={onStop} />
        <SidecarButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={busy} onClick={onRefresh} />
        <SidecarButton label="Load logs" loadingLabel="Loading" icon={ScrollText} operation="logs" activeOperation={operation} disabled={busy} onClick={onLoadLogs} />
      </div>
      <dl className="desktop-sidecar-fields">
        <div><dt>State</dt><dd>{status.state}</dd></div>
        <div><dt>PID</dt><dd>{status.pid ?? "none"}</dd></div>
        <div><dt>Started</dt><dd>{formatSidecarStartedAt(status.startedAt)}</dd></div>
        <div><dt>Detail</dt><dd>{status.detail}</dd></div>
      </dl>
      {errorMessage ? <p className="desktop-sidecar-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className="desktop-sidecar-message" data-tone="info">{message}</p> : null}
      <div className="desktop-sidecar-log" aria-label="chem-service log tail">
        {visibleLogTail.length > 0
          ? visibleLogTail.map((line, index) => <code key={`${index}-${line}`}>{line}</code>)
          : <span>No log tail loaded.</span>}
      </div>
    </section>
  );
};

const PostgresStatusPanel = ({
  status,
  loading,
  errorMessage,
  persistState,
  persistDisabledReason,
  onRefresh,
  onPersistGraph
}: {
  status: PostgresStatus;
  loading: boolean;
  errorMessage: string | null;
  persistState: PersistState;
  persistDisabledReason: string | null;
  onRefresh: () => void;
  onPersistGraph: () => void;
}) => {
  const fields: Array<[string, string]> = [
    ["State", status.state],
    ["Configured", formatPostgresValue(status.configured)],
    ["Source", formatPostgresValue(status.source)],
    ["Host", formatPostgresValue(status.host)],
    ["Database", formatPostgresValue(status.database)],
    ["User", formatPostgresValue(status.user)],
    ["SSL", status.ssl],
    ["pgvector", formatPostgresValue(status.vectorInstalled)],
    ["Schema", formatPostgresValue(status.schemaReady)],
    ["Timeout", `${status.timeoutMs}ms`],
    ["Detail", status.detail]
  ];

  return (
    <section className="desktop-postgres-panel" aria-label="Postgres runtime status">
      <div className="desktop-postgres-heading">
        <div className="desktop-agent-subhead"><Database size={14} /><span>Postgres runtime</span></div>
        <StatusBadge label={status.label} state={status.state} detail={status.detail} />
      </div>
      <div className="desktop-postgres-actions">
        <button type="button" className="desktop-button" disabled={loading} aria-busy={loading} onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>{loading ? "Refreshing" : "Refresh Postgres"}</span>
        </button>
        <button
          type="button"
          className="desktop-button-primary"
          disabled={persistState.state === "pending" || persistDisabledReason !== null}
          aria-busy={persistState.state === "pending"}
          onClick={onPersistGraph}
        >
          {persistState.state === "pending" ? <RefreshCw size={14} /> : <UploadCloud size={14} />}
          <span>{persistState.state === "pending" ? "Persisting" : "Persist graph"}</span>
        </button>
      </div>
      {errorMessage ? <p className="desktop-postgres-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {persistDisabledReason ? <p className="desktop-postgres-message" data-tone="warning">{persistDisabledReason}</p> : null}
      <div className="desktop-persist-status" data-state={persistState.state} aria-live="polite">
        <div className="desktop-persist-status-row">
          <span>{persistState.state}</span>
          <p>{persistState.message}</p>
        </div>
        {persistState.summary ? (
          <dl className="desktop-persist-summary">
            <div><dt>Graph snapshot</dt><dd title={persistState.summary.graphSnapshotId}>{summarizeGraphSnapshotId(persistState.summary.graphSnapshotId)}</dd></div>
            <div><dt>Counts</dt><dd>{formatPersistCounts(persistState.summary.counts)}</dd></div>
          </dl>
        ) : null}
      </div>
      <dl className="desktop-postgres-fields">
        {fields.map(([label, value]) => (
          <div key={label} className={label === "Detail" ? "desktop-postgres-field-wide" : undefined}>
            <dt>{label}</dt>
            <dd title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const TopBar = ({
  workspace,
  workspaceState,
  sidecarStatus,
  postgresStatus,
  diagnosticCount,
  dirty,
  rootPath,
  canSave,
  onRootPathChange,
  onSave,
  onOpenWorkspace
}: {
  workspace: WorkspaceHandle;
  workspaceState: WorkspaceState;
  sidecarStatus: SidecarStatus;
  postgresStatus: PostgresStatus;
  diagnosticCount: number;
  dirty: boolean;
  rootPath: string;
  canSave: boolean;
  onRootPathChange: (value: string) => void;
  onSave: () => void;
  onOpenWorkspace: () => void;
}) => (
  <header className="desktop-topbar">
    <div className="desktop-brand">
      <div className="desktop-logo-mark" aria-hidden="true"><FlaskConical size={16} /></div>
      <div className="desktop-brand-copy"><span className="desktop-product-name">Chemd Desktop IDE</span><span className="desktop-workspace-name">{workspace.displayName}</span></div>
    </div>
    <div className="desktop-topbar-center">
      <input
        className="desktop-path-input"
        value={rootPath}
        onChange={(event) => onRootPathChange(event.target.value)}
        placeholder="D:\\path\\to\\workspace"
        aria-label="Workspace root path"
      />
      <span className="desktop-path-chip" title={workspace.rootHint}>{workspace.rootHint}</span>
    </div>
    <div className="desktop-runtime-badges" aria-label="Runtime status">
      <button type="button" className="desktop-button-primary" disabled={workspaceState === "opening"} onClick={onOpenWorkspace}>{workspaceState === "opening" ? "Opening" : "Open"}</button>
      <button type="button" className="desktop-button" disabled={!canSave} onClick={onSave}>Save</button>
      <StatusBadge label={workspaceStateLabel[workspaceState]} state={workspaceState === "open" ? "ready" : workspaceState === "error" ? "degraded" : "placeholder"} detail="Workspace access uses open_workspace and list_workspace_files" />
      <StatusBadge label={`${diagnosticCount} diagnostics`} state={diagnosticCount > 0 ? "degraded" : "ready"} detail="Computed by @chemd/language-service" />
      <StatusBadge label={dirty ? "Dirty" : "Saved"} state={dirty ? "degraded" : "ready"} detail="Local editor buffer state" />
      <StatusBadge label={sidecarStatus.label} state={sidecarStatus.state} detail={sidecarStatus.detail} />
      <StatusBadge label={`Postgres ${postgresStatus.state}`} state={postgresStatus.state} detail={getPostgresBadgeDetail(postgresStatus)} />
    </div>
  </header>
);

const ActivityRail = () => (
  <nav className="desktop-activity-rail" aria-label="Primary tools">
    {activityItems.map(({ id, label, icon: Icon, active }) => (
      <button key={id} type="button" className="desktop-rail-button" data-active={active} aria-label={label} title={label}><Icon size={18} /></button>
    ))}
  </nav>
);

const Sidebar = ({
  files,
  selectedFileId,
  mode,
  message,
  onSelectFile
}: {
  files: WorkspaceFileEntry[];
  selectedFileId: string;
  mode: DocumentMode;
  message: string;
  onSelectFile: (file: WorkspaceFileEntry) => void;
}) => (
  <aside className="desktop-sidebar">
    <PanelHeader eyebrow="Workspace" title="Files" meta={mode === "sample" ? "Sample" : "Local"} />
    <div className="desktop-sidebar-note" data-mode={mode}><Sparkles size={14} /><span>{message}</span></div>
    <ul className="desktop-file-tree" aria-label="Workspace files">
      {files.map((file) => (
        <li key={file.id}>
          <button type="button" className="desktop-file-row" data-kind={file.kind} data-selected={file.id === selectedFileId} onClick={() => onSelectFile(file)}>
            <span className="desktop-file-icon" aria-hidden="true">{file.kind === "directory" ? <Files size={14} /> : <FileCode2 size={14} />}</span>
            <span className="desktop-file-name">{file.name}</span><span className="desktop-file-kind">{file.chemdKind ?? file.kind}</span>
          </button>
        </li>
      ))}
    </ul>
  </aside>
);

const EditorPane = ({
  fileName,
  mode,
  source,
  lineCount,
  compiledAt,
  onChange
}: {
  fileName: string;
  mode: DocumentMode;
  source: string;
  lineCount: number;
  compiledAt: string;
  onChange: (next: string) => void;
}) => (
  <section className="desktop-pane desktop-editor-pane" aria-label="Editor">
    <PanelHeader eyebrow="Editor" title={fileName} meta={`${lineCount} lines`} />
    <div className="desktop-editor-toolbar"><Activity size={15} /><span className="desktop-toolbar-text">{mode === "sample" ? "Bundled sample buffer" : "Local workspace file"}</span><span className="desktop-toolbar-divider" /><span className="desktop-toolbar-text">Compiled {new Date(compiledAt).toLocaleTimeString()}</span></div>
    <textarea className="desktop-editor-textarea" value={source} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)} spellCheck={false} aria-label="Chemd source editor" />
  </section>
);

const OutlineTree = ({ items }: { items: ChemdOutlineItem[] }) => (
  <ul className="desktop-outline-list">
    {items.map((item) => (
      <li key={item.id} className="desktop-outline-item">
        <div className="desktop-outline-row"><ChevronRight size={13} /><span className="desktop-outline-kind">{item.kind}</span><span className="desktop-outline-label">{item.label}</span><span className="desktop-outline-line">L{item.range.startLine}</span></div>
        {item.children?.length ? <OutlineTree items={item.children} /> : null}
      </li>
    ))}
  </ul>
);

const getQuickFixCandidates = (diagnostics: ChemdEditorDiagnostic[]): QuickFixCandidate[] =>
  diagnostics.flatMap((diagnostic) =>
    diagnostic.quickFixes.map((quickFix) => ({ diagnostic, quickFix }))
  );

const AgentRunHeader = ({
  agentRun,
  agentMessage
}: {
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
}) => (
  <>
    <div className="desktop-agent-heading">
      <Bot size={15} />
      <span>Agent run</span>
      <span className="desktop-agent-status" data-status={agentRun?.status ?? "created"}>
        {agentRun ? agentStatusLabel[agentRun.status] : "Idle"}
      </span>
    </div>
    {agentMessage ? <p className="desktop-agent-message" data-tone={agentMessage.tone}>{agentMessage.text}</p> : null}
  </>
);

const AgentEmptyState = ({
  mode,
  hasQuickFixes
}: {
  mode: DocumentMode;
  hasQuickFixes: boolean;
}) => (
  mode === "workspace" && hasQuickFixes ? null : (
    <div className="desktop-agent-empty">
      {mode !== "workspace"
        ? "Open a local workspace to let Agent propose edits against real files."
        : "No language-service quick fixes are available for this buffer."}
    </div>
  )
);

const AgentQuickFixList = ({
  mode,
  quickFixes,
  onProposeQuickFix
}: {
  mode: DocumentMode;
  quickFixes: QuickFixCandidate[];
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
}) => (
  <div className="desktop-quickfix-list">
    {quickFixes.length > 0 ? quickFixes.map((candidate) => (
      <button
        key={candidate.quickFix.id}
        type="button"
        disabled={mode !== "workspace"}
        onClick={() => onProposeQuickFix(candidate)}
      >
        <Lightbulb size={14} />
        <span>{candidate.quickFix.title}</span>
      </button>
    )) : <span className="desktop-empty-copy">No quick fixes available.</span>}
  </div>
);

const AgentPatchProposalCard = ({
  proposal,
  canApprove,
  canApply,
  canReject,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: {
  proposal?: PatchProposal;
  canApprove: boolean;
  canApply: boolean;
  canReject: boolean;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
}) => (
  proposal ? (
    <div className="desktop-agent-proposal">
      <div className="desktop-agent-subhead"><Wrench size={14} /><span>{proposal.title}</span></div>
      <p>{proposal.rationale}</p>
      <ul className="desktop-agent-edit-list">
        {proposal.edits.map((edit, index) => (
          <li key={`${proposal.patchProposalId}-${index}`}>
            <span>{formatRange(edit.range)}</span>
            <code>{edit.replacement.split(/\r?\n/, 1)[0] || "empty replacement"}</code>
          </li>
        ))}
      </ul>
      <div className="desktop-agent-action-row">
        <button type="button" className="desktop-button" disabled={!canApprove} onClick={onApprovePatch}><ShieldCheck size={14} />Approve</button>
        <button type="button" className="desktop-button-primary" disabled={!canApply} onClick={onApplyPatch}><PlayCircle size={14} />Apply</button>
        <button type="button" className="desktop-button" disabled={!canReject} onClick={onRejectPatch}><XCircle size={14} />Reject</button>
      </div>
    </div>
  ) : null
);

const AgentTimeline = ({ agentRun }: { agentRun: AgentRun | null }) => {
  const timeline = agentRun ? getAuditTimeline(agentRun) : [];
  return (
    <div className="desktop-agent-timeline">
      <div className="desktop-agent-subhead"><Activity size={14} /><span>Timeline</span></div>
      {timeline.length > 0 ? timeline.map((event) => (
        <div key={event.eventId} className="desktop-agent-timeline-row" data-type={event.type}>
          <span>{auditEventLabel[event.type]}</span>
          <p>{event.summary}</p>
          <time dateTime={event.at}>{event.at ? new Date(event.at).toLocaleTimeString() : "now"}</time>
        </div>
      )) : <p className="desktop-empty-copy">No agent run has started.</p>}
    </div>
  );
};

const AgentLedger = ({ agentRun }: { agentRun: AgentRun | null }) => (
  agentRun ? (
    <div className="desktop-agent-ledger">
      <span>{agentRun.toolCalls.length} tools</span>
      <span>{agentRun.evidence.length} evidence</span>
      <span>{agentRun.patchDecisions.length} decisions</span>
    </div>
  ) : null
);

const InsightPane = ({
  outline,
  diagnostics,
  mode,
  sidecarStatus,
  sidecarLogTail,
  sidecarOperation,
  sidecarMessage,
  sidecarError,
  postgresStatus,
  postgresLoading,
  postgresError,
  persistState,
  persistDisabledReason,
  agentRun,
  agentMessage,
  onStartSidecar,
  onStopSidecar,
  onRefreshSidecar,
  onLoadSidecarLogs,
  onRefreshPostgres,
  onPersistGraph,
  onProposeQuickFix,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: {
  outline: ChemdOutlineItem[];
  diagnostics: ChemdEditorDiagnostic[];
  mode: DocumentMode;
  sidecarStatus: SidecarStatus;
  sidecarLogTail: string[];
  sidecarOperation: SidecarOperation | null;
  sidecarMessage: string | null;
  sidecarError: string | null;
  postgresStatus: PostgresStatus;
  postgresLoading: boolean;
  postgresError: string | null;
  persistState: PersistState;
  persistDisabledReason: string | null;
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
  onStartSidecar: () => void;
  onStopSidecar: () => void;
  onRefreshSidecar: () => void;
  onLoadSidecarLogs: () => void;
  onRefreshPostgres: () => void;
  onPersistGraph: () => void;
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
}) => {
  const quickFixes = getQuickFixCandidates(diagnostics);
  const activeProposal = getLatestPatchProposal(agentRun);
  const approvedDecision = findPatchDecision(agentRun, activeProposal?.patchProposalId, "approved");
  const rejectedDecision = findPatchDecision(agentRun, activeProposal?.patchProposalId, "rejected");
  const appliedDecision = findPatchDecision(agentRun, activeProposal?.patchProposalId, "applied");

  return (
    <aside className="desktop-pane desktop-insight-pane" aria-label="Outline and agent">
      <PanelHeader eyebrow="Inspect" title="Outline" meta={`${outline.length} roots`} />
      <div className="desktop-insight-section">{outline.length > 0 ? <OutlineTree items={outline} /> : <p className="desktop-empty-copy">No outline from language service.</p>}</div>
      <SidecarControlPanel
        status={sidecarStatus}
        logTail={sidecarLogTail}
        operation={sidecarOperation}
        message={sidecarMessage}
        errorMessage={sidecarError}
        onStart={onStartSidecar}
        onStop={onStopSidecar}
        onRefresh={onRefreshSidecar}
        onLoadLogs={onLoadSidecarLogs}
      />
      <PostgresStatusPanel
        status={postgresStatus}
        loading={postgresLoading}
        errorMessage={postgresError}
        persistState={persistState}
        persistDisabledReason={persistDisabledReason}
        onRefresh={onRefreshPostgres}
        onPersistGraph={onPersistGraph}
      />
      <div className="desktop-agent-panel">
        <AgentRunHeader agentRun={agentRun} agentMessage={agentMessage} />
        <AgentEmptyState mode={mode} hasQuickFixes={quickFixes.length > 0} />
        <AgentQuickFixList mode={mode} quickFixes={quickFixes} onProposeQuickFix={onProposeQuickFix} />
        <AgentPatchProposalCard
          proposal={activeProposal}
          canApprove={activeProposal !== undefined && approvedDecision === undefined && rejectedDecision === undefined && appliedDecision === undefined}
          canApply={activeProposal !== undefined && approvedDecision !== undefined && appliedDecision === undefined && rejectedDecision === undefined}
          canReject={activeProposal !== undefined && rejectedDecision === undefined && appliedDecision === undefined}
          onApprovePatch={onApprovePatch}
          onApplyPatch={onApplyPatch}
          onRejectPatch={onRejectPatch}
        />
        <AgentTimeline agentRun={agentRun} />
        <AgentLedger agentRun={agentRun} />
      </div>
    </aside>
  );
};

const BottomPanel = ({ diagnostics, compileStatus, errorMessage }: { diagnostics: ChemdEditorDiagnostic[]; compileStatus: "ok" | "failed"; errorMessage?: string }) => {
  const stats = {
    errors: diagnostics.filter((item) => item.severity === "error").length,
    warnings: diagnostics.filter((item) => item.severity === "warning").length,
    infos: diagnostics.filter((item) => item.severity === "info").length
  };
  return (
    <section className="desktop-bottom-panel" aria-label="Diagnostics pane">
      <div className="desktop-bottom-tabs">
        <button type="button" className="desktop-bottom-tab" data-active="true"><PanelBottom size={14} />Diagnostics</button>
        <span className="desktop-diagnostic-summary"><AlertTriangle size={14} />{stats.errors} errors / {stats.warnings} warnings / {stats.infos} info</span>
        <span className="desktop-diagnostic-summary">{compileStatus === "ok" ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}{compileStatus}</span>
      </div>
      <div className="desktop-diagnostics-list" role={compileStatus === "failed" ? "alert" : "list"}>
        {errorMessage ? <p className="desktop-diagnostic-row" data-severity="error">{errorMessage}</p> : null}
        {diagnostics.length > 0 ? diagnostics.map((diagnostic) => (
          <div key={`${diagnostic.code}-${diagnostic.range.startLine}-${diagnostic.message}`} className="desktop-diagnostic-row" data-severity={diagnostic.severity}>
            <span>{diagnostic.severity}</span><strong>{diagnostic.code}</strong><span className="desktop-diagnostic-message">{diagnostic.message}</span><span>L{diagnostic.range.startLine}:C{diagnostic.range.startColumn}</span>
          </div>
        )) : <p className="desktop-log-line"><CheckCircle2 size={14} />Language service reports no diagnostics for this buffer.</p>}
      </div>
    </section>
  );
};

const useSidecarController = () => {
  const [status, setStatus] = useState<SidecarStatus>(shellSidecarStatus);
  const [logTail, setLogTail] = useState<string[]>(shellSidecarStatus.logTail);
  const [operation, setOperation] = useState<SidecarOperation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<SidecarOperation | null>(null);

  useEffect(() => {
    void invokeDesktop("read_sidecar_status", undefined)
      .then((nextStatus) => {
        setStatus(nextStatus);
        setLogTail(nextStatus.logTail);
      })
      .catch((nextError: unknown) => {
        setStatus(shellSidecarStatus);
        setError(getSidecarErrorMessage(nextError));
      });
  }, []);

  const commitStatus = (nextStatus: SidecarStatus, nextMessage: string) => {
    setStatus(nextStatus);
    setLogTail(nextStatus.logTail);
    setMessage(nextMessage);
    setError(null);
  };

  const runLifecycleCommand = async (nextOperation: Exclude<SidecarOperation, "logs">) => {
    if (operationRef.current) return;
    operationRef.current = nextOperation;
    setOperation(nextOperation);
    try {
      const command = nextOperation === "start"
        ? "start_sidecar"
        : nextOperation === "stop"
          ? "stop_sidecar"
          : "read_sidecar_status";
      const nextStatus = await invokeDesktop(command, undefined);
      const verb = nextOperation === "start" ? "started" : nextOperation === "stop" ? "stopped" : "refreshed";
      commitStatus(nextStatus, `chem-service ${verb}.`);
    } catch (nextError: unknown) {
      setError(getSidecarErrorMessage(nextError));
      setMessage(null);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  const loadLogs = async () => {
    if (operationRef.current) return;
    operationRef.current = "logs";
    setOperation("logs");
    try {
      const nextLogs = await invokeDesktop("read_sidecar_logs", undefined);
      const nextStatus = await invokeDesktop("read_sidecar_status", undefined);
      setStatus(nextStatus);
      setLogTail(nextLogs.lines);
      setMessage(`Loaded ${nextLogs.lines.length} log lines.`);
      setError(null);
    } catch (nextError: unknown) {
      setError(getSidecarErrorMessage(nextError));
      setMessage(null);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  return {
    status,
    logTail,
    operation,
    message,
    error,
    start: () => void runLifecycleCommand("start"),
    stop: () => void runLifecycleCommand("stop"),
    refresh: () => void runLifecycleCommand("refresh"),
    loadLogs: () => void loadLogs()
  };
};

const usePostgresController = () => {
  const [status, setStatus] = useState<PostgresStatus>(shellPostgresStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const refresh = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const nextStatus = await invokeDesktop("read_postgres_status", undefined);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError: unknown) {
      setStatus(shellPostgresStatus);
      setError(getPostgresErrorMessage(nextError));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    status,
    loading,
    error,
    refresh: () => void refresh()
  };
};

const usePersistRuntimeController = ({
  mode,
  file,
  postgresStatus,
  source,
  workspace,
  compileOutput,
  agentRun
}: PersistControllerInput) => {
  const [state, setState] = useState<PersistState>(initialPersistState);
  const disabledReason = getPersistDisabledReason({
    mode,
    file,
    postgresStatus,
    compileStatus: compileOutput.status
  });

  useEffect(() => {
    setState(initialPersistState);
  }, [mode, file.id]);

  const reset = () => setState(initialPersistState);
  const persist = async () => {
    if (disabledReason !== null || compileOutput.status === "failed") {
      setState({ state: "failure", message: disabledReason ?? "Compile failed.", summary: null });
      return;
    }
    setState({ state: "pending", message: "Persisting Graph/RAG payload to Postgres.", summary: null });
    try {
      const input = buildPersistCommandInput({ source, workspace, file, compileOutput, agentRun });
      const result = await invokeDesktop("persist_runtime_graph_rag", input);
      setState({
        state: "success",
        message: result.detail || "Persisted Graph/RAG payload.",
        summary: { graphSnapshotId: result.graphSnapshotId, counts: result.counts }
      });
    } catch (error: unknown) {
      setState({ state: "failure", message: getPersistErrorMessage(error), summary: null });
    }
  };

  return {
    state,
    disabledReason,
    reset,
    persist: () => void persist()
  };
};

const DesktopWorkbench = ({
  workspace,
  workspaceState,
  sidecarController,
  postgresController,
  persistController,
  output,
  compileError,
  files,
  selectedFile,
  selectedFileId,
  mode,
  message,
  source,
  savedSource,
  rootPath,
  canSave,
  agentRun,
  agentMessage,
  onRootPathChange,
  onSave,
  onOpenWorkspace,
  onSelectFile,
  onSourceChange,
  onProposeQuickFix,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: DesktopWorkbenchProps) => (
  <main className="desktop-shell">
    <TopBar workspace={workspace} workspaceState={workspaceState} sidecarStatus={sidecarController.status} postgresStatus={postgresController.status} diagnosticCount={output.diagnostics.length} dirty={source !== savedSource} rootPath={rootPath} canSave={canSave} onRootPathChange={onRootPathChange} onSave={onSave} onOpenWorkspace={onOpenWorkspace} />
    <div className="desktop-workbench">
      <ActivityRail />
      <Sidebar files={files} selectedFileId={selectedFileId} mode={mode} message={message} onSelectFile={onSelectFile} />
      <div className="desktop-main-grid">
        <EditorPane fileName={selectedFile.name} mode={mode} source={source} lineCount={source.split(/\r?\n/).length} compiledAt={output.compiledAt} onChange={onSourceChange} />
        <InsightPane
          outline={output.outline}
          diagnostics={output.diagnostics}
          mode={mode}
          sidecarStatus={sidecarController.status} sidecarLogTail={sidecarController.logTail} sidecarOperation={sidecarController.operation} sidecarMessage={sidecarController.message} sidecarError={sidecarController.error}
          postgresStatus={postgresController.status} postgresLoading={postgresController.loading} postgresError={postgresController.error}
          persistState={persistController.state}
          persistDisabledReason={persistController.disabledReason}
          agentRun={agentRun}
          agentMessage={agentMessage}
          onStartSidecar={sidecarController.start} onStopSidecar={sidecarController.stop} onRefreshSidecar={sidecarController.refresh} onLoadSidecarLogs={sidecarController.loadLogs}
          onRefreshPostgres={postgresController.refresh}
          onPersistGraph={persistController.persist}
          onProposeQuickFix={onProposeQuickFix}
          onApprovePatch={onApprovePatch}
          onApplyPatch={onApplyPatch}
          onRejectPatch={onRejectPatch}
        />
        <BottomPanel diagnostics={output.diagnostics} compileStatus={output.status} errorMessage={compileError} />
      </div>
    </div>
  </main>
);

export const App = () => {
  const initialSource = sampleSources["suzuki-screen.chemd.md"];
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("empty");
  const [workspace, setWorkspace] = useState<WorkspaceHandle>(shellWorkspace);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(shellFiles);
  const [selectedFileId, setSelectedFileId] = useState(shellFiles[0].id);
  const [source, setSource] = useState(initialSource);
  const [savedSource, setSavedSource] = useState(initialSource);
  const [mode, setMode] = useState<DocumentMode>("sample");
  const [rootPath, setRootPath] = useState("");
  const [message, setMessage] = useState("No workspace is open. Editing bundled sample content.");
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [agentMessage, setAgentMessage] = useState<AgentMessage | null>(null);
  const sidecarController = useSidecarController();
  const postgresController = usePostgresController();

  const selectedFile = files.find((file) => file.id === selectedFileId) ?? shellFiles[0];
  const output = useMemo(() => compileChemdForEditor({
    source,
    documentUri: selectedFile.path,
    options: { strictChemdKind: true }
  }), [selectedFile.path, source]);
  const compileError = output.status === "failed" ? output.error.message : undefined;
  const canSave = mode === "workspace" && selectedFile.kind === "file" && source !== savedSource && workspace.writable;
  const persistController = usePersistRuntimeController({
    mode,
    file: selectedFile,
    postgresStatus: postgresController.status,
    source,
    workspace,
    compileOutput: output,
    agentRun
  });

  useEffect(() => {
    setAgentRun(null);
    setAgentMessage(null);
  }, [mode, selectedFileId]);

  const openWorkspace = async () => {
    setWorkspaceState("opening");
    try {
      const nextWorkspace = await invokeDesktop("open_workspace", { rootPath: rootPath.trim() });
      const nextFiles = await invokeDesktop("list_workspace_files", { workspaceId: nextWorkspace.workspaceId });
      const usableFiles = nextFiles.length > 0 ? nextFiles : shellFiles;
      const firstFile = usableFiles.find((file) => file.kind === "file") ?? usableFiles[0];
      const nextContent = firstFile.kind === "file"
        ? await invokeDesktop("read_workspace_file", {
          workspaceId: nextWorkspace.workspaceId,
          path: firstFile.path
        })
        : undefined;
      const nextSource = nextContent?.content ?? getSampleSource(firstFile);
      setWorkspace(nextWorkspace);
      setFiles(usableFiles);
      setSelectedFileId(firstFile.id);
      setSource(nextSource);
      setSavedSource(nextSource);
      setRootPath(nextWorkspace.rootPath);
      setMode("workspace");
      setMessage(`Opened ${usableFiles.length} visible Markdown entries from the local workspace.`);
      setWorkspaceState("open");
    } catch (error: unknown) {
      setWorkspace(shellWorkspace);
      setFiles(shellFiles);
      setMode("sample");
      setMessage(`Workspace open failed: ${getDisplayableError(error)}. Using bundled sample content.`);
      setWorkspaceState("error");
    }
  };

  const selectFile = async (file: WorkspaceFileEntry) => {
    if (file.kind !== "file") return;
    try {
      const nextContent = mode === "workspace"
        ? await invokeDesktop("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path
        })
        : undefined;
      const nextSource = nextContent?.content ?? getSampleSource(file);
      setSelectedFileId(file.id);
      setSource(nextSource);
      setSavedSource(nextSource);
      setMessage(mode === "sample" ? "Sample document selected from bundled fallback." : `Read ${file.path} from the local workspace.`);
    } catch (error: unknown) {
      setMessage(`Workspace read failed: ${getDisplayableError(error)}.`);
    }
  };

  const saveWorkspaceFile = async () => {
    if (!canSave) return;
    try {
      const result = await invokeDesktop("write_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: selectedFile.path,
        content: source
      });
      setSavedSource(source);
      setMessage(`Saved ${result.path} (${result.bytes} bytes).`);
    } catch (error: unknown) {
      setMessage(`Workspace save failed: ${getDisplayableError(error)}.`);
    }
  };

  const updateEditorSource = (nextSource: string) => {
    setSource(nextSource);
    persistController.reset();
  };

  const startAgentProposal = (candidate: QuickFixCandidate) => {
    if (mode !== "workspace" || selectedFile.kind !== "file") {
      setAgentMessage({
        tone: "warning",
        text: "Open a local workspace file before creating an Agent patch proposal."
      });
      return;
    }

    const result = createAgentProposalRun(candidate, selectedFile, workspace.workspaceId);
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  const approveAgentPatch = () => {
    const result = agentRun ? approveAgentRunPatch(agentRun) : null;
    if (!result) return;
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  const applyAgentPatch = () => {
    const operation = agentRun ? applyAgentRunPatch(agentRun, source) : null;
    if (!operation) return;
    if (operation.nextSource !== undefined) updateEditorSource(operation.nextSource);
    setAgentRun(operation.result.run);
    setAgentMessage(operation.result.message);
  };

  const rejectAgentPatch = () => {
    const result = agentRun ? rejectAgentRunPatch(agentRun) : null;
    if (!result) return;
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  return (
    <DesktopWorkbench
      workspace={workspace} workspaceState={workspaceState}
      sidecarController={sidecarController} postgresController={postgresController} persistController={persistController}
      output={output} compileError={compileError}
      files={files} selectedFile={selectedFile} selectedFileId={selectedFileId}
      mode={mode} message={message} source={source} savedSource={savedSource}
      rootPath={rootPath} canSave={canSave} agentRun={agentRun} agentMessage={agentMessage}
      onRootPathChange={setRootPath} onSourceChange={updateEditorSource}
      onSave={() => void saveWorkspaceFile()} onOpenWorkspace={() => void openWorkspace()}
      onSelectFile={(file) => void selectFile(file)} onProposeQuickFix={startAgentProposal}
      onApprovePatch={approveAgentPatch} onApplyPatch={applyAgentPatch} onRejectPatch={rejectAgentPatch}
    />
  );
};

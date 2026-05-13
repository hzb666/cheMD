import {
  getDesktopAgentToolContract,
  type DesktopAgentConnectivity,
  type DesktopAgentToolAvailabilityContract,
  type DesktopOrchestratedToolName
} from "./contracts";

export interface DesktopAgentToolRuntimeState {
  connectivity: DesktopAgentConnectivity;
  hasWorkspace: boolean;
  hasCurrentFile: boolean;
  hasExplicitApproval: boolean;
}

export interface DesktopAgentToolAvailabilityView
  extends DesktopAgentToolAvailabilityContract {
  blockedReasons: readonly string[];
}

export const resolveDesktopAgentToolAvailability = (
  toolName: DesktopOrchestratedToolName,
  state: DesktopAgentToolRuntimeState
): DesktopAgentToolAvailabilityView => {
  const contract = getDesktopAgentToolContract(toolName);
  const blockedReasons = buildBlockedReasons(contract.toolName, state);

  if (blockedReasons.length > 0) {
    return {
      level: "unavailable",
      summary: blockedReasons.join("; "),
      blockedReasons
    };
  }

  return {
    ...contract.availability[state.connectivity],
    blockedReasons
  };
};

export const summarizeDesktopAgentToolInput = (
  toolName: DesktopOrchestratedToolName,
  input: unknown
): string => {
  const contract = getDesktopAgentToolContract(toolName);
  return summarizeKnownPayload(toolName, input, contract.summaryStrategy.maxInputLength);
};

export const summarizeDesktopAgentToolOutput = (
  toolName: DesktopOrchestratedToolName,
  output: unknown
): string => {
  const contract = getDesktopAgentToolContract(toolName);
  return summarizeKnownPayload(toolName, output, contract.summaryStrategy.maxOutputLength);
};

const buildBlockedReasons = (
  toolName: DesktopOrchestratedToolName,
  state: DesktopAgentToolRuntimeState
): readonly string[] => {
  const contract = getDesktopAgentToolContract(toolName);
  const reasons: string[] = [];

  if (contract.requires.workspace && !state.hasWorkspace) {
    reasons.push("Workspace is required.");
  }
  if (contract.requires.currentFile && !state.hasCurrentFile) {
    reasons.push("Current file is required.");
  }
  if (contract.requires.explicitApproval && !state.hasExplicitApproval) {
    reasons.push("Explicit approval is required.");
  }

  return reasons;
};

const summarizeKnownPayload = (
  toolName: DesktopOrchestratedToolName,
  payload: unknown,
  maxLength: number
): string => {
  const value = asRecord(payload);

  if (value === undefined) return summarizeValue(payload, maxLength);

  switch (toolName) {
    case "compile_current_file":
      return summarizeCompilePayload(value, maxLength);
    case "query_rag":
      return summarizeRagPayload(value, maxLength);
    case "inspect_reaction_graph":
      return summarizeGraphPayload(value, maxLength);
    case "semantic_diff":
      return summarizeDiffPayload(value, maxLength);
    case "propose_repair":
      return summarizeRepairPayload(value, maxLength);
    case "apply_approved_patch":
      return summarizeApplyPatchPayload(value, maxLength);
  }
};

const summarizeCompilePayload = (
  value: Readonly<Record<string, unknown>>,
  maxLength: number
): string =>
  compactSummary([
    field("file", readString(value, "filePath")),
    field("source", readLength(value, "source")),
    field("diagnostics", readCount(value, "diagnostics")),
    field("preview", readString(value, "previewArtifact"))
  ], maxLength);

const summarizeRagPayload = (
  value: Readonly<Record<string, unknown>>,
  maxLength: number
): string =>
  compactSummary([
    field("query", readString(value, "query")),
    field("limit", readNumber(value, "limit")),
    field("hits", readCount(value, "hits")),
    field("citations", readCount(value, "citations")),
    field("sources", readStringList(value, "sources"))
  ], maxLength);

const summarizeGraphPayload = (
  value: Readonly<Record<string, unknown>>,
  maxLength: number
): string =>
  compactSummary([
    field("root", readFirstString(value, ["rootId", "reactionId", "entityId"])),
    field("depth", readNumber(value, "depth")),
    field("nodes", readCount(value, "nodes")),
    field("edges", readCount(value, "edges")),
    field("clusters", readCount(value, "clusters"))
  ], maxLength);

const summarizeDiffPayload = (
  value: Readonly<Record<string, unknown>>,
  maxLength: number
): string =>
  compactSummary([
    field("file", readString(value, "filePath")),
    field("base", readFirstString(value, ["baseRevisionId", "baseLabel"])),
    field("head", readFirstString(value, ["headRevisionId", "headLabel"])),
    field("added", readNumber(value, "added")),
    field("changed", readNumber(value, "changed")),
    field("removed", readNumber(value, "removed"))
  ], maxLength);

const summarizeRepairPayload = (
  value: Readonly<Record<string, unknown>>,
  maxLength: number
): string =>
  compactSummary([
    field("file", readString(value, "filePath")),
    field("goal", readFirstString(value, ["goal", "diagnosticCode"])),
    field("proposal", readString(value, "title")),
    field("edits", readCount(value, "edits")),
    field("evidence", readCount(value, "evidence"))
  ], maxLength);

const summarizeApplyPatchPayload = (
  value: Readonly<Record<string, unknown>>,
  maxLength: number
): string =>
  compactSummary([
    field("proposal", readString(value, "patchProposalId")),
    field("approval", readString(value, "userApprovalId")),
    field("edits", readCount(value, "edits")),
    field("files", readStringList(value, "files")),
    field("revision", readString(value, "revisionId"))
  ], maxLength);

const readFirstString = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): string | undefined => {
  for (const key of keys) {
    const item = readString(value, key);
    if (item !== undefined) return item;
  }

  return undefined;
};

const readString = (
  value: Readonly<Record<string, unknown>>,
  key: string
): string | undefined => typeof value[key] === "string" ? value[key] : undefined;

const readNumber = (
  value: Readonly<Record<string, unknown>>,
  key: string
): number | undefined => typeof value[key] === "number" ? value[key] : undefined;

const readCount = (
  value: Readonly<Record<string, unknown>>,
  key: string
): number | undefined => {
  const item = value[key];
  if (typeof item === "number") return item;
  return Array.isArray(item) ? item.length : undefined;
};

const readLength = (
  value: Readonly<Record<string, unknown>>,
  key: string
): string | undefined => {
  const item = value[key];
  return typeof item === "string" ? `${item.length} chars` : undefined;
};

const readStringList = (
  value: Readonly<Record<string, unknown>>,
  key: string
): string | undefined => {
  const item = value[key];
  if (!Array.isArray(item)) return undefined;
  const labels = item.filter((entry): entry is string => typeof entry === "string");
  return labels.length === 0 ? `${item.length}` : labels.slice(0, 3).join(", ");
};

const field = (label: string, value: string | number | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : `${label}: ${value}`;

const compactSummary = (
  fields: readonly (string | undefined)[],
  maxLength: number
): string => {
  const summary = fields.filter((item): item is string => item !== undefined).join(", ");
  return summary.length === 0 ? "No summary fields." : truncate(summary, maxLength);
};

const summarizeValue = (value: unknown, maxLength: number): string => {
  if (value === undefined) return "none";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return "object";
  return typeof value;
};

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;

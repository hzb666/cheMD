import {
  hasUsableCitation,
  type AgentEvidence,
  type AgentToolCall
} from "@chemd/agent-tools";

export const summarizeToolResult = (
  result: AgentToolCall["result"],
  maxLength: number
): string => {
  if (result === undefined) return "No output yet.";
  if (result.error !== undefined) {
    return truncate(`${result.error.code}: ${result.error.message}`, maxLength);
  }

  return summarizeValue(result.payload, maxLength);
};

export const summarizeValue = (value: unknown, maxLength: number): string => {
  if (value === undefined) return "none";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return truncate(`array(${value.length})`, maxLength);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return summarizeObject(value, maxLength);
  return typeof value;
};

export const buildEvidenceWarningCodes = (
  evidence: readonly AgentEvidence[]
): readonly string[] =>
  evidence.some(isUncitedRagEvidence)
    ? ["rag_evidence_missing_citation"]
    : [];

export const isUncitedRagEvidence = (evidence: AgentEvidence): boolean =>
  evidence.kind === "rag" && !hasUsableCitation(evidence);

export const countCitations = (evidence: readonly AgentEvidence[]): number =>
  evidence.filter(hasUsableCitation).length;

export const calculateDurationMs = (
  startedAt?: string,
  finishedAt?: string
): number | undefined => {
  if (startedAt === undefined || finishedAt === undefined) return undefined;

  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  return Number.isNaN(started) || Number.isNaN(finished) ? undefined : finished - started;
};

const summarizeObject = (value: object, maxLength: number): string => {
  const entries = Object.entries(value)
    .filter((entry) => isSummarizableValue(entry[1]))
    .slice(0, 4)
    .map(([key, item]) => `${key}: ${summarizeNestedValue(item)}`);

  return entries.length === 0 ? "object" : truncate(entries.join(", "), maxLength);
};

const summarizeNestedValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return "object";
  if (value === undefined) return "none";
  return String(value);
};

const isSummarizableValue = (value: unknown): boolean =>
  value !== undefined && typeof value !== "function";

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;

import type {
  AgentEvidenceDeclaration,
  AgentPatchDecision,
  AgentPatchProposalStatus,
  AgentRunStatus,
  AgentToolCallStatus,
  ChemdPatchTarget,
  ChemdReferenceExpr,
  ChemdValue
} from "@chemd/core";

import type { ProgramParserCursor } from "./parser";
import {
  consumeIdentifierPath,
  valueAsReferenceList
} from "./parse-declarations";

export const AGENT_STATUSES = new Set<AgentRunStatus>([
  "planned",
  "running",
  "completed",
  "failed",
  "blocked",
  "cancelled"
]);

export const TOOL_STATUSES = new Set<AgentToolCallStatus>([
  "pending",
  "running",
  "ok",
  "error",
  "skipped"
]);

export const PATCH_STATUSES = new Set<AgentPatchProposalStatus>([
  "proposed",
  "approved",
  "rejected",
  "applied",
  "superseded"
]);

export const DECISIONS = new Set<AgentPatchDecision>([
  "approved",
  "rejected",
  "needs_changes",
  "deferred",
  "superseded"
]);

export const parsePatchTarget = (
  cursor: ProgramParserCursor
): ChemdPatchTarget => {
  const parts = consumeIdentifierPath(cursor);
  if (parts[0] === "meta" && parts[1]) {
    return { kind: "meta_field", field: parts.slice(1).join(".") };
  }
  if (parts[0] === "doc" && parts[1]) {
    return { kind: "doc_comment", docId: parts[1] };
  }
  if (parts.length === 1) {
    return { kind: "declaration", declarationId: parts[0] ?? "unknown" };
  }
  return {
    kind: "declaration_field",
    declarationId: parts[0] ?? "unknown",
    field: parts.slice(1).join(".")
  };
};

export const createEvidence = (
  id: string,
  value: ChemdValue
): AgentEvidenceDeclaration => ({
  kind: "evidence",
  id,
  evidenceKind: "source",
  ...(valueAsReferenceList(value)
    ? { refs: valueAsReferenceList(value) as ChemdReferenceExpr[] }
    : {}),
  sourceSpan: value.sourceSpan
});

export const recordToArgs = (
  value: Extract<ChemdValue, { type: "record" }>
): Record<string, ChemdValue> => {
  const args: Record<string, ChemdValue> = {};
  for (const field of value.fields) {
    args[field.key] = field.value;
  }
  return args;
};

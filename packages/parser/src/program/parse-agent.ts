import type {
  AgentAuditEventDeclaration,
  AgentAuditEventKind,
  AgentEvidenceDeclaration,
  AgentPatchDecision,
  AgentPatchDecisionDeclaration,
  AgentPatchEditDeclaration,
  AgentPatchProposalDeclaration,
  AgentPatchProposalStatus,
  AgentRunDeclaration,
  AgentRunStatus,
  AgentToolCallDeclaration,
  AgentToolCallStatus,
  ChemdDocComment,
  ChemdPatchTarget,
  ChemdReferenceExpr,
  ChemdValue
} from "@chemd/core";

import type { ProgramParserContext, ProgramParserCursor } from "./parser";
import { tokenValue } from "./parser";
import {
  AGENT_STATUSES,
  AUDIT_EVENTS,
  createEvidence,
  DECISIONS,
  parsePatchTarget,
  PATCH_STATUSES,
  recordToArgs,
  TOOL_STATUSES
} from "./parse-agent-helpers";
import {
  consumeIdentifierPath,
  consumeOptionalSeparator,
  parseFieldBlock,
  valueAsReferenceList,
  valueAsString,
  valueAsStringList
} from "./parse-declarations";

export const parseAgentRunDeclaration = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  docs: ChemdDocComment[]
): AgentRunDeclaration => {
  const start = cursor.expectValue("agent", "E_PROGRAM_AGENT_EXPECTED");
  cursor.expectValue("run", "E_PROGRAM_AGENT_RUN_EXPECTED");
  const id = cursor.expectIdentifier("E_PROGRAM_AGENT_RUN_ID_EXPECTED", "agent run id");
  const runId = tokenValue(id) ?? "unknown";
  cursor.expectValue("{", "E_PROGRAM_AGENT_BLOCK_EXPECTED");

  const state: AgentRunBuilder = {
    goal: "",
    status: "",
    targetFiles: undefined,
    toolCalls: [],
    evidence: [],
    patches: [],
    decisions: [],
    auditTimeline: []
  };
  let end = start;
  let closed = false;

  while (!cursor.isAtEnd()) {
    if (tokenValue(cursor.peek()) === "}") {
      end = cursor.consume();
      closed = true;
      break;
    }
    const entryDocs = cursor.collectDocs();
    parseAgentEntry(cursor, context, runId, state, entryDocs);
  }
  if (!closed) {
    cursor.syntaxError("E_PROGRAM_BLOCK_CLOSE_EXPECTED", "Expected '}' to close agent run block.");
  }

  return {
    kind: "agent_run",
    id: runId,
    qualifiedId: `${context.moduleName}.${runId}`,
    goal: state.goal,
    status: state.status as AgentRunStatus,
    ...(state.targetFiles ? { targetFiles: state.targetFiles } : {}),
    toolCalls: state.toolCalls,
    evidence: state.evidence,
    patches: state.patches,
    decisions: state.decisions,
    auditTimeline: state.auditTimeline,
    docs: context.addDocs(docs, { kind: "declaration", declarationId: runId }),
    sourceSpan: cursor.sourceSpanFrom(start, end)
  };
};

interface AgentRunBuilder {
  goal: string;
  status: AgentRunStatus | "";
  targetFiles?: string[];
  toolCalls: AgentToolCallDeclaration[];
  evidence: AgentEvidenceDeclaration[];
  patches: AgentPatchProposalDeclaration[];
  decisions: AgentPatchDecisionDeclaration[];
  auditTimeline: AgentRunDeclaration["auditTimeline"];
}

const parseAgentEntry = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  runId: string,
  state: AgentRunBuilder,
  docs: ChemdDocComment[]
): void => {
  const key = tokenValue(cursor.peek());
  if (key === "tool") {
    state.toolCalls.push(parseToolCall(cursor, context, runId, docs));
  } else if (key === "patch") {
    state.patches.push(parsePatchProposal(cursor, context, runId, docs));
  } else if (key === "decision") {
    state.decisions.push(parseDecision(cursor, context, runId, docs));
  } else if (key === "timeline") {
    state.auditTimeline.push(parseTimelineEvent(cursor, runId));
  } else if (isAgentField(key)) {
    parseAgentField(cursor, state);
  } else {
    cursor.syntaxError("E_PROGRAM_AGENT_ENTRY_EXPECTED", "Expected an agent run entry.", cursor.peek());
    cursor.consume();
  }
};

const parseAgentField = (cursor: ProgramParserCursor, state: AgentRunBuilder): void => {
  const field = tokenValue(cursor.consume());
  cursor.expectValue(":", "E_PROGRAM_FIELD_COLON_EXPECTED");
  const value = cursor.parseValue();
  if (field === "goal") {
    state.goal = valueAsString(value);
  } else if (field === "status" && AGENT_STATUSES.has(valueAsString(value) as AgentRunStatus)) {
    state.status = valueAsString(value) as AgentRunStatus;
  } else if (field === "target_files" || field === "targetFiles") {
    state.targetFiles = valueAsStringList(value);
  } else if (field === "evidence") {
    state.evidence.push(createEvidence(`evidence_${state.evidence.length + 1}`, value));
  }
  consumeOptionalSeparator(cursor);
};

const parseToolCall = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  runId: string,
  docs: ChemdDocComment[]
): AgentToolCallDeclaration => {
  const start = cursor.expectValue("tool", "E_PROGRAM_AGENT_TOOL_EXPECTED");
  const id = cursor.expectIdentifier("E_PROGRAM_AGENT_TOOL_ID_EXPECTED", "tool id");
  const parsed = parseFieldBlock(cursor);
  const status = valueAsString(parsed.fields.status);
  return {
    kind: "tool",
    id: tokenValue(id) ?? "unknown",
    name: tokenValue(id) ?? "unknown",
    status: TOOL_STATUSES.has(status as AgentToolCallStatus) ? (status as AgentToolCallStatus) : "pending",
    ...(parsed.fields.args?.type === "record" ? { args: recordToArgs(parsed.fields.args) } : {}),
    ...(valueAsReferenceList(parsed.fields.evidence) ? { evidence: valueAsReferenceList(parsed.fields.evidence) } : {}),
    ...(parsed.fields.output ? { output: parsed.fields.output } : {}),
    docs: context.addDocs(docs, { kind: "agent_statement", runId, statementId: tokenValue(id) ?? "unknown" }),
    sourceSpan: cursor.sourceSpanFrom(start, parsed.endToken)
  };
};

const parsePatchProposal = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  runId: string,
  docs: ChemdDocComment[]
): AgentPatchProposalDeclaration => {
  const start = cursor.expectValue("patch", "E_PROGRAM_AGENT_PATCH_EXPECTED");
  const id = cursor.expectIdentifier("E_PROGRAM_AGENT_PATCH_ID_EXPECTED", "patch id");
  const patchId = tokenValue(id) ?? "unknown";
  cursor.expectValue("{", "E_PROGRAM_AGENT_PATCH_BLOCK_EXPECTED");
  const fields: Record<string, ChemdValue> = {};
  const edits: AgentPatchEditDeclaration[] = [];
  let end = start;
  let closed = false;

  while (!cursor.isAtEnd()) {
    if (tokenValue(cursor.peek()) === "}") {
      end = cursor.consume();
      closed = true;
      break;
    }
    if (tokenValue(cursor.peek()) === "edit") {
      edits.push(parsePatchEdit(cursor));
    } else {
      const fieldName = cursor.expectIdentifier("E_PROGRAM_FIELD_NAME_EXPECTED", "patch field");
      cursor.expectValue(":", "E_PROGRAM_FIELD_COLON_EXPECTED");
      if (fieldName) {
        fields[tokenValue(fieldName) ?? "unknown"] = cursor.parseValue();
      }
      consumeOptionalSeparator(cursor);
    }
  }
  if (!closed) {
    cursor.syntaxError("E_PROGRAM_BLOCK_CLOSE_EXPECTED", "Expected '}' to close patch block.");
  }

  const explicitStatus = valueAsString(fields.status);
  const status = PATCH_STATUSES.has(explicitStatus as AgentPatchProposalStatus)
    ? explicitStatus
    : PATCH_STATUSES.has(patchId as AgentPatchProposalStatus)
      ? patchId
      : "proposed";

  return {
    kind: "patch",
    id: patchId,
    status: status as AgentPatchProposalStatus,
    ...(fields.title ? { title: valueAsString(fields.title) } : {}),
    ...(fields.rationale ? { rationale: valueAsString(fields.rationale) } : {}),
    edits,
    ...(valueAsReferenceList(fields.evidence) ? { evidence: valueAsReferenceList(fields.evidence) } : {}),
    docs: context.addDocs(docs, { kind: "agent_statement", runId, statementId: patchId }),
    sourceSpan: cursor.sourceSpanFrom(start, end)
  };
};

const parsePatchEdit = (cursor: ProgramParserCursor): AgentPatchEditDeclaration => {
  const start = cursor.expectValue("edit", "E_PROGRAM_AGENT_PATCH_EDIT_EXPECTED");
  const target = parsePatchTarget(cursor);
  cursor.expectValue("=", "E_PROGRAM_AGENT_PATCH_EDIT_ASSIGN_EXPECTED");
  const value = cursor.parseValue();
  consumeOptionalSeparator(cursor);
  return {
    target,
    value,
    sourceSpan: cursor.sourceSpanFrom(start, value.sourceSpan)
  };
};

const parseDecision = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  runId: string,
  docs: ChemdDocComment[]
): AgentPatchDecisionDeclaration => {
  const start = cursor.expectValue("decision", "E_PROGRAM_AGENT_DECISION_EXPECTED");
  const id = cursor.expectIdentifier("E_PROGRAM_AGENT_DECISION_ID_EXPECTED", "decision id");
  const decisionId = tokenValue(id) ?? "unknown";
  const parsed = tokenValue(cursor.peek()) === "{" ? parseFieldBlock(cursor) : undefined;
  const fields = parsed?.fields ?? {};
  const decisionValue = valueAsString(fields.decision) || decisionId;
  const decision = DECISIONS.has(decisionValue as AgentPatchDecision)
    ? (decisionValue as AgentPatchDecision)
    : "deferred";
  context.addDocs(docs, { kind: "agent_statement", runId, statementId: decisionId });
  return {
    kind: "decision",
    id: decisionId,
    decision,
    ...(fields.patch ? { patchId: valueAsString(fields.patch) } : {}),
    ...(fields.rationale ? { rationale: valueAsString(fields.rationale) } : {}),
    ...(fields.decided_by ? { decidedBy: valueAsString(fields.decided_by) } : {}),
    ...(fields.decided_at ? { decidedAt: valueAsString(fields.decided_at) } : {}),
    sourceSpan: cursor.sourceSpanFrom(start, parsed?.endToken ?? id)
  };
};

const parseTimelineEvent = (
  cursor: ProgramParserCursor,
  runId: string
): AgentAuditEventDeclaration => {
  const start = cursor.expectValue("timeline", "E_PROGRAM_AGENT_TIMELINE_EXPECTED");
  const eventToken = cursor.expectIdentifier("E_PROGRAM_AGENT_TIMELINE_EVENT_EXPECTED", "timeline event");
  const eventValue = tokenValue(eventToken) ?? "created";
  const event = AUDIT_EVENTS.has(eventValue as AgentAuditEventKind)
    ? eventValue as AgentAuditEventKind
    : "created";
  const parsed = tokenValue(cursor.peek()) === "{" ? parseFieldBlock(cursor) : undefined;
  const fields = parsed?.fields ?? {};
  return {
    kind: "timeline_event",
    id: `${runId}:${event}:${cursor.sourceSpanFrom(start, parsed?.endToken ?? eventToken).start}`,
    event,
    ...(fields.at ? { at: valueAsString(fields.at) } : {}),
    ...(fields.actor ? { actor: valueAsString(fields.actor) } : {}),
    ...(fields.summary ? { summary: valueAsString(fields.summary) } : {}),
    ...(fields.tool ? { relatedToolCallId: valueAsString(fields.tool) } : {}),
    ...(fields.patch ? { relatedPatchId: valueAsString(fields.patch) } : {}),
    ...(valueAsReferenceList(fields.evidence) ? { evidence: valueAsReferenceList(fields.evidence) } : {}),
    sourceSpan: cursor.sourceSpanFrom(start, parsed?.endToken ?? eventToken)
  };
};

const isAgentField = (key: string | undefined): boolean =>
  key === "goal" ||
  key === "status" ||
  key === "target_files" ||
  key === "targetFiles" ||
  key === "evidence";

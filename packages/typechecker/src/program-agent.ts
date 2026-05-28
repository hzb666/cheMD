import type {
  AgentRunDeclaration,
  ChemdPatchTarget,
  ChemdProgramDocument
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import {
  createProgramDiagnostic,
  type ProgramSymbolTable
} from "./program-utils";

const AGENT_TOOL_NAMES = new Set([
  "compile_current_file",
  "validate_workspace",
  "query_rag",
  "inspect_reaction_graph",
  "semantic_diff",
  "propose_repair",
  "apply_approved_patch"
]);

const TERMINAL_STATUS_EVENTS = new Set([
  "completed",
  "failed",
  "cancelled"
]);

export const validateProgramAgentRuns = (
  program: ChemdProgramDocument,
  symbols: ProgramSymbolTable
): V03Diagnostic[] =>
  program.declarations.flatMap((declaration) =>
    declaration.kind === "agent_run"
      ? validateAgentRun(declaration, program, symbols)
      : []
  );

const validateAgentRun = (
  agent: AgentRunDeclaration,
  program: ChemdProgramDocument,
  symbols: ProgramSymbolTable
): V03Diagnostic[] => [
  ...validateAgentTools(agent),
  ...validateAgentPatches(agent, program, symbols),
  ...validateAgentDecisions(agent),
  ...validateAgentTerminalStatus(agent)
];

const validateAgentTools = (agent: AgentRunDeclaration): V03Diagnostic[] =>
  agent.toolCalls
    .filter((tool) => !AGENT_TOOL_NAMES.has(tool.name))
    .map((tool) => createProgramDiagnostic(
      "E_AGENT_TOOL_UNKNOWN",
      `Unknown agent tool '${tool.name}'.`,
      agent,
      "tool",
      "error",
      { tool: tool.name, toolId: tool.id }
    ));

const validateAgentPatches = (
  agent: AgentRunDeclaration,
  program: ChemdProgramDocument,
  symbols: ProgramSymbolTable
): V03Diagnostic[] =>
  agent.patches.flatMap((patch) =>
    patch.edits
      .filter((edit) => !isPatchTargetResolved(edit.target, program, symbols))
      .map((edit) => createProgramDiagnostic(
        "E_AGENT_PATCH_TARGET_UNRESOLVED",
        "Agent patch edit target does not resolve to program source.",
        agent,
        "patch",
        "error",
        { patchId: patch.id, target: edit.target }
      ))
  );

const isPatchTargetResolved = (
  target: ChemdPatchTarget,
  program: ChemdProgramDocument,
  symbols: ProgramSymbolTable
): boolean => {
  if (target.kind === "meta_field") return isMetaField(target.field, program);
  if (target.kind === "doc_comment") return program.docs.some((doc) => doc.id === target.docId);
  const declaration = symbols.get(target.declarationId);
  if (!declaration) return false;
  if (target.kind === "declaration") return true;
  return "fields" in declaration && target.field in declaration.fields;
};

const isMetaField = (field: string, program: ChemdProgramDocument): boolean =>
  ["id", "title", "date"].includes(field)
  || field in program.meta.fields
  || field.startsWith("primary_");

const validateAgentDecisions = (agent: AgentRunDeclaration): V03Diagnostic[] => {
  const patchIds = new Set(agent.patches.map((patch) => patch.id));
  return agent.decisions
    .filter((decision) => !decision.patchId || !patchIds.has(decision.patchId))
    .map((decision) => createProgramDiagnostic(
      "E_AGENT_PATCH_DECISION_ORPHAN",
      "Agent patch decision must reference an existing patch proposal.",
      agent,
      "decision",
      "error",
      { decisionId: decision.id, patchId: decision.patchId }
    ));
};

const validateAgentTerminalStatus = (agent: AgentRunDeclaration): V03Diagnostic[] => {
  if (!["completed", "failed", "cancelled"].includes(agent.status)) return [];
  if (hasTerminalAuditEvent(agent)) return [];
  return [
    createProgramDiagnostic(
      "E_AGENT_RUN_STATUS_INCOMPLETE",
      "Terminal agent run status requires a matching terminal audit event.",
      agent,
      "status",
      "error",
      { status: agent.status }
    )
  ];
};

const hasTerminalAuditEvent = (agent: AgentRunDeclaration): boolean =>
  agent.auditTimeline.some((event) => TERMINAL_STATUS_EVENTS.has(event.event));

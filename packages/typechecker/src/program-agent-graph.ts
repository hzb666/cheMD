import type { AgentRunDeclaration } from "@chemd/core";

import { sourceForDeclaration } from "./program-utils";
import type { TypedSemanticNode } from "./types";

export const buildAgentRunNode = (
  declaration: AgentRunDeclaration
): TypedSemanticNode => ({
  nodeId: declaration.id,
  kind: "agent_run",
  sourceNodeType: "agent_run",
  sourceMetadata: sourceForDeclaration(declaration),
  declaredKind: "agent_run",
  goal: declaration.goal,
  status: declaration.status,
  targetFiles: declaration.targetFiles ?? [],
  toolCalls: declaration.toolCalls.map((tool) => ({
    id: tool.id,
    name: tool.name,
    status: tool.status
  })),
  patches: declaration.patches.map((patch) => ({
    id: patch.id,
    status: patch.status,
    editCount: patch.edits.length
  })),
  decisions: declaration.decisions.map((decision) => ({
    id: decision.id,
    decision: decision.decision,
    patchId: decision.patchId
  })),
  evidence: declaration.evidence.flatMap((item) =>
    item.refs?.map((ref) => ref.target) ?? []
  )
});

type AgentRunAuditStatus = "completed" | "failed" | "blocked";

export interface RenderAgentRunAuditBlockInput {
  runId: string;
  goal: string;
  targetFiles: string[];
  status: AgentRunAuditStatus;
  diagnosticsSummary: string;
  driverName: string;
}

const quoteString = (value: string): string =>
  JSON.stringify(value);

const renderStringList = (values: string[]): string =>
  `[${values.map(quoteString).join(", ")}]`;

const terminalEventForStatus = (status: AgentRunAuditStatus): "completed" | "failed" =>
  status === "completed" ? "completed" : "failed";

const timelineSummaryForStatus = (status: AgentRunAuditStatus): string => {
  if (status === "completed") {
    return "Compiler-guided repair completed.";
  }

  if (status === "failed") {
    return "Compiler-guided repair failed.";
  }

  return "Compiler-guided repair blocked.";
};

export const renderAgentRunAuditBlock = (input: RenderAgentRunAuditBlockInput): string => {
  const terminalEvent = terminalEventForStatus(input.status);

  return [
    `agent run ${input.runId} {`,
    `  goal: ${quoteString(input.goal)}`,
    `  status: ${input.status}`,
    `  target_files: ${renderStringList(input.targetFiles)}`,
    "",
    "  tool compile_current_file {",
    "    status: ok",
    `    output: { diagnostics: ${quoteString(input.diagnosticsSummary)} }`,
    "  }",
    "",
    "  tool propose_repair {",
    "    status: ok",
    `    output: { driver: ${quoteString(input.driverName)} }`,
    "  }",
    "",
    `  timeline ${terminalEvent} {`,
    "    actor: \"llm-driver\"",
    `    summary: ${quoteString(timelineSummaryForStatus(input.status))}`,
    "    tool: \"propose_repair\"",
    "  }",
    "}"
  ].join("\n");
};

import type { AgentToolName } from "@chemd/agent-tools";

export type OrchestratedToolName = Exclude<AgentToolName, "validate_workspace">;

export type AgentToolCategory =
  | "compile"
  | "rag"
  | "graph"
  | "diff"
  | "repair"
  | "patch";

export type AgentConnectivity = "offline" | "connected";

export type AgentToolAvailabilityLevel =
  | "available"
  | "degraded"
  | "unavailable";

export interface AgentToolAvailabilityContract {
  level: AgentToolAvailabilityLevel;
  summary: string;
}

export interface AgentToolRequirementContract {
  workspace: boolean;
  currentFile: boolean;
  explicitApproval: boolean;
}

export interface AgentToolDisplayContract {
  label: string;
  description: string;
  category: AgentToolCategory;
  resultLabel: string;
}

export interface AgentToolSummaryContract {
  input: string;
  output: string;
  maxInputLength: number;
  maxOutputLength: number;
}

export interface AgentToolContract {
  toolName: OrchestratedToolName;
  display: AgentToolDisplayContract;
  requires: AgentToolRequirementContract;
  availability: Record<
    AgentConnectivity,
    AgentToolAvailabilityContract
  >;
  summaryStrategy: AgentToolSummaryContract;
}

export const AGENT_TOOL_NAMES = [
  "compile_current_file",
  "query_rag",
  "inspect_reaction_graph",
  "semantic_diff",
  "propose_repair",
  "apply_approved_patch"
] as const satisfies readonly OrchestratedToolName[];

const DEFAULT_INPUT_LENGTH = 120;
const DEFAULT_OUTPUT_LENGTH = 160;

export const AGENT_TOOL_CONTRACTS = {
  compile_current_file: {
    toolName: "compile_current_file",
    display: {
      label: "Compile current file",
      description: "Compile the active Chemd document and surface diagnostics.",
      category: "compile",
      resultLabel: "Compile result"
    },
    requires: {
      workspace: false,
      currentFile: true,
      explicitApproval: false
    },
    availability: {
      offline: {
        level: "available",
        summary: "Runs against the local parser and compiler without network access."
      },
      connected: {
        level: "available",
        summary: "Runs locally; connection only enriches persisted evidence."
      }
    },
    summaryStrategy: {
      input: "Show file path plus source size; do not inline full source.",
      output: "Show diagnostic counts, success state, and preview artifact names.",
      maxInputLength: DEFAULT_INPUT_LENGTH,
      maxOutputLength: DEFAULT_OUTPUT_LENGTH
    }
  },
  query_rag: {
    toolName: "query_rag",
    display: {
      label: "Query RAG",
      description: "Search workspace or connected RAG context for cited evidence.",
      category: "rag",
      resultLabel: "RAG evidence"
    },
    requires: {
      workspace: true,
      currentFile: false,
      explicitApproval: false
    },
    availability: {
      offline: {
        level: "degraded",
        summary: "Uses only locally indexed workspace context when present."
      },
      connected: {
        level: "available",
        summary: "Uses connected vector RAG and persisted workspace context."
      }
    },
    summaryStrategy: {
      input: "Show query, limit, and filter keys.",
      output: "Show hit count, citation count, and top source labels.",
      maxInputLength: DEFAULT_INPUT_LENGTH,
      maxOutputLength: DEFAULT_OUTPUT_LENGTH
    }
  },
  inspect_reaction_graph: {
    toolName: "inspect_reaction_graph",
    display: {
      label: "Inspect reaction graph",
      description: "Read graph neighbors, clusters, and reaction relationships.",
      category: "graph",
      resultLabel: "Graph inspection"
    },
    requires: {
      workspace: true,
      currentFile: false,
      explicitApproval: false
    },
    availability: {
      offline: {
        level: "degraded",
        summary: "Available after local graph extraction or bundled graph cache."
      },
      connected: {
        level: "available",
        summary: "Uses persisted graph state plus local graph overlays."
      }
    },
    summaryStrategy: {
      input: "Show root entity, traversal depth, and requested relation filters.",
      output: "Show node count, edge count, cluster count, and highlighted entities.",
      maxInputLength: DEFAULT_INPUT_LENGTH,
      maxOutputLength: DEFAULT_OUTPUT_LENGTH
    }
  },
  semantic_diff: {
    toolName: "semantic_diff",
    display: {
      label: "Semantic diff",
      description: "Compare Chemd revisions with semantic change grouping.",
      category: "diff",
      resultLabel: "Semantic changes"
    },
    requires: {
      workspace: true,
      currentFile: true,
      explicitApproval: false
    },
    availability: {
      offline: {
        level: "available",
        summary: "Compares local revisions or in-memory snapshots."
      },
      connected: {
        level: "available",
        summary: "Can compare persisted revisions and current local state."
      }
    },
    summaryStrategy: {
      input: "Show base/head labels and target file path.",
      output: "Show added, changed, removed, and risk counts.",
      maxInputLength: DEFAULT_INPUT_LENGTH,
      maxOutputLength: DEFAULT_OUTPUT_LENGTH
    }
  },
  propose_repair: {
    toolName: "propose_repair",
    display: {
      label: "Propose repair",
      description: "Prepare a cited patch proposal without mutating files.",
      category: "repair",
      resultLabel: "Patch proposal"
    },
    requires: {
      workspace: true,
      currentFile: true,
      explicitApproval: false
    },
    availability: {
      offline: {
        level: "degraded",
        summary: "Can draft from local diagnostics and graph context only."
      },
      connected: {
        level: "available",
        summary: "Can combine diagnostics, RAG evidence, and graph context."
      }
    },
    summaryStrategy: {
      input: "Show diagnostic or goal summary, target file, and evidence count.",
      output: "Show proposal title, edit count, rationale, and evidence count.",
      maxInputLength: DEFAULT_INPUT_LENGTH,
      maxOutputLength: DEFAULT_OUTPUT_LENGTH
    }
  },
  apply_approved_patch: {
    toolName: "apply_approved_patch",
    display: {
      label: "Apply approved patch",
      description: "Apply a previously approved patch proposal to workspace files.",
      category: "patch",
      resultLabel: "Patch application"
    },
    requires: {
      workspace: true,
      currentFile: false,
      explicitApproval: true
    },
    availability: {
      offline: {
        level: "available",
        summary: "Applies local edits after approval and base-hash validation."
      },
      connected: {
        level: "available",
        summary: "Applies local edits and can persist audit evidence."
      }
    },
    summaryStrategy: {
      input: "Show proposal id, approval id presence, and target edit count.",
      output: "Show applied files, validation status, and resulting revision id.",
      maxInputLength: DEFAULT_INPUT_LENGTH,
      maxOutputLength: DEFAULT_OUTPUT_LENGTH
    }
  }
} as const satisfies Readonly<
  Record<OrchestratedToolName, AgentToolContract>
>;

export const listAgentToolContracts = ():
  readonly AgentToolContract[] =>
  AGENT_TOOL_NAMES.map((toolName) => AGENT_TOOL_CONTRACTS[toolName]);

export const getAgentToolContract = (
  toolName: OrchestratedToolName
): AgentToolContract => AGENT_TOOL_CONTRACTS[toolName];

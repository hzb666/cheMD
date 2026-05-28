import type {
  AgentRunDeclaration,
  ChemdDeclaration,
  ChemdDocComment,
  ChemdProgramDocument,
  ChemdValue
} from "@chemd/core";

export const textValue = (raw: string): ChemdValue => ({
  type: "string",
  raw,
  value: raw
});

export const refValue = (
  raw: string,
  target: string,
  status: "resolved" | "unresolved" = "resolved"
): ChemdValue => ({
  type: "reference",
  refKind: "local",
  raw,
  target,
  resolved: { status }
});

export const declaration = (
  kind: Exclude<ChemdDeclaration["kind"], "procedure" | "observation" | "trace" | "agent_run">,
  id: string,
  fields: Record<string, ChemdValue> = {}
): ChemdDeclaration => ({
  kind,
  id,
  qualifiedId: `lnf.${id}`,
  fields,
  docs: [{ docId: `doc-${id}` }],
  sourceSpan: { startLine: 10, startColumn: 1 }
} as ChemdDeclaration);

const traceDeclaration = (): ChemdDeclaration => ({
  kind: "trace",
  id: "trace-main",
  qualifiedId: "lnf.trace-main",
  fields: { plan: refValue("@proc-main", "proc-main") },
  docs: [],
  sourceSpan: { startLine: 40, startColumn: 1 }
});

const agentDeclaration = (): AgentRunDeclaration => ({
  kind: "agent_run",
  id: "agent-review",
  qualifiedId: "lnf.agent-review",
  docs: [],
  goal: "Review synthesis source.",
  status: "completed",
  targetFiles: ["program.chemd"],
  toolCalls: [{
    kind: "tool",
    id: "tool-1",
    name: "typecheck",
    status: "ok"
  }],
  evidence: [{
    kind: "evidence",
    id: "evidence-1",
    evidenceKind: "test",
    description: "Typecheck completed."
  }],
  patches: [{
    kind: "patch",
    id: "patch-1",
    status: "approved",
    title: "Clarify reaction solvent",
    edits: [{
      target: {
        kind: "declaration_field",
        declarationId: "rxn-main",
        field: "solvent"
      },
      value: textValue("THF")
    }]
  }],
  decisions: [{
    kind: "decision",
    id: "decision-1",
    decision: "approved",
    patchId: "patch-1",
    decidedBy: "operator",
    decidedAt: "2026-05-29T00:00:00.000Z"
  }],
  auditTimeline: [{
    kind: "timeline_event",
    id: "event-1",
    event: "completed",
    summary: "Review complete."
  }]
});

const docs: ChemdDocComment[] = [{
  type: "doc_comment",
  id: "doc-rxn-main",
  markdown: "Main reaction references @mol-a.",
  attachment: { kind: "declaration", declarationId: "rxn-main" },
  references: [{
    type: "reference",
    kind: "object",
    raw: "@mol-a",
    source: "mol-a",
    resolution: { status: "resolved" }
  }],
  inlineChem: [],
  inlineCode: [],
  links: [{
    type: "markdown_link",
    raw: "[paper](https://example.test)",
    label: "paper",
    href: "https://example.test",
    safe: true
  }],
  exportPolicy: "render_rag"
}];

export const createProgram = (
  extraDeclarations: ChemdDeclaration[] = []
): ChemdProgramDocument => ({
  type: "program_document",
  schemaVersion: "chemd-program-ast/v1",
  sourceLanguage: "chemd/program-v1",
  module: {
    kind: "module",
    name: "lnf",
    docs: []
  },
  meta: {
    kind: "meta",
    id: "exp-lnf",
    title: "Program-native LNF test",
    date: "2026-05-29",
    fields: {},
    docs: []
  },
  imports: [],
  declarations: [
    declaration("molecule", "mol-a", { smiles: textValue("CCO") }),
    declaration("material", "mat-a", { molecule: refValue("@mol-a", "mol-a") }),
    declaration("batch", "batch-a", { molecule: refValue("@mol-a", "mol-a") }),
    declaration("reaction", "rxn-main", {
      reactants: refValue("@mol-a", "mol-a"),
      solvent: textValue("THF")
    }),
    declaration("result", "result-main", { reaction: refValue("@rxn-main", "rxn-main") }),
    declaration("analysis", "analysis-main", { ref: refValue("@result-main", "result-main") }),
    declaration("sample", "sample-main", { ref: refValue("@batch-a", "batch-a") }),
    declaration("artifact", "artifact-main", { path: textValue("spectra/main.dx") }),
    declaration("condition_screen", "screen-main", { reaction: refValue("@rxn-main", "rxn-main") }),
    traceDeclaration(),
    agentDeclaration(),
    ...extraDeclarations
  ],
  docs,
  diagnostics: []
});

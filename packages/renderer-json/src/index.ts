import type { ChemdDocument } from "@chemd/core";
import {
  buildProgramRenderDocument,
  formatProgramRenderValue,
  isChemdProgramDocument,
  type ProgramRenderDocument,
  type ProgramRenderSection
} from "@chemd/semantic-rendering";

export * from "./renderable-node";

export const CHEMD_PROGRAM_JSON_SCHEMA_VERSION = "chemd-program-json/v1";

export interface RenderJsonOptions {
  typedGraph?: unknown;
}

type RenderJsonInput = ChemdDocument | ProgramRenderDocument | Parameters<typeof buildProgramRenderDocument>[0];

export const renderJson = (
  document: RenderJsonInput,
  options: RenderJsonOptions = {}
): string => {
  const renderDocument = toProgramRenderDocument(document, options);
  return JSON.stringify(toProgramJsonPayload(renderDocument), null, 2);
};

const toProgramRenderDocument = (
  document: RenderJsonInput,
  options: RenderJsonOptions
): ProgramRenderDocument => {
  if (isProgramRenderDocument(document)) return document;
  if (isChemdProgramDocument(document)) {
    return buildProgramRenderDocument(document, { typedGraph: options.typedGraph });
  }
  return buildLegacyRenderDocument(document, options);
};

const isProgramRenderDocument = (value: unknown): value is ProgramRenderDocument =>
  typeof value === "object"
  && value !== null
  && (value as { schema_version?: unknown }).schema_version === "chemd-program-render/v1";

const buildLegacyRenderDocument = (
  document: ChemdDocument,
  options: RenderJsonOptions
): ProgramRenderDocument => ({
  schema_version: "chemd-program-render/v1",
  sourceLanguage: "chemd/program-v1",
  moduleName: String(document.meta.id || "legacy_document"),
  meta: {
    id: String(document.meta.id || "legacy-document"),
    title: String(document.meta.title || document.meta.id || "Untitled experiment"),
    date: String(document.meta.date || ""),
    fields: {},
    docs: []
  },
  imports: [],
  sections: [],
  diagnostics: document.diagnostics,
  semantic: {
    typedGraph: normalizeTypedGraph(document.meta.id, options.typedGraph)
  }
});

const normalizeTypedGraph = (
  documentId: unknown,
  typedGraph: unknown
): ProgramRenderDocument["semantic"]["typedGraph"] => {
  if (typeof typedGraph === "object" && typedGraph !== null) {
    return typedGraph as ProgramRenderDocument["semantic"]["typedGraph"];
  }
  return {
    documentId: typeof documentId === "string" ? documentId : undefined,
    nodes: [],
    quantities: [],
    diagnostics: []
  };
};

const toProgramJsonPayload = (document: ProgramRenderDocument): Record<string, unknown> => ({
  program: {
    schema_version: CHEMD_PROGRAM_JSON_SCHEMA_VERSION,
    module: {
      name: document.moduleName
    },
    meta: {
      id: document.meta.id,
      title: document.meta.title,
      date: document.meta.date,
      fields: renderValues(document.meta.fields),
      docs: document.meta.docs.map((doc) => doc.id)
    },
    imports: document.imports,
    declarations: declarationsFromSections(document.sections),
    documentation: documentationFromSections(document.sections),
    agent_runs: agentRunsFromSections(document.sections)
  },
  semantic: {
    typedGraph: document.semantic.typedGraph
  },
  diagnostics: document.diagnostics
});

const declarationsFromSections = (
  sections: ProgramRenderSection[]
): Record<string, unknown> =>
  Object.fromEntries(sections.flatMap((section): Array<[string, unknown]> => {
    if (section.kind === "declaration") {
      return [[section.id, {
        kind: section.declarationKind,
        qualified_id: section.qualifiedId,
        docs: section.docs.map((doc) => doc.id),
        fields: renderValues(section.fields)
      }]];
    }
    if (section.kind === "procedure") {
      return [[section.id, {
        kind: "procedure",
        qualified_id: section.qualifiedId,
        target: section.target,
        docs: section.docs.map((doc) => doc.id),
        statements: section.statements
      }]];
    }
    if (section.kind === "trace") {
      return [[section.id, {
        kind: "trace",
        qualified_id: section.qualifiedId,
        docs: section.docs.map((doc) => doc.id),
        fields: renderValues(section.fields)
      }]];
    }
    return [];
  }));

const documentationFromSections = (
  sections: ProgramRenderSection[]
): Record<string, unknown> => {
  const docs = sections.flatMap((section) => {
    if (section.kind === "documentation") return section.docs;
    if ("docs" in section) return section.docs;
    return [];
  });
  return Object.fromEntries(docs.map((doc) => [doc.id, {
    attachment: doc.attachment,
    markdown: doc.markdown,
    references: doc.references,
    export_policy: doc.exportPolicy
  }]));
};

const agentRunsFromSections = (
  sections: ProgramRenderSection[]
): Record<string, unknown> =>
  Object.fromEntries(sections.flatMap((section): Array<[string, unknown]> =>
    section.kind === "agent_run"
      ? [[section.id, {
          qualified_id: section.qualifiedId,
          goal: section.goal,
          status: section.status,
          target_files: section.targetFiles,
          docs: section.docs.map((doc) => doc.id),
          tool_calls: section.toolCalls,
          evidence: section.evidence,
          patches: section.patches,
          decisions: section.decisions,
          audit_timeline: section.auditTimeline,
          statement_docs: section.statementDocs.map((doc) => doc.id)
        }]]
      : []
  ));

const renderValues = (
  fields: Record<string, Parameters<typeof formatProgramRenderValue>[0]>
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    {
      ...value,
      text: formatProgramRenderValue(value)
    }
  ]));

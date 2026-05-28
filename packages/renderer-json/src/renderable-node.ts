import type { ChemdDocument, SourceSpan } from "@chemd/core";
import {
  buildProgramRenderDocument,
  isChemdProgramDocument,
  type ProgramRenderDocument,
  type ProgramRenderProcedureStatement,
  type ProgramRenderSection
} from "@chemd/semantic-rendering";

export const CHEMD_RENDERABLE_NODE_SCHEMA_VERSION = "chemd.renderable-node.v1";

export type ChemdRenderableNodeKindV1 =
  | "document"
  | "markdown"
  | "col"
  | "template"
  | "molecule"
  | "reaction"
  | "analysis"
  | "documentation"
  | "declaration"
  | "procedure"
  | "procedure_step"
  | "procedure_control"
  | "procedure_doc"
  | "agent_run"
  | "trace";
export type ChemdHydrationTargetV1 = "molecule" | "reaction" | "analysis";

export interface BuildRenderableNodeTreeOptions {
  includeSourceRefs?: boolean;
  sourceId?: string;
  typedGraph?: unknown;
}

export interface ChemdSourceRefV1 {
  sourceId?: string;
  field?: string;
  range: SourceSpan;
}

export type ChemdRenderDirectiveV1 =
  | { kind: "document"; display: "flow" }
  | { kind: "text"; text: string }
  | { kind: "layout"; display: "columns"; columns: number }
  | { kind: "template"; template: string; expansion: "nested-body"; params: string[] }
  | {
      kind: "hydrate";
      target: ChemdHydrationTargetV1;
      hydration: { mode: "lazy"; key: string; status: "ready" };
      payload: Record<string, unknown>;
      fallback: "placeholder";
    }
  | {
      kind: "placeholder";
      target: ChemdHydrationTargetV1;
      hydration: { mode: "lazy"; key: string; status: "placeholder" };
      reason: "missing_render_payload";
      text: string;
    }
  | { kind: "semantic"; target: string; payload: Record<string, unknown> };

export interface ChemdRenderableNodeV1 {
  nodeId: string;
  kind: ChemdRenderableNodeKindV1;
  label: string;
  range?: SourceSpan;
  sourceRefs?: ChemdSourceRefV1[];
  directive: ChemdRenderDirectiveV1;
  children: ChemdRenderableNodeV1[];
}

export interface ChemdRenderableNodeTreeV1 {
  schemaVersion: typeof CHEMD_RENDERABLE_NODE_SCHEMA_VERSION;
  root: ChemdRenderableNodeV1;
}

interface BuildContext {
  includeSourceRefs: boolean;
  sourceId?: string;
}

type RenderableInput =
  | ChemdDocument
  | ProgramRenderDocument
  | Parameters<typeof buildProgramRenderDocument>[0];

const HEAVY_SECTION_KINDS = new Set<ChemdHydrationTargetV1>(["molecule", "reaction", "analysis"]);

export const buildRenderableNodeTree = (
  document: RenderableInput,
  options: BuildRenderableNodeTreeOptions = {}
): ChemdRenderableNodeTreeV1 => {
  const renderDocument = toProgramRenderDocument(document, options);
  const context: BuildContext = {
    includeSourceRefs: options.includeSourceRefs ?? true,
    sourceId: options.sourceId ?? renderDocument.meta.id
  };

  return {
    schemaVersion: CHEMD_RENDERABLE_NODE_SCHEMA_VERSION,
    root: {
      nodeId: "document",
      kind: "document",
      label: renderDocument.meta.title || renderDocument.meta.id || "Chemd document",
      directive: { kind: "document", display: "flow" },
      children: renderDocument.sections.map((section, index) =>
        buildSectionNode(section, [pathSegment(index, section.kind, section.id)], context)
      )
    }
  };
};

const toProgramRenderDocument = (
  document: RenderableInput,
  options: BuildRenderableNodeTreeOptions
): ProgramRenderDocument => {
  if (isProgramRenderDocument(document)) return document;
  if (isChemdProgramDocument(document)) {
    return buildProgramRenderDocument(document, { typedGraph: options.typedGraph });
  }
  return buildLegacyRenderDocument(document);
};

const isProgramRenderDocument = (value: unknown): value is ProgramRenderDocument =>
  typeof value === "object"
  && value !== null
  && (value as { schema_version?: unknown }).schema_version === "chemd-program-render/v1";

const buildLegacyRenderDocument = (document: ChemdDocument): ProgramRenderDocument => ({
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
    typedGraph: {
      documentId: document.meta.id,
      nodes: [],
      quantities: [],
      diagnostics: []
    }
  }
});

const buildSectionNode = (
  section: ProgramRenderSection,
  path: string[],
  context: BuildContext
): ChemdRenderableNodeV1 => {
  if (section.kind === "documentation") {
    return buildSemanticNode({
      kind: "documentation",
      id: section.id,
      label: section.title,
      payload: { docs: section.docs.map((doc) => doc.id) },
      children: section.docs.map((doc, index) =>
        buildTextNode(
          `doc:${doc.id}`,
          firstTextLine(doc.markdown) ?? doc.id,
          doc.markdown,
          [...path, pathSegment(index, "documentation", doc.id)],
          context,
          doc.sourceSpan
        )
      )
    }, path, context);
  }

  if (section.kind === "procedure") {
    return buildSemanticNode({
      kind: "procedure",
      id: section.id,
      label: section.id,
      payload: {
        qualified_id: section.qualifiedId,
        target: section.target,
        evidence: section.evidence,
        docs: section.docs.map((doc) => doc.id)
      },
      children: section.statements.map((statement, index) =>
        buildProcedureStatementNode(statement, [...path, pathSegment(index, statement.kind)], context)
      )
    }, path, context);
  }

  if (section.kind === "agent_run") {
    return buildSemanticNode({
      kind: "agent_run",
      id: section.id,
      label: section.id,
      payload: {
        qualified_id: section.qualifiedId,
        goal: section.goal,
        status: section.status,
        target_files: section.targetFiles,
        docs: section.docs.map((doc) => doc.id),
        tool_calls: section.toolCalls,
        evidence: section.evidence,
        patches: section.patches,
        decisions: section.decisions,
        audit_timeline: section.auditTimeline
      },
      children: []
    }, path, context);
  }

  if (section.kind === "trace") {
    return buildSemanticNode({
      kind: "trace",
      id: section.id,
      label: section.id,
      payload: {
        qualified_id: section.qualifiedId,
        docs: section.docs.map((doc) => doc.id),
        fields: section.fields
      },
      children: []
    }, path, context);
  }

  const payload = {
    qualified_id: section.qualifiedId,
    kind: section.declarationKind,
    docs: section.docs.map((doc) => doc.id),
    fields: section.fields
  };

  return HEAVY_SECTION_KINDS.has(section.declarationKind as ChemdHydrationTargetV1)
    ? buildHydrationNode(section.id, section.declarationKind as ChemdHydrationTargetV1, payload, path, context)
    : buildSemanticNode({
        kind: "declaration",
        id: section.id,
        label: section.id,
        payload,
        children: []
      }, path, context);
};

const buildProcedureStatementNode = (
  statement: ProgramRenderProcedureStatement,
  path: string[],
  context: BuildContext
): ChemdRenderableNodeV1 => {
  if (statement.kind === "doc") {
    return buildTextNode(
      `doc:${statement.doc.id}`,
      firstTextLine(statement.doc.markdown) ?? statement.doc.id,
      statement.doc.markdown,
      path,
      context,
      statement.doc.sourceSpan
    );
  }

  if (statement.kind === "control") {
    return buildSemanticNode({
      kind: "procedure_control",
      id: statement.id ?? path.at(-1) ?? "control",
      label: statement.controlKind,
      payload: { control_kind: statement.controlKind, args: statement.args },
      children: statement.children.map((child, index) =>
        buildProcedureStatementNode(child, [...path, pathSegment(index, child.kind)], context)
      )
    }, path, context);
  }

  return buildSemanticNode({
    kind: "procedure_step",
    id: statement.id,
    label: `${statement.family} ${statement.id}`,
    payload: {
      family: statement.family,
      args: statement.args,
      inputs: statement.inputs,
      outputs: statement.outputs,
      depends_on: statement.dependsOn,
      evidence: statement.evidence,
      docs: statement.docs.map((doc) => doc.id)
    },
    children: []
  }, path, context);
};

const buildHydrationNode = (
  id: string,
  target: ChemdHydrationTargetV1,
  payload: Record<string, unknown>,
  path: string[],
  context: BuildContext
): ChemdRenderableNodeV1 => {
  const nodeId = buildNodeId(path, id);
  return {
    nodeId,
    kind: "declaration",
    label: id,
    ...sourceRefs(undefined, context),
    directive: {
      kind: "hydrate",
      target,
      hydration: { mode: "lazy", key: nodeId, status: "ready" },
      payload,
      fallback: "placeholder"
    },
    children: []
  };
};

const buildSemanticNode = (
  input: {
    kind: ChemdRenderableNodeKindV1;
    id: string;
    label: string;
    payload: Record<string, unknown>;
    children: ChemdRenderableNodeV1[];
  },
  path: string[],
  context: BuildContext
): ChemdRenderableNodeV1 => ({
  nodeId: buildNodeId(path, input.id),
  kind: input.kind,
  label: input.label,
  ...sourceRefs(undefined, context),
  directive: { kind: "semantic", target: input.kind, payload: input.payload },
  children: input.children
});

const buildTextNode = (
  id: string,
  label: string,
  text: string,
  path: string[],
  context: BuildContext,
  range?: SourceSpan
): ChemdRenderableNodeV1 => ({
  nodeId: buildNodeId(path, id),
  kind: "documentation",
  label,
  ...sourceRefs(range, context),
  directive: { kind: "text", text },
  children: []
});

const sourceRefs = (
  range: SourceSpan | undefined,
  context: BuildContext
): { range?: SourceSpan; sourceRefs?: ChemdSourceRefV1[] } => {
  if (!context.includeSourceRefs || !range) {
    return {};
  }
  return {
    range,
    sourceRefs: [{ ...(context.sourceId ? { sourceId: context.sourceId } : {}), range }]
  };
};

const firstTextLine = (value: string): string | undefined =>
  value.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);

const buildNodeId = (path: string[], id: string): string =>
  `document.${path.join(".")}${id ? `.${normalizeIdPart(id)}` : ""}`;

const pathSegment = (index: number, kind: string, id?: string): string =>
  `${String(index + 1).padStart(2, "0")}_${normalizeIdPart(id ?? kind)}`;

const normalizeIdPart = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "node";

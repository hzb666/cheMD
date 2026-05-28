import type {
  AgentRunDeclaration,
  ChemdDeclaration,
  ChemdDocComment,
  ChemdDocCommentAttachment,
  ChemdDocCommentRef,
  ChemdImportDeclaration,
  ChemdMetaDeclaration,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  ChemdValue,
  Diagnostic,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement,
  ProcedureStepDeclaration,
  SourceSpan
} from "@chemd/core";

export const CHEMD_PROGRAM_RENDER_SCHEMA_VERSION = "chemd-program-render/v1";

export interface ProgramRenderDocument {
  schema_version: typeof CHEMD_PROGRAM_RENDER_SCHEMA_VERSION;
  sourceLanguage: ChemdProgramDocument["sourceLanguage"];
  moduleName: string;
  meta: RenderMeta;
  imports: RenderImport[];
  sections: ProgramRenderSection[];
  diagnostics: ProgramRenderDiagnostic[];
  semantic: {
    typedGraph: ProgramRenderTypedGraph;
  };
}

export interface ProgramRenderTypedGraph {
  documentId?: string;
  nodes: ProgramRenderTypedNode[];
  quantities: unknown[];
  diagnostics: ProgramRenderDiagnostic[];
  [key: string]: unknown;
}

export interface ProgramRenderTypedNode {
  nodeId: string;
  kind: string;
  [key: string]: unknown;
}

export interface RenderMeta {
  id: string;
  title: string;
  date: string;
  fields: Record<string, ProgramRenderValue>;
  primary?: ChemdMetaDeclaration["primary"];
  docs: RenderDocumentationBlock[];
}

export interface RenderImport {
  moduleName: string;
  from: string;
  alias?: string;
  docs: RenderDocumentationBlock[];
}

export type ProgramRenderSection =
  | RenderDocumentationSection
  | RenderDeclarationSection
  | RenderProcedureSection
  | RenderAgentRunSection
  | RenderTraceSection;

export interface RenderDocumentationBlock {
  id: string;
  markdown: string;
  attachment: ChemdDocCommentAttachment;
  references: string[];
  exportPolicy: ChemdDocComment["exportPolicy"];
  sourceSpan?: SourceSpan;
}

export interface RenderDocumentationSection {
  kind: "documentation";
  id: string;
  title: string;
  docs: RenderDocumentationBlock[];
}

export interface RenderDeclarationSection {
  kind: "declaration";
  declarationKind: Exclude<ChemdDeclaration["kind"], "procedure" | "agent_run" | "trace">;
  id: string;
  qualifiedId: string;
  docs: RenderDocumentationBlock[];
  fieldDocs: Record<string, RenderDocumentationBlock[]>;
  fields: Record<string, ProgramRenderValue>;
  typedNode?: ProgramRenderTypedNode;
}

export interface RenderProcedureSection {
  kind: "procedure";
  id: string;
  qualifiedId: string;
  target?: ProgramRenderReference;
  evidence: ProgramRenderReference[];
  docs: RenderDocumentationBlock[];
  statements: ProgramRenderProcedureStatement[];
}

export type ProgramRenderProcedureStatement =
  | ProgramRenderProcedureStep
  | ProgramRenderProcedureControl
  | ProgramRenderProcedureDoc;

export interface ProgramRenderProcedureStep {
  kind: "step";
  id: string;
  family: string;
  args: Record<string, ProgramRenderValue>;
  inputs: ProgramRenderReference[];
  outputs: ProgramRenderReference[];
  dependsOn: string[];
  evidence: ProgramRenderReference[];
  docs: RenderDocumentationBlock[];
  typedNode?: ProgramRenderTypedNode;
}

export interface ProgramRenderProcedureControl {
  kind: "control";
  id?: string;
  controlKind: ProcedureControlDeclaration["controlKind"];
  args: Record<string, ProgramRenderValue>;
  children: ProgramRenderProcedureStatement[];
  docs: RenderDocumentationBlock[];
}

export interface ProgramRenderProcedureDoc {
  kind: "doc";
  doc: RenderDocumentationBlock;
}

export interface RenderAgentRunSection {
  kind: "agent_run";
  id: string;
  qualifiedId: string;
  goal: string;
  status: AgentRunDeclaration["status"];
  targetFiles: string[];
  docs: RenderDocumentationBlock[];
  toolCalls: AgentRunDeclaration["toolCalls"];
  evidence: AgentRunDeclaration["evidence"];
  patches: AgentRunDeclaration["patches"];
  decisions: AgentRunDeclaration["decisions"];
  auditTimeline: AgentRunDeclaration["auditTimeline"];
  statementDocs: RenderDocumentationBlock[];
  typedNode?: ProgramRenderTypedNode;
}

export interface RenderTraceSection {
  kind: "trace";
  id: string;
  qualifiedId: string;
  docs: RenderDocumentationBlock[];
  fields: Record<string, ProgramRenderValue>;
  typedNode?: ProgramRenderTypedNode;
}

export interface ProgramRenderDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  nodeId?: string;
  sourceNodeId?: string;
  sourceField?: string;
  facts?: Record<string, unknown>;
}

export interface ProgramRenderReference {
  raw: string;
  refKind: ChemdReferenceExpr["refKind"];
  target: string;
  field?: string;
  moduleName?: string;
  externalDocumentId?: string;
  resolved?: unknown;
}

export type ProgramRenderValue =
  | { type: "string"; raw: string; value: string }
  | { type: "identifier"; raw: string; name: string }
  | { type: "boolean"; raw: string; value: boolean }
  | { type: "number"; raw: string; value?: number }
  | { type: "quantity"; raw: string; value?: number; unit: string; quantityClass?: string }
  | { type: "percent"; raw: string; value?: number }
  | ({ type: "reference" } & ProgramRenderReference)
  | { type: "list"; raw: string; items: ProgramRenderValue[] }
  | { type: "record"; raw: string; fields: Record<string, ProgramRenderValue> }
  | { type: "call"; raw: string; callee: string; args: Record<string, ProgramRenderValue> }
  | { type: "patch"; raw: string; target: unknown; value: ProgramRenderValue };

export interface BuildProgramRenderDocumentOptions {
  typedGraph?: unknown;
}

type FieldDeclaration = Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>;
type DocumentationIndex = Map<string, ChemdDocComment>;
type TypedNodeIndex = Map<string, ProgramRenderTypedNode>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isChemdProgramDocument = (value: unknown): value is ChemdProgramDocument =>
  isRecord(value) && value.type === "program_document" && Array.isArray(value.declarations);

const normalizeDiagnostic = (diagnostic: unknown): ProgramRenderDiagnostic => {
  if (isRecord(diagnostic)) {
    return {
      code: typeof diagnostic.code === "string" ? diagnostic.code : "unknown",
      severity: diagnostic.severity === "info" || diagnostic.severity === "warning" || diagnostic.severity === "error"
        ? diagnostic.severity
        : "error",
      message: typeof diagnostic.message === "string" ? diagnostic.message : String(diagnostic.code ?? "Unknown diagnostic"),
      nodeId: typeof diagnostic.nodeId === "string" ? diagnostic.nodeId : undefined,
      sourceNodeId: typeof diagnostic.sourceNodeId === "string" ? diagnostic.sourceNodeId : undefined,
      sourceField: typeof diagnostic.sourceField === "string" ? diagnostic.sourceField : undefined,
      facts: isRecord(diagnostic.facts) ? diagnostic.facts : undefined
    };
  }
  return { code: "unknown", severity: "error", message: String(diagnostic) };
};

const normalizeTypedGraph = (
  program: ChemdProgramDocument,
  typedGraph: unknown
): ProgramRenderTypedGraph => {
  if (!isRecord(typedGraph)) {
    return { documentId: program.meta.id, nodes: [], quantities: [], diagnostics: [] };
  }

  return {
    ...typedGraph,
    documentId: typeof typedGraph.documentId === "string" ? typedGraph.documentId : program.meta.id,
    nodes: Array.isArray(typedGraph.nodes) ? typedGraph.nodes.filter(isTypedNode) : [],
    quantities: Array.isArray(typedGraph.quantities) ? typedGraph.quantities : [],
    diagnostics: Array.isArray(typedGraph.diagnostics)
      ? typedGraph.diagnostics.map(normalizeDiagnostic)
      : []
  };
};

const isTypedNode = (node: unknown): node is ProgramRenderTypedNode =>
  isRecord(node) && typeof node.nodeId === "string" && typeof node.kind === "string";

const referenceToRender = (reference: ChemdReferenceExpr): ProgramRenderReference => ({
  raw: reference.raw,
  refKind: reference.refKind,
  target: reference.target,
  field: "field" in reference ? reference.field : undefined,
  moduleName: "moduleName" in reference ? reference.moduleName : undefined,
  externalDocumentId: "externalDocumentId" in reference ? reference.externalDocumentId : undefined,
  resolved: reference.resolved
});

export const valueToProgramRenderValue = (value: ChemdValue): ProgramRenderValue => {
  switch (value.type) {
    case "string": return { type: "string", raw: value.raw, value: value.value };
    case "identifier": return { type: "identifier", raw: value.raw, name: value.name };
    case "boolean": return { type: "boolean", raw: value.raw, value: value.value };
    case "number": return { type: "number", raw: value.raw, value: value.value };
    case "quantity": return { type: "quantity", raw: value.raw, value: value.value, unit: value.unit, quantityClass: value.quantityClass };
    case "percent": return { type: "percent", raw: value.raw, value: value.value };
    case "reference": return { type: "reference", ...referenceToRender(value) };
    case "list": return { type: "list", raw: value.raw, items: value.items.map(valueToProgramRenderValue) };
    case "record": return { type: "record", raw: value.raw, fields: mapRecordFields(value.fields) };
    case "call": return { type: "call", raw: value.raw, callee: value.callee, args: mapCallArgs(value.args) };
    case "patch": return { type: "patch", raw: value.raw, target: value.target, value: valueToProgramRenderValue(value.value) };
  }
};

const mapRecordFields = (
  fields: Array<{ key: string; value: ChemdValue }>
): Record<string, ProgramRenderValue> =>
  Object.fromEntries(fields.map((field) => [field.key, valueToProgramRenderValue(field.value)]));

const mapCallArgs = (
  args: Array<{ name: string; value: ChemdValue }>
): Record<string, ProgramRenderValue> =>
  Object.fromEntries(args.map((arg) => [arg.name, valueToProgramRenderValue(arg.value)]));

export const formatProgramRenderValue = (value: ProgramRenderValue): string => {
  switch (value.type) {
    case "string": return value.value;
    case "identifier": return value.name;
    case "boolean": return String(value.value);
    case "number": return value.value === undefined ? value.raw : String(value.value);
    case "quantity": return value.raw || [value.value, value.unit].filter(Boolean).join(" ");
    case "percent": return value.raw || (value.value === undefined ? "" : `${value.value}%`);
    case "reference": return value.raw || `@${value.target}`;
    case "list": return value.items.map(formatProgramRenderValue).join(", ");
    case "record": return Object.entries(value.fields).map(([key, item]) => `${key}: ${formatProgramRenderValue(item)}`).join("; ");
    case "call": return `${value.callee}(${Object.entries(value.args).map(([key, item]) => `${key}: ${formatProgramRenderValue(item)}`).join(", ")})`;
    case "patch": return `${String(isRecord(value.target) ? value.target.kind : "target")} = ${formatProgramRenderValue(value.value)}`;
  }
};

const mapFields = (fields: Record<string, ChemdValue>): Record<string, ProgramRenderValue> =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, valueToProgramRenderValue(value)]));

const renderDoc = (doc: ChemdDocComment): RenderDocumentationBlock => ({
  id: doc.id,
  markdown: doc.markdown,
  attachment: doc.attachment,
  references: doc.references.map((reference) => reference.raw),
  exportPolicy: doc.exportPolicy,
  sourceSpan: doc.sourceSpan
});

const docsFromRefs = (
  refs: ChemdDocCommentRef[] | undefined,
  index: DocumentationIndex
): RenderDocumentationBlock[] =>
  (refs ?? []).flatMap((ref) => {
    const doc = index.get(ref.docId);
    return doc ? [renderDoc(doc)] : [];
  });

const docsForAttachment = (
  docs: ChemdDocComment[],
  predicate: (attachment: ChemdDocCommentAttachment) => boolean
): RenderDocumentationBlock[] =>
  docs.filter((doc) => predicate(doc.attachment)).map(renderDoc);

const uniqueDocs = (docs: RenderDocumentationBlock[]): RenderDocumentationBlock[] => {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });
};

const docsForDeclaration = (
  declaration: ChemdDeclaration,
  docs: ChemdDocComment[],
  index: DocumentationIndex
): RenderDocumentationBlock[] =>
  uniqueDocs([
    ...docsFromRefs(declaration.docs, index),
    ...docsForAttachment(docs, (attachment) =>
      attachment.kind === "declaration" && attachment.declarationId === declaration.id
    )
  ]);

const fieldDocsForDeclaration = (
  declarationId: string,
  docs: ChemdDocComment[]
): Record<string, RenderDocumentationBlock[]> => {
  const entries = docs
    .filter((doc) => doc.attachment.kind === "field" && doc.attachment.declarationId === declarationId)
    .map((doc) => [doc.attachment.kind === "field" ? doc.attachment.fieldName : "", renderDoc(doc)] as const);
  return entries.reduce<Record<string, RenderDocumentationBlock[]>>((acc, [field, doc]) => ({
    ...acc,
    [field]: [...(acc[field] ?? []), doc]
  }), {});
};

const referencesToRender = (references: ChemdReferenceExpr[] | undefined): ProgramRenderReference[] =>
  (references ?? []).map(referenceToRender);

const mapProcedureStatement = (
  statement: ProcedureStatement,
  docs: ChemdDocComment[],
  index: DocumentationIndex,
  typedNodes: TypedNodeIndex
): ProgramRenderProcedureStatement => {
  if (statement.kind === "step") return mapProcedureStep(statement, docs, index, typedNodes);
  if (statement.kind === "control") return mapProcedureControl(statement, docs, index, typedNodes);
  return { kind: "doc", doc: docsFromRefs([statement.doc], index)[0] ?? renderMissingDoc(statement.doc.docId) };
};

const mapProcedureStep = (
  step: ProcedureStepDeclaration,
  docs: ChemdDocComment[],
  index: DocumentationIndex,
  typedNodes: TypedNodeIndex
): ProgramRenderProcedureStep => ({
  kind: "step",
  id: step.id,
  family: step.family,
  args: mapFields(step.args),
  inputs: referencesToRender(step.inputs),
  outputs: referencesToRender(step.outputs),
  dependsOn: step.dependsOn ?? [],
  evidence: referencesToRender(step.evidence),
  docs: uniqueDocs([
    ...docsFromRefs(step.docs, index),
    ...docsForAttachment(docs, (attachment) =>
      attachment.kind === "procedure_step" && attachment.stepId === step.id
    )
  ]),
  typedNode: typedNodes.get(step.id)
});

const mapProcedureControl = (
  control: ProcedureControlDeclaration,
  docs: ChemdDocComment[],
  index: DocumentationIndex,
  typedNodes: TypedNodeIndex
): ProgramRenderProcedureControl => ({
  kind: "control",
  id: control.id,
  controlKind: control.controlKind,
  args: mapFields(control.args),
  children: control.children.map((child) => mapProcedureStatement(child, docs, index, typedNodes)),
  docs: docsFromRefs(control.docs, index)
});

const renderMissingDoc = (docId: string): RenderDocumentationBlock => ({
  id: docId,
  markdown: "",
  attachment: { kind: "file" },
  references: [],
  exportPolicy: "render_only"
});

const buildProcedureSection = (
  declaration: ProcedureDeclaration,
  docs: ChemdDocComment[],
  index: DocumentationIndex,
  typedNodes: TypedNodeIndex
): RenderProcedureSection => ({
  kind: "procedure",
  id: declaration.id,
  qualifiedId: declaration.qualifiedId,
  target: declaration.target ? referenceToRender(declaration.target) : undefined,
  evidence: referencesToRender(declaration.evidence),
  docs: docsForDeclaration(declaration, docs, index),
  statements: declaration.children.map((child) => mapProcedureStatement(child, docs, index, typedNodes))
});

const buildAgentRunSection = (
  declaration: AgentRunDeclaration,
  docs: ChemdDocComment[],
  index: DocumentationIndex,
  typedNodes: TypedNodeIndex
): RenderAgentRunSection => ({
  kind: "agent_run",
  id: declaration.id,
  qualifiedId: declaration.qualifiedId,
  goal: declaration.goal,
  status: declaration.status,
  targetFiles: declaration.targetFiles ?? [],
  docs: docsForDeclaration(declaration, docs, index),
  toolCalls: declaration.toolCalls,
  evidence: declaration.evidence,
  patches: declaration.patches,
  decisions: declaration.decisions,
  auditTimeline: declaration.auditTimeline,
  statementDocs: docsForAttachment(docs, (attachment) =>
    attachment.kind === "agent_statement" && attachment.runId === declaration.id
  ),
  typedNode: typedNodes.get(declaration.id)
});

const buildFieldDeclarationSection = (
  declaration: FieldDeclaration,
  docs: ChemdDocComment[],
  index: DocumentationIndex,
  typedNodes: TypedNodeIndex
): RenderDeclarationSection | RenderTraceSection => {
  const base = {
    id: declaration.id,
    qualifiedId: declaration.qualifiedId,
    docs: docsForDeclaration(declaration, docs, index),
    fields: mapFields(declaration.fields),
    typedNode: typedNodes.get(declaration.id)
  };
  return declaration.kind === "trace"
    ? { kind: "trace", ...base }
    : {
        kind: "declaration",
        declarationKind: declaration.kind,
        fieldDocs: fieldDocsForDeclaration(declaration.id, docs),
        ...base
      };
};

const buildDeclarationSection = (
  declaration: ChemdDeclaration,
  docs: ChemdDocComment[],
  index: DocumentationIndex,
  typedNodes: TypedNodeIndex
): ProgramRenderSection => {
  if (declaration.kind === "procedure") return buildProcedureSection(declaration, docs, index, typedNodes);
  if (declaration.kind === "agent_run") return buildAgentRunSection(declaration, docs, index, typedNodes);
  return buildFieldDeclarationSection(declaration, docs, index, typedNodes);
};

const buildDocumentationSections = (program: ChemdProgramDocument): RenderDocumentationSection[] => {
  const fileDocs = docsForAttachment(program.docs, (attachment) => attachment.kind === "file");
  const moduleDocs = docsForAttachment(program.docs, (attachment) => attachment.kind === "module");
  return [
    fileDocs.length ? { kind: "documentation", id: "file-docs", title: "Documentation", docs: fileDocs } : undefined,
    moduleDocs.length ? { kind: "documentation", id: "module-docs", title: "Module Notes", docs: moduleDocs } : undefined
  ].filter((section): section is RenderDocumentationSection => Boolean(section));
};

const buildImports = (
  imports: ChemdImportDeclaration[],
  index: DocumentationIndex
): RenderImport[] =>
  imports.map((item) => ({
    moduleName: item.moduleName,
    from: item.from,
    alias: item.alias,
    docs: docsFromRefs(item.docs, index)
  }));

export const buildProgramRenderDocument = (
  program: ChemdProgramDocument,
  options: BuildProgramRenderDocumentOptions = {}
): ProgramRenderDocument => {
  const typedGraph = normalizeTypedGraph(program, options.typedGraph);
  const docs = new Map(program.docs.map((doc) => [doc.id, doc]));
  const typedNodes = new Map(typedGraph.nodes.map((node) => [node.nodeId, node]));
  return {
    schema_version: CHEMD_PROGRAM_RENDER_SCHEMA_VERSION,
    sourceLanguage: program.sourceLanguage,
    moduleName: program.module.name,
    meta: {
      id: program.meta.id,
      title: program.meta.title,
      date: program.meta.date,
      fields: mapFields(program.meta.fields),
      primary: program.meta.primary,
      docs: docsFromRefs(program.meta.docs, docs)
    },
    imports: buildImports(program.imports, docs),
    sections: [
      ...buildDocumentationSections(program),
      ...program.declarations.map((declaration) =>
        buildDeclarationSection(declaration, program.docs, docs, typedNodes)
      )
    ],
    diagnostics: [
      ...program.diagnostics.map((diagnostic: Diagnostic) => normalizeDiagnostic(diagnostic)),
      ...typedGraph.diagnostics
    ],
    semantic: { typedGraph }
  };
};

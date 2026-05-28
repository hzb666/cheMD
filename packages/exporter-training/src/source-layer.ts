import type { ChemdDocument, ChemdNode, ChemdProgramDocument } from "@chemd/core";

import type {
  ExportedDiagnostic,
  ProgramSourceLayerV1,
  SourceDeclarationSnapshot,
  SourceDocCommentSnapshot,
  SourceLayerV1,
  SourceNodeSnapshot
} from "./types";
import { TRAINING_AUDIT_ONLY_FIELDS } from "./governance";

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
};

const getOriginalId = (node: ChemdNode): string | undefined => {
  if ("id" in node && typeof node.id === "string" && node.id) {
    return node.id;
  }

  return undefined;
};

const readNodeStringField = (node: ChemdNode, field: string): string | undefined => {
  if (!(field in node)) {
    return undefined;
  }

  const value = (node as unknown as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
};

const createSourceSnapshot = (node: ChemdNode, nodeIndex: number): SourceNodeSnapshot => ({
  node_index: nodeIndex,
  node_type: node.type,
  original_id: getOriginalId(node),
  source_block_type: readNodeStringField(node, "syntaxOrigin") ?? node.type,
  syntax_origin: readNodeStringField(node, "syntaxOrigin"),
  declared_kind: readNodeStringField(node, "declaredKind"),
  raw_payload: toRecord(node)
});

const createExportedDiagnostic = (diagnostic: ChemdDocument["diagnostics"][number]): ExportedDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  ...(diagnostic.nodeId ? { node_id: diagnostic.nodeId } : {}),
  ...(diagnostic.position
    ? {
        position: {
          ...(diagnostic.position.start ? { start: diagnostic.position.start } : {}),
          ...(diagnostic.position.end ? { end: diagnostic.position.end } : {})
        }
      }
    : {})
});

const attachedTo = (attachment: ChemdProgramDocument["docs"][number]["attachment"]): string | undefined => {
  if (attachment.kind === "declaration") return attachment.declarationId;
  if (attachment.kind === "field") return `${attachment.declarationId}.${attachment.fieldName}`;
  if (attachment.kind === "module") return attachment.moduleName;
  if (attachment.kind === "procedure_step") return `${attachment.declarationId}.${attachment.stepId}`;
  if (attachment.kind === "agent_statement") return `${attachment.runId}.${attachment.statementId}`;
  return undefined;
};

const createDeclarationSnapshot = (
  declaration: ChemdProgramDocument["declarations"][number],
  declarationIndex: number
): SourceDeclarationSnapshot => ({
  declaration_index: declarationIndex,
  declaration_kind: declaration.kind,
  declaration_id: declaration.id,
  qualified_id: declaration.qualifiedId,
  docs: declaration.docs.map((doc) => doc.docId),
  raw_payload: toRecord(declaration),
  source_span: declaration.sourceSpan
});

const createDocCommentSnapshot = (
  doc: ChemdProgramDocument["docs"][number]
): SourceDocCommentSnapshot => ({
  doc_id: doc.id,
  attachment_kind: doc.attachment.kind,
  attached_to: attachedTo(doc.attachment),
  raw_markdown: doc.markdown,
  export_policy: doc.exportPolicy,
  source_span: doc.sourceSpan
});

export const buildProgramSourceLayer = (program: ChemdProgramDocument): ProgramSourceLayerV1 => ({
  ...(typeof program.source === "string" ? { raw_source: program.source, resolved_source: program.source } : {}),
  program: {
    schema_version: program.schemaVersion,
    source_language: program.sourceLanguage,
    imports: program.imports.map((item) => ({
      module_name: item.moduleName,
      from: item.from,
      alias: item.alias,
      docs: item.docs.map((doc) => doc.docId)
    })),
    source_span: program.sourceSpan
  },
  module: {
    name: program.module.name,
    docs: program.module.docs.map((doc) => doc.docId),
    source_span: program.module.sourceSpan
  },
  meta: {
    id: program.meta.id,
    title: program.meta.title,
    date: program.meta.date,
    fields: toRecord(program.meta.fields),
    primary: toRecord(program.meta.primary),
    docs: program.meta.docs.map((doc) => doc.docId),
    source_span: program.meta.sourceSpan
  },
  declarations: program.declarations.map(createDeclarationSnapshot),
  doc_comments: program.docs.map(createDocCommentSnapshot),
  diagnostics: program.diagnostics.map((diagnostic) => createExportedDiagnostic(diagnostic)),
  audit_only_fields: TRAINING_AUDIT_ONLY_FIELDS
});

export const buildSourceLayer = (document: ChemdDocument): SourceLayerV1 => ({
  ...(typeof document.source === "string" ? { raw_source: document.source, resolved_source: document.source } : {}),
  program: {
    schema_version: "legacy-chemd-document",
    source_language: "legacy-chemd",
    imports: []
  },
  module: { name: "legacy_document", docs: [] },
  meta: {
    id: document.meta.id,
    title: document.meta.title,
    date: document.meta.date,
    fields: toRecord(document.meta),
    docs: []
  },
  declarations: document.children.map((node, nodeIndex) => {
    const snapshot = createSourceSnapshot(node, nodeIndex);
    return {
      declaration_index: snapshot.node_index,
      declaration_kind: snapshot.node_type,
      declaration_id: snapshot.original_id ?? String(snapshot.node_index),
      raw_payload: snapshot.raw_payload,
      docs: []
    };
  }),
  doc_comments: [],
  diagnostics: document.diagnostics.map((diagnostic) => createExportedDiagnostic(diagnostic)),
  audit_only_fields: TRAINING_AUDIT_ONLY_FIELDS
});

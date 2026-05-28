import type {
  InlineChemToken,
  InlineCodeToken,
  MarkdownLinkToken,
  ReferenceToken,
  SourceMappedNode
} from "../ast";

export interface ChemdDocComment extends SourceMappedNode {
  type: "doc_comment";
  id: string;
  markdown: string;
  attachment: ChemdDocCommentAttachment;
  references: ReferenceToken[];
  inlineChem: InlineChemToken[];
  inlineCode: InlineCodeToken[];
  links: MarkdownLinkToken[];
  exportPolicy: ChemdDocCommentExportPolicy;
}

export type ChemdDocCommentAttachment =
  | { kind: "file" }
  | { kind: "module"; moduleName: string }
  | { kind: "declaration"; declarationId: string }
  | { kind: "field"; declarationId: string; fieldName: string }
  | { kind: "procedure_step"; declarationId: string; stepId: string }
  | { kind: "agent_statement"; runId: string; statementId: string };

export type ChemdDocCommentExportPolicy =
  | "render_rag"
  | "render_only"
  | "audit_only";

export interface ChemdDocCommentRef {
  docId: string;
}

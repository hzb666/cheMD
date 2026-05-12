import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdSourceRange
} from "./types";

export interface ChemdEditorPosition {
  line: number;
  column: number;
}

export interface ChemdWorkspaceSymbol {
  symbolId: string;
  documentUri: string;
  documentId: string;
  localId: string;
  kind: string;
  label: string;
  range: ChemdSourceRange;
  summary?: string;
  sourceHash?: string;
  stale?: boolean;
}

export interface ChemdWorkspaceSymbolIndex {
  version: "chemd-workspace-symbol-index/v0.1";
  generatedAt: string;
  symbols: ChemdWorkspaceSymbol[];
  diagnostics: ChemdEditorDiagnostic[];
}

export type ChemdCompletionTriggerKind =
  | "manual"
  | "trigger-character"
  | "typing";

export interface ChemdCompletionRequest {
  source: string;
  documentUri?: string;
  cursorOffset?: number;
  position?: ChemdEditorPosition;
  triggerKind?: ChemdCompletionTriggerKind;
  triggerCharacter?: string;
  compileOutput?: ChemdLanguageCompileOutput;
  workspaceIndex?: ChemdWorkspaceSymbolIndex;
  externalSymbols?: ChemdWorkspaceSymbol[];
}

export type ChemdCompletionItemKind =
  | "snippet"
  | "field"
  | "value"
  | "reference"
  | "template"
  | "quick_fix";

export interface ChemdCompletionItem {
  id: string;
  label: string;
  kind: ChemdCompletionItemKind;
  insertText: string;
  insertTextFormat: "plain" | "snippet";
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  range: ChemdSourceRange;
  data?: Record<string, unknown>;
}

export interface ChemdCompletionList {
  documentUri?: string;
  items: ChemdCompletionItem[];
  range: ChemdSourceRange;
}

export type ChemdCompletionBlockKind =
  | "molecule"
  | "reaction"
  | "result"
  | "procedure"
  | "step"
  | "template"
  | "use"
  | "condition_varies"
  | "unknown";

export interface ChemdCompletionContext {
  source: string;
  offset: number;
  position: ChemdEditorPosition;
  lineText: string;
  linePrefix: string;
  tokenPrefix: string;
  range: ChemdSourceRange;
  isFrontmatter: boolean;
  isChemdBlock: boolean;
  isUseHeaderPosition: boolean;
  isReferencePosition: boolean;
  isStepFamilyPosition: boolean;
  isFieldKeyPosition: boolean;
  isFieldValuePosition: boolean;
  fieldKey?: string;
  fieldPrefix: string;
  block?: {
    type: string;
    id?: string;
    kind: ChemdCompletionBlockKind;
    startLine: number;
    fields: Set<string>;
  };
}

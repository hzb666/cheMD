import type { ChemdLanguageCompileOutput, ChemdSourceRange } from "./types";

export interface ChemdEditorPosition {
  line: number;
  column: number;
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
}

export type ChemdCompletionItemKind =
  | "snippet"
  | "field"
  | "value";

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
}

export interface ChemdCompletionList {
  documentUri?: string;
  items: ChemdCompletionItem[];
  range: ChemdSourceRange;
}

export type ChemdCompletionBlockKind =
  | "molecule"
  | "reaction"
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

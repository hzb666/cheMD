import type {
  ChemdLanguageCompileOutput,
  ChemdSourceRange
} from "./types";
import type { ChemdWorkspaceSymbolIndex } from "./workspace-symbol-types";

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
  workspaceIndex?: ChemdWorkspaceSymbolIndex;
}

export type ChemdCompletionItemKind =
  | "snippet"
  | "field"
  | "value"
  | "reference"
  | "template"
  | "quick_fix";

export interface ChemdReferenceCompletionData {
  type: "reference";
  symbolId: string;
  symbolKind: string;
}

export type ChemdCompletionItemData =
  | ChemdReferenceCompletionData;

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
  data?: ChemdCompletionItemData;
  range: ChemdSourceRange;
}

export interface ChemdCompletionList {
  documentUri?: string;
  items: ChemdCompletionItem[];
  range: ChemdSourceRange;
}

export type ChemdCompletionBlockKind =
  | "molecule"
  | "material"
  | "batch"
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

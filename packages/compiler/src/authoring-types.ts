export type AuthoringMinimalSetStatus =
  | "complete"
  | "fixable_by_suggestion"
  | "needs_author_input";

export type AuthoringSuggestionCategory =
  | "reference"
  | "inheritance"
  | "structure";

export type AuthoringTemplateCategory =
  | "starter"
  | "companion"
  | "optimization"
  | "scaffold";

export type AuthoringPatch =
  | {
      kind: "batch";
      patches: AuthoringPatch[];
    }
  | {
      kind: "append_document_text";
      text: string;
    }
  | {
      kind: "insert_after_declaration";
      declarationId: string;
      text: string;
    }
  | {
      kind: "insert_declaration_field";
      declarationId: string;
      line: string;
      anchorFields?: string[];
    }
  | {
      kind: "insert_meta_field";
      line: string;
      anchorFields?: string[];
    };

export type AuthoringTarget =
  | { kind: "document"; documentId: string }
  | { kind: "meta_field"; field: string }
  | { kind: "declaration"; declarationId: string }
  | { kind: "declaration_field"; declarationId: string; field: string }
  | { kind: "doc_comment"; docId: string };

export interface AuthoringSuggestion {
  suggestion_id: string;
  title: string;
  description: string;
  category: AuthoringSuggestionCategory;
  confidence: "high" | "medium";
  target?: AuthoringTarget;
  patch: AuthoringPatch;
}

export interface AuthoringTemplate {
  template_id: string;
  title: string;
  description: string;
  category: AuthoringTemplateCategory;
  patch: AuthoringPatch;
}

export interface AuthoringMinimalSet {
  checklist_id: string;
  title: string;
  description: string;
  status: AuthoringMinimalSetStatus;
  missing_items: string[];
  inferable_items: string[];
  suggestion_ids: string[];
}

export interface AuthoringAssistance {
  minimal_sets: AuthoringMinimalSet[];
  templates: AuthoringTemplate[];
  suggestions: AuthoringSuggestion[];
}

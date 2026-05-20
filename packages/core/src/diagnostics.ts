export type DiagnosticSeverity = "info" | "warning" | "error";

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface DiagnosticSourceSpan {
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  position?: SourceRange;
  nodeId?: string;
  sourceLayer?: string;
  sourceNodeType?: string;
  sourceNodeId?: string;
  sourceField?: string;
  sourceSpan?: DiagnosticSourceSpan;
  facts?: Record<string, unknown>;
  quickFixes?: DiagnosticQuickFix[];
}

export interface DiagnosticQuickFix {
  title: string;
  kind: string;
  patch?: unknown;
}

export const createDiagnostic = (diagnostic: Diagnostic): Diagnostic => diagnostic;

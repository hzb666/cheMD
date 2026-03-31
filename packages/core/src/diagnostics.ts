export type DiagnosticSeverity = "info" | "warning" | "error";

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  position?: SourceRange;
  nodeId?: string;
}

export const createDiagnostic = (diagnostic: Diagnostic): Diagnostic => diagnostic;

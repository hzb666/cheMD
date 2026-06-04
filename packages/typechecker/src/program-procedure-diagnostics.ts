import type {
  ProcedureControlDeclaration,
  ProcedureDeclaration
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { createProgramDiagnostic } from "./program-utils";

export const createProgramControlDiagnostic = (
  code: string,
  severity: V03Diagnostic["severity"],
  message: string,
  procedure: ProcedureDeclaration,
  control?: ProcedureControlDeclaration,
  facts: Record<string, unknown> = {}
): V03Diagnostic =>
  createProgramDiagnostic(
    code,
    message,
    procedure,
    control?.controlKind ?? "control",
    severity,
    facts,
    control?.sourceSpan
  );

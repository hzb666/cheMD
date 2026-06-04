import type { ProcedureDeclaration } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import {
  buildProcedureState,
  type CanonicalStepNode,
  type ProcedureStateViolation
} from "@chemd/step-ontology";

import { createProgramDiagnostic } from "./program-utils";

export const validateProgramProcedureState = (
  procedure: ProcedureDeclaration,
  steps: readonly CanonicalStepNode[]
): V03Diagnostic[] =>
  buildProcedureState(steps).violations.map((violation) =>
    createStateDiagnostic(procedure, violation)
  );

const createStateDiagnostic = (
  procedure: ProcedureDeclaration,
  violation: ProcedureStateViolation
): V03Diagnostic =>
  createProgramDiagnostic(
    "E_PROCEDURE_STATE_INVALID",
    violation.message,
    procedure,
    violation.stepFamily,
    "error",
    {
      current_state: violation.currentState,
      required_state: violation.requiredState,
      step_family: violation.stepFamily,
      step_id: violation.stepId,
      violation_code: violation.code
    }
  );

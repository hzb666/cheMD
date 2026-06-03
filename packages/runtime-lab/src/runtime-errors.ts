import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

export type RuntimeIssueCode =
  | "E_RUNTIME_ADAPTER_MISSING"
  | "E_RUNTIME_CAPABILITY_MISSING"
  | "E_RUNTIME_CONTROL_DYNAMIC"
  | "E_RUNTIME_DEVICE_RANGE"
  | "E_RUNTIME_INVENTORY_EXPIRED"
  | "E_RUNTIME_INVENTORY_UNAVAILABLE"
  | "E_RUNTIME_RESOURCE_CONFLICT"
  | "E_RUNTIME_SAFETY_CONFIRMATION"
  | "E_RUNTIME_SAFETY_RULE"
  | "E_RUNTIME_SAFETY_TAG"
  | "E_RUNTIME_UNKNOWN_STEP";

export interface PreflightIssue {
  code: RuntimeIssueCode;
  severity: "info" | "warning" | "error";
  kind:
    | "capability"
    | "device_range"
    | "inventory"
    | "safety"
    | "environment"
    | "adapter"
    | "control"
    | "resource_conflict";
  stepId?: string;
  controlId?: string;
  message: string;
  facts?: Record<string, unknown>;
  requiredAction?:
    | "manual_confirmation"
    | "change_context"
    | "change_procedure"
    | "provide_adapter"
    | "reduce_parallelism";
}

export interface PreflightResult {
  blocking: boolean;
  issues: PreflightIssue[];
  diagnostics: V03Diagnostic[];
}

export const createPreflightDiagnostic = (issue: PreflightIssue): V03Diagnostic =>
  createV03Diagnostic({
    code: codeForPreflightIssue(issue),
    severity: issue.severity,
    message: issue.message,
    sourceLayer: "runtime_preflight",
    sourceNodeType: issue.stepId ? "step" : "procedure",
    sourceNodeId: issue.stepId ?? issue.controlId,
    facts: {
      runtime_issue_code: issue.code,
      kind: issue.kind,
      step_id: issue.stepId,
      control_id: issue.controlId,
      required_action: issue.requiredAction,
      ...issue.facts
    }
  });

const codeForPreflightIssue = (issue: PreflightIssue): string => {
  if (issue.code === "E_RUNTIME_CAPABILITY_MISSING") return "E605";
  if (issue.code === "E_RUNTIME_UNKNOWN_STEP") return "E_RUNTIME_UNKNOWN_STEP";
  if (issue.kind === "device_range") return "E_RUNTIME_DEVICE_RANGE";
  if (issue.kind === "inventory") return "E_RUNTIME_INVENTORY";
  if (issue.kind === "adapter") return "E_RUNTIME_ADAPTER";
  if (issue.kind === "control") return "E_RUNTIME_CONTROL";
  if (issue.kind === "resource_conflict") return "E_RUNTIME_RESOURCE_CONFLICT";
  return "W_RUNTIME_SAFETY";
};

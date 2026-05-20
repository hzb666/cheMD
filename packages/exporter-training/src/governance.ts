import type {
  DataGovernanceInfo,
  ExportedDiagnostic
} from "./types";

const GOVERNANCE_ALLOWED_USES = new Set(["rag", "sft", "eval", "regression", "audit"]);
const DEFAULT_ALLOWED_USES: NonNullable<DataGovernanceInfo["allowed_uses"]> = [
  "rag",
  "sft",
  "eval",
  "regression",
  "audit"
];

export const TRAINING_AUDIT_ONLY_FIELDS = [
  "source_layer.raw_source",
  "source_layer.resolved_source",
  "source_layer.raw_meta",
  "source_layer.raw_children.raw_payload",
  "semantic_layer.materials.supplier",
  "semantic_layer.materials.lot",
  "semantic_layer.samples.supplier",
  "semantic_layer.artifacts.path"
];

const readRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const readString = (record: Record<string, unknown>, key: string): string | undefined =>
  typeof record[key] === "string" ? record[key] : undefined;

const readEnum = <T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T | undefined => {
  const value = readString(record, key);
  return value && (allowed as readonly string[]).includes(value) ? value as T : undefined;
};

const readAllowedUses = (value: unknown): DataGovernanceInfo["allowed_uses"] | undefined => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string" ? value.split(/[|,]/) : undefined;
  const allowedUses = rawValues
    ?.map((item) => typeof item === "string" ? item.trim() : "")
    .filter((item): item is NonNullable<DataGovernanceInfo["allowed_uses"]>[number] =>
      GOVERNANCE_ALLOWED_USES.has(item)
    );

  return allowedUses && allowedUses.length > 0
    ? Array.from(new Set(allowedUses))
    : undefined;
};

export const buildDataGovernanceInfo = (
  meta: Record<string, unknown>
): DataGovernanceInfo => {
  const raw = readRecord(meta.governance);

  if (!raw) {
    return {
      confidentiality: "internal",
      pii_status: "none",
      review_status: "machine_parsed",
      allowed_uses: DEFAULT_ALLOWED_USES,
      sanitization_policy: "default",
      source: "workspace_policy"
    };
  }

  return {
    confidentiality: readEnum(raw, "confidentiality", ["public", "internal", "restricted"] as const),
    license: readString(raw, "license"),
    pii_status: readEnum(raw, "pii_status", ["none", "redacted", "present"] as const) ?? "none",
    review_status: readEnum(
      raw,
      "review_status",
      ["machine_parsed", "human_reviewed", "expert_verified"] as const
    ) ?? "machine_parsed",
    allowed_uses: readAllowedUses(raw.allowed_uses) ?? ["audit"],
    sanitization_policy: readEnum(raw, "sanitization_policy", ["default", "strict", "none"] as const) ?? "default",
    source: "frontmatter"
  };
};

const createGovernanceDiagnostic = (
  code: string,
  severity: ExportedDiagnostic["severity"],
  message: string
): ExportedDiagnostic => ({
  code,
  severity,
  message
});

export const buildGovernanceDiagnostics = (
  governance: DataGovernanceInfo
): ExportedDiagnostic[] => {
  const diagnostics: ExportedDiagnostic[] = [];
  const allowedUses = new Set(governance.allowed_uses ?? []);
  const nonAuditAllowed = (["rag", "sft", "eval", "regression"] as const).some((use) =>
    allowedUses.has(use)
  );

  if (governance.pii_status === "present") {
    diagnostics.push(createGovernanceDiagnostic(
      "E_TRAINING_PII_PRESENT",
      "error",
      "PII is marked present; only audit/full export is allowed until the record is redacted."
    ));
  }

  if (!allowedUses.has("rag")) {
    diagnostics.push(createGovernanceDiagnostic(
      "W_TRAINING_RAG_NOT_ALLOWED",
      "warning",
      "RAG projection is not allowed by governance.allowed_uses."
    ));
  }

  if (!nonAuditAllowed) {
    diagnostics.push(createGovernanceDiagnostic(
      "W_TRAINING_AUDIT_ONLY",
      "warning",
      "Governance allows audit only; sanitized training projections are not eligible."
    ));
  }

  if (governance.sanitization_policy === "none" && nonAuditAllowed) {
    diagnostics.push(createGovernanceDiagnostic(
      "W_TRAINING_SANITIZATION_DISABLED",
      "warning",
      "Non-audit training use is allowed while sanitization_policy is none."
    ));
  }

  return diagnostics;
};

import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

import { toReferenceOrLiteral } from "./references";
import type {
  ExternalTargetIndex,
  ObjectNode,
  ReferenceOrLiteral,
  ReferenceType
} from "./types";

interface ResolveReferenceListOptions {
  sourceNodeType: string;
  sourceNodeId: string | undefined;
  field: string;
  expectedTargetKind?: ReferenceType["targetKind"];
}

interface ResolvedReferenceList {
  values: ReferenceOrLiteral[];
  diagnostics: V03Diagnostic[];
}

const isValidTargetKind = (
  reference: ReferenceType,
  expectedTargetKind: ReferenceType["targetKind"] | undefined
): boolean =>
  reference.resolved
    && (!expectedTargetKind || reference.targetKind === expectedTargetKind);

const createTypedReferenceDiagnostic = (
  reference: ReferenceType,
  options: ResolveReferenceListOptions
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_TYPED_REFERENCE_MISMATCH",
    severity: "error",
    message: `Invalid ${options.field} reference: ${reference.refId}`,
    sourceLayer: "typechecker",
    sourceNodeType: options.sourceNodeType,
    sourceNodeId: options.sourceNodeId,
    sourceField: options.field,
    facts: {
      field: options.field,
      ref_id: reference.refId,
      expected_target_kind: options.expectedTargetKind ?? "object",
      actual_target_kind: reference.targetKind,
      resolved: reference.resolved
    }
  });

export const resolveReferenceList = (
  rawValues: string[],
  objectIndex: Map<string, ObjectNode>,
  options: ResolveReferenceListOptions,
  externalTargetIndex?: ExternalTargetIndex
): ResolvedReferenceList => {
  const values = rawValues.map((raw) => toReferenceOrLiteral(raw, objectIndex, externalTargetIndex));
  const diagnostics = values.flatMap((value) =>
    value.kind === "reference" && !isValidTargetKind(value, options.expectedTargetKind)
      ? [createTypedReferenceDiagnostic(value, options)]
      : []
  );

  return { values, diagnostics };
};

export const resolveOptionalReference = (
  rawValue: string | undefined,
  objectIndex: Map<string, ObjectNode>,
  options: ResolveReferenceListOptions,
  externalTargetIndex?: ExternalTargetIndex
): { value?: ReferenceOrLiteral; diagnostics: V03Diagnostic[] } => {
  if (!rawValue) {
    return { diagnostics: [] };
  }

  const resolved = resolveReferenceList([rawValue], objectIndex, options, externalTargetIndex);
  return { value: resolved.values[0], diagnostics: resolved.diagnostics };
};

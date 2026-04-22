import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import type { ResultNode, SampleNode } from "@chemd/core";

import { resolveOptionalReference } from "./reference-rules";
import type { ObjectNode, ReferenceOrLiteral } from "./types";

interface ResultRelationshipResolution {
  reaction?: ReferenceOrLiteral;
  product?: ReferenceOrLiteral;
  diagnostics: V03Diagnostic[];
}

interface SampleRelationshipResolution {
  ref?: ReferenceOrLiteral;
  derivedFrom?: ReferenceOrLiteral;
  aliquotOf?: ReferenceOrLiteral;
  batchOf?: ReferenceOrLiteral;
  diagnostics: V03Diagnostic[];
}

const normalizeReferenceId = (value: string): string =>
  value.startsWith("@") ? value.slice(1).trim() : value.trim();

const findReactionNode = (
  reference: ReferenceOrLiteral | undefined,
  objectIndex: Map<string, ObjectNode>
): Extract<ObjectNode, { type: "reaction" }> | undefined => {
  if (!reference || reference.kind !== "reference" || reference.targetKind !== "reaction") {
    return undefined;
  }

  const node = objectIndex.get(reference.refId);
  return node?.type === "reaction" ? node : undefined;
};

const createProductMismatchDiagnostic = (
  node: ResultNode,
  productId: string
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_TYPED_REFERENCE_MISMATCH",
    severity: "error",
    message: `Result product ${productId} is not declared in the linked reaction products.`,
    sourceLayer: "typechecker",
    sourceNodeType: "result",
    sourceNodeId: node.id,
    sourceField: "product",
    facts: { field: "product", ref_id: productId, expected_target_kind: "reaction.product" }
  });

const createMetricConflictDiagnostic = (
  node: ResultNode,
  field: string,
  reactionValue: string,
  resultValue: string
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_RESULT_REACTION_CONFLICT",
    severity: "warning",
    message: `Result ${field} does not match the linked reaction ${field}.`,
    sourceLayer: "typechecker",
    sourceNodeType: "result",
    sourceNodeId: node.id,
    sourceField: field,
    facts: { field, reaction_value: reactionValue, result_value: resultValue }
  });

const parsePercentMetric = (raw: string): number | undefined => {
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*(%|percent)$/i);
  return match ? Number(match[1]) : undefined;
};

const metricsConflict = (reactionValue: string, resultValue: string): boolean => {
  const reactionPercent = parsePercentMetric(reactionValue);
  const resultPercent = parsePercentMetric(resultValue);
  if (reactionPercent !== undefined && resultPercent !== undefined) {
    return Math.abs(reactionPercent - resultPercent) > 1e-9;
  }

  return reactionValue.trim().toLowerCase() !== resultValue.trim().toLowerCase();
};

const validateProductMembership = (
  node: ResultNode,
  reaction: Extract<ObjectNode, { type: "reaction" }> | undefined
): V03Diagnostic[] => {
  if (!reaction || !node.product) {
    return [];
  }

  const productId = normalizeReferenceId(node.product);
  const reactionProducts = new Set((reaction.products ?? []).map(normalizeReferenceId));
  return reactionProducts.has(productId)
    ? []
    : [createProductMismatchDiagnostic(node, productId)];
};

const validateMetricConsistency = (
  node: ResultNode,
  reaction: Extract<ObjectNode, { type: "reaction" }> | undefined
): V03Diagnostic[] => {
  if (!reaction) {
    return [];
  }

  return (["yield", "conversion", "selectivity"] as const).flatMap((field) =>
    node[field] && reaction[field] && metricsConflict(reaction[field] as string, node[field] as string)
      ? [createMetricConflictDiagnostic(node, field, reaction[field] as string, node[field] as string)]
      : []
  );
};

export const resolveResultRelationships = (
  node: ResultNode,
  objectIndex: Map<string, ObjectNode>
): ResultRelationshipResolution => {
  const reaction = resolveOptionalReference(node.reaction ?? node.ref, objectIndex, {
    sourceNodeType: "result",
    sourceNodeId: node.id,
    field: node.reaction ? "reaction" : "ref",
    expectedTargetKind: "reaction"
  });
  const product = resolveOptionalReference(node.product, objectIndex, {
    sourceNodeType: "result",
    sourceNodeId: node.id,
    field: "product",
    expectedTargetKind: "molecule"
  });
  const reactionNode = findReactionNode(reaction.value, objectIndex);

  return {
    ...(reaction.value ? { reaction: reaction.value } : {}),
    ...(product.value ? { product: product.value } : {}),
    diagnostics: [
      ...reaction.diagnostics,
      ...product.diagnostics,
      ...validateProductMembership(node, reactionNode),
      ...validateMetricConsistency(node, reactionNode)
    ]
  };
};

export const resolveSampleRelationships = (
  node: SampleNode,
  objectIndex: Map<string, ObjectNode>
): SampleRelationshipResolution => {
  const ref = resolveOptionalReference(node.ref, objectIndex, {
    sourceNodeType: "sample",
    sourceNodeId: node.id,
    field: "ref"
  });
  const derivedFrom = resolveOptionalReference(node.derived_from, objectIndex, {
    sourceNodeType: "sample",
    sourceNodeId: node.id,
    field: "derived_from"
  });
  const aliquotOf = resolveOptionalReference(node.aliquot_of, objectIndex, {
    sourceNodeType: "sample",
    sourceNodeId: node.id,
    field: "aliquot_of",
    expectedTargetKind: "sample"
  });
  const batchOf = resolveOptionalReference(node.batch_of, objectIndex, {
    sourceNodeType: "sample",
    sourceNodeId: node.id,
    field: "batch_of",
    expectedTargetKind: "sample"
  });

  return {
    ...(ref.value ? { ref: ref.value } : {}),
    ...(derivedFrom.value ? { derivedFrom: derivedFrom.value } : {}),
    ...(aliquotOf.value ? { aliquotOf: aliquotOf.value } : {}),
    ...(batchOf.value ? { batchOf: batchOf.value } : {}),
    diagnostics: [
      ...ref.diagnostics,
      ...derivedFrom.diagnostics,
      ...aliquotOf.diagnostics,
      ...batchOf.diagnostics
    ]
  };
};

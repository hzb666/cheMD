import type { ChemdDocument, ChemdNode } from "@chemd/core";

const OBJECT_NODE_TYPES = new Set([
  "molecule",
  "reaction",
  "result",
  "analysis",
  "procedure",
  "observation",
  "sample",
  "condition_varies"
]);

const INTERNAL_FIELDS = new Set(["type", "id", "syntaxOrigin", "declaredKind"]);

export interface SemanticFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export type SemanticDiffChange =
  | {
      changeType: "added";
      nodeId: string;
      nodeType: string;
      after: Record<string, unknown>;
    }
  | {
      changeType: "removed";
      nodeId: string;
      nodeType: string;
      before: Record<string, unknown>;
    }
  | {
      changeType: "changed";
      nodeId: string;
      nodeType: string;
      fields: SemanticFieldChange[];
    };

export interface SemanticDiff {
  schemaVersion: "chemd-semantic-diff/v0.1";
  beforeDocumentId: string;
  afterDocumentId: string;
  changes: SemanticDiffChange[];
}

interface ComparableObject {
  fields: Record<string, unknown>;
  nodeId: string;
  nodeType: string;
}

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeValue(nestedValue)])
    );
  }

  return value;
};

const stableValue = (value: unknown): string => JSON.stringify(normalizeValue(value));

const formatValue = (value: unknown): string => stableValue(value);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isGeneratedObjectId = (
  documentId: string,
  node: ChemdNode & { id: string }
): boolean => {
  const pattern = new RegExp(`^${escapeRegExp(documentId)}-${node.type}-\\d+$`);
  return pattern.test(node.id);
};

const isObjectNode = (
  documentId: string,
  node: ChemdNode
): node is ChemdNode & { id: string } =>
  OBJECT_NODE_TYPES.has(node.type)
  && "id" in node
  && typeof node.id === "string"
  && !isGeneratedObjectId(documentId, node as ChemdNode & { id: string });

const collectComparableFields = (node: ChemdNode): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(node)
      .filter(([key, value]) => !INTERNAL_FIELDS.has(key) && value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, normalizeValue(value)])
  );

const collectObjects = (
  documentId: string,
  nodes: ChemdNode[],
  output = new Map<string, ComparableObject>()
): Map<string, ComparableObject> => {
  for (const node of nodes) {
    if (node.type === "col") {
      collectObjects(documentId, node.children, output);
      continue;
    }

    if (node.type === "template") {
      collectObjects(documentId, node.body, output);
      continue;
    }

    if (isObjectNode(documentId, node)) {
      output.set(`${node.type}:${node.id}`, {
        fields: collectComparableFields(node),
        nodeId: node.id,
        nodeType: node.type
      });
    }
  }

  return output;
};

const compareFields = (
  beforeFields: Record<string, unknown>,
  afterFields: Record<string, unknown>
): SemanticFieldChange[] => {
  const fieldNames = new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)]);
  const changes: SemanticFieldChange[] = [];

  for (const field of [...fieldNames].sort()) {
    const before = beforeFields[field];
    const after = afterFields[field];
    if (stableValue(before) !== stableValue(after)) {
      changes.push({ field, before, after });
    }
  }

  return changes;
};

const pushRemovedChanges = (
  changes: SemanticDiffChange[],
  beforeObjects: Map<string, ComparableObject>,
  afterObjects: Map<string, ComparableObject>
) => {
  for (const [key, before] of [...beforeObjects].sort()) {
    if (!afterObjects.has(key)) {
      changes.push({
        changeType: "removed",
        nodeId: before.nodeId,
        nodeType: before.nodeType,
        before: before.fields
      });
    }
  }
};

const pushAddedAndChanged = (
  changes: SemanticDiffChange[],
  beforeObjects: Map<string, ComparableObject>,
  afterObjects: Map<string, ComparableObject>
) => {
  for (const [key, after] of [...afterObjects].sort()) {
    const before = beforeObjects.get(key);

    if (!before) {
      changes.push({
        changeType: "added",
        nodeId: after.nodeId,
        nodeType: after.nodeType,
        after: after.fields
      });
      continue;
    }

    const fields = compareFields(before.fields, after.fields);
    if (fields.length > 0) {
      changes.push({
        changeType: "changed",
        nodeId: after.nodeId,
        nodeType: after.nodeType,
        fields
      });
    }
  }
};

export const buildSemanticDiff = (
  beforeDocument: ChemdDocument,
  afterDocument: ChemdDocument
): SemanticDiff => {
  const beforeObjects = collectObjects(beforeDocument.meta.id, beforeDocument.children);
  const afterObjects = collectObjects(afterDocument.meta.id, afterDocument.children);
  const changes: SemanticDiffChange[] = [];

  pushRemovedChanges(changes, beforeObjects, afterObjects);
  pushAddedAndChanged(changes, beforeObjects, afterObjects);

  return {
    schemaVersion: "chemd-semantic-diff/v0.1",
    beforeDocumentId: beforeDocument.meta.id,
    afterDocumentId: afterDocument.meta.id,
    changes
  };
};

const formatAddedFields = (fields: Record<string, unknown>, prefix: string): string[] =>
  Object.entries(fields).map(([field, value]) => `  ${prefix} ${field}: ${formatValue(value)}`);

const formatChange = (change: SemanticDiffChange): string[] => {
  const title = `${change.nodeType} #${change.nodeId}`;

  if (change.changeType === "added") {
    return [`+ ${title}`, ...formatAddedFields(change.after, "+")];
  }

  if (change.changeType === "removed") {
    return [`- ${title}`, ...formatAddedFields(change.before, "-")];
  }

  return [
    `~ ${title}`,
    ...change.fields.map((fieldChange) =>
      `  ~ ${fieldChange.field}: ${formatValue(fieldChange.before)} -> ${formatValue(fieldChange.after)}`
    )
  ];
};

export const formatSemanticDiffText = (diff: SemanticDiff): string => {
  if (diff.changes.length === 0) {
    return "No semantic changes.";
  }

  return diff.changes.flatMap((change) => formatChange(change)).join("\n");
};

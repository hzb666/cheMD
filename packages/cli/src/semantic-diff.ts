import type {
  ChemdDeclaration,
  ChemdImportDeclaration,
  ChemdProgramDocument,
  ChemdValue
} from "@chemd/core";

const OBJECT_NODE_TYPES = new Set([
  "molecule",
  "material",
  "batch",
  "reaction",
  "result",
  "analysis",
  "procedure",
  "observation",
  "sample",
  "artifact",
  "trace",
  "condition_screen"
]);

const INTERNAL_FIELDS = new Set(["kind", "id", "qualifiedId", "docs", "sourceSpan", "fieldSpans"]);
const VOLATILE_NESTED_FIELDS = new Set(["docs", "resolved", "sourceSpan", "fieldSpans"]);

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
        .filter(([key, nestedValue]) =>
          !VOLATILE_NESTED_FIELDS.has(key) && nestedValue !== undefined
        )
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
  node: ChemdDeclaration & { id: string }
): boolean => {
  const pattern = new RegExp(`^${escapeRegExp(documentId)}-${node.kind}-\\d+$`);
  return pattern.test(node.id);
};

const isObjectNode = (
  documentId: string,
  node: ChemdDeclaration
): node is ChemdDeclaration & { id: string } =>
  OBJECT_NODE_TYPES.has(node.kind)
  && "id" in node
  && typeof node.id === "string"
  && !isGeneratedObjectId(documentId, node as ChemdDeclaration & { id: string });

const collectComparableFields = (node: ChemdDeclaration): Record<string, unknown> =>
  collectStructuredFields(
    Object.fromEntries(
      Object.entries(node)
        .filter(([key, value]) => !INTERNAL_FIELDS.has(key) && value !== undefined)
    )
  );

const collectStructuredFields = (
  fields: Record<string, unknown>
): Record<string, unknown> => Object.fromEntries(
  Object.entries(fields)
    .flatMap<[string, unknown]>(([key, value]) =>
      key === "fields" && isValueRecord(value)
        ? flattenFieldRecord(key, value)
        : [[key, normalizeValue(value)]]
    )
    .sort(([left], [right]) => left.localeCompare(right))
);

const flattenFieldRecord = (
  prefix: string,
  fields: Record<string, ChemdValue>
): Array<[string, unknown]> => Object.entries(fields).map(([key, value]) => [
  `${prefix}.${key}`,
  normalizeValue(value)
]);

const isValueRecord = (value: unknown): value is Record<string, ChemdValue> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const collectObjects = (
  document: ChemdProgramDocument,
  output = new Map<string, ComparableObject>()
): Map<string, ComparableObject> => {
  output.set("$module", {
    fields: { name: document.module.name },
    nodeId: "module",
    nodeType: "module"
  });
  output.set("$meta", {
    fields: collectStructuredFields({
      id: document.meta.id,
      title: document.meta.title,
      date: document.meta.date,
      fields: document.meta.fields,
      primary: document.meta.primary
    }),
    nodeId: document.meta.id,
    nodeType: "meta"
  });
  for (const item of document.imports) {
    output.set(`import:${item.from}`, collectImportObject(item));
  }
  for (const node of document.declarations) {
    if (isObjectNode(document.meta.id, node)) {
      output.set(`${node.kind}:${node.id}`, {
        fields: collectComparableFields(node),
        nodeId: node.id,
        nodeType: node.kind
      });
    }
  }

  return output;
};

const collectImportObject = (item: ChemdImportDeclaration): ComparableObject => ({
  fields: collectStructuredFields({
    moduleName: item.moduleName,
    from: item.from,
    alias: item.alias
  }),
  nodeId: item.alias ?? item.moduleName,
  nodeType: "import"
});

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
  beforeDocument: ChemdProgramDocument,
  afterDocument: ChemdProgramDocument
): SemanticDiff => {
  const beforeObjects = collectObjects(beforeDocument);
  const afterObjects = collectObjects(afterDocument);
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

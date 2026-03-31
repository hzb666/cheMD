import type {
  ChemdDocument,
  ChemdNode,
  Diagnostic,
  MarkdownNode,
  ObjectNode,
  ReferenceToken,
  TemplateNode,
  UseNode
} from "@chemd/core";

const REQUIRED_FIELDS: Record<string, string[]> = {
  molecule: ["smiles"],
  reaction: ["reactants", "products"],
  analysis: ["type_name", "data"],
  sample: ["name"]
};

const PRIMARY_ALIAS_FIELDS: Record<string, string> = {
  reaction: "primary_reaction",
  result: "primary_result",
  product: "primary_product",
  sample: "primary_sample"
};

const PRIMARY_META_FIELDS = Object.values(PRIMARY_ALIAS_FIELDS);
const MAX_TEMPLATE_EXPANSION_DEPTH = 32;
const MAX_TEMPLATE_EXPANDED_NODES = 2000;

const isObjectNode = (node: ChemdNode): node is ObjectNode =>
  ["molecule", "reaction", "result", "analysis", "sample"].includes(node.type);

const readNodeField = (node: unknown, field: string): unknown => {
  if (!node || typeof node !== "object") {
    return undefined;
  }

  return (node as Record<string, unknown>)[field];
};

const hasMissingValue = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return value === undefined || value === null || value === "";
};

const hasOwn = <TValue>(record: Record<string, TValue>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const getIndexedValue = <TValue>(
  record: Record<string, TValue>,
  key: string
): TValue | undefined => (hasOwn(record, key) ? record[key] : undefined);

const buildObjectIndex = (children: ChemdNode[], diagnostics: Diagnostic[]): Record<string, ObjectNode> => {
  const index: Record<string, ObjectNode> = Object.create(null) as Record<string, ObjectNode>;

  for (const child of children) {
    if (!isObjectNode(child) || !child.id) {
      continue;
    }

    if (hasOwn(index, child.id)) {
      diagnostics.push({
        code: "E_DUPLICATE_ID",
        severity: "error",
        message: `Duplicate object id: ${child.id}`,
        nodeId: child.id
      });
      continue;
    }

    index[child.id] = child;
  }

  return index;
};

const buildTemplateIndex = (children: ChemdNode[], diagnostics: Diagnostic[]): Record<string, TemplateNode> => {
  const index: Record<string, TemplateNode> = Object.create(null) as Record<string, TemplateNode>;

  for (const child of children) {
    if (child.type !== "template") {
      continue;
    }

    if (hasOwn(index, child.name)) {
      diagnostics.push({
        code: "E_DUPLICATE_TEMPLATE",
        severity: "error",
        message: `Duplicate template name: ${child.name}`
      });
      continue;
    }

    index[child.name] = child;
  }

  return index;
};

const validateNodes = (children: ChemdNode[], diagnostics: Diagnostic[]) => {
  for (const child of children) {
    if (!isObjectNode(child)) {
      continue;
    }

    const requiredFields = REQUIRED_FIELDS[child.type];

    if (!requiredFields) {
      continue;
    }

    for (const field of requiredFields) {
      if (hasMissingValue(readNodeField(child, field))) {
        diagnostics.push({
          code: "E_MISSING_REQUIRED_FIELD",
          severity: "error",
          message: `Missing required field "${field}" on ${child.type}${child.id ? ` ${child.id}` : ""}`,
          nodeId: child.id
        });
      }
    }
  }
};

const validatePrimaryReferences = (
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>,
  diagnostics: Diagnostic[]
) => {
  for (const field of PRIMARY_META_FIELDS) {
    const value = document.meta[field];

    if (typeof value !== "string" || !value) {
      continue;
    }

    if (!getIndexedValue(objectIndex, value)) {
      diagnostics.push({
        code: "E_INVALID_PRIMARY_REFERENCE",
        severity: "error",
        message: `Frontmatter ${field} references missing object id: ${value}`,
        nodeId: value
      });
    }
  }
};

interface TemplateContext {
  template?: TemplateNode;
  useNode?: UseNode;
  templateStack: string[];
}

interface ExpansionGuard {
  expandedNodes: number;
  limitReached: boolean;
}

const createContext = (context: Partial<TemplateContext> = {}): TemplateContext => ({
  template: context.template,
  useNode: context.useNode,
  templateStack: context.templateStack ?? []
});

const resolveTemplateSourceId = (
  source: string,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>
): string | undefined => {
  if (hasOwn(objectIndex, source)) {
    return source;
  }

  const metaValue = document.meta[source];
  return typeof metaValue === "string" ? metaValue : undefined;
};

const resolveAliasObject = (
  alias: string,
  context: TemplateContext,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>
): ObjectNode | undefined => {
  const { template, useNode } = context;
  const aliasKeys = new Set<string>([
    ...Object.keys(template?.bind ?? {}),
    ...Object.keys(PRIMARY_ALIAS_FIELDS)
  ]);

  if (useNode && aliasKeys.has(alias)) {
    const overrideId = useNode.values[alias];

    if (overrideId) {
      return getIndexedValue(objectIndex, overrideId);
    }
  }

  const boundSource = template?.bind[alias];
  if (boundSource) {
    const boundId = resolveTemplateSourceId(boundSource, document, objectIndex);
    if (boundId) {
      return getIndexedValue(objectIndex, boundId);
    }
  }

  const primaryField = PRIMARY_ALIAS_FIELDS[alias];
  if (primaryField) {
    const primaryId = document.meta[primaryField];
    if (typeof primaryId === "string") {
      return getIndexedValue(objectIndex, primaryId);
    }
  }

  return undefined;
};

const resolveParamValue = (field: string, context: TemplateContext): string | undefined => {
  const aliasKeys = new Set(Object.keys(context.template?.bind ?? {}));

  if (!context.useNode || aliasKeys.has(field)) {
    return undefined;
  }

  return context.useNode.values[field];
};

const resolveReference = (
  token: ReferenceToken,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>,
  diagnostics: Diagnostic[],
  context: TemplateContext
): ReferenceToken => {
  const unresolved = (message: string): ReferenceToken => {
    diagnostics.push({
      code: "W_UNRESOLVED_REFERENCE",
      severity: "warning",
      message
    });

    return {
      ...token,
      resolution: {
        status: "unresolved",
        message
      }
    };
  };

  if (token.kind === "meta") {
    const value = token.field ? document.meta[token.field] : undefined;

    if (value === undefined) {
      return unresolved(`Unable to resolve reference ${token.raw}`);
    }

    return {
      ...token,
      resolution: {
        status: "resolved",
        value
      }
    };
  }

  if (token.kind === "param_field") {
    const value = token.field ? resolveParamValue(token.field, context) : undefined;

    if (value === undefined) {
      return unresolved(`Unable to resolve reference ${token.raw}`);
    }

    return {
      ...token,
      resolution: {
        status: "resolved",
        value
      }
    };
  }

  if (token.kind === "alias_field") {
    const target = resolveAliasObject(token.source, context, document, objectIndex);
    const value = token.field ? readNodeField(target, token.field) : undefined;

    if (value === undefined) {
      return unresolved(`Unable to resolve reference ${token.raw}`);
    }

    return {
      ...token,
      resolution: {
        status: "resolved",
        value
      }
    };
  }

  if (token.kind === "object") {
    const value = getIndexedValue(objectIndex, token.source);

    if (!value) {
      return unresolved(`Unable to resolve reference ${token.raw}`);
    }

    return {
      ...token,
      resolution: {
        status: "resolved",
        value
      }
    };
  }

  if (token.kind === "object_field") {
    const value = getIndexedValue(objectIndex, token.source);
    const fieldValue = token.field ? readNodeField(value, token.field) : undefined;

    if (fieldValue === undefined) {
      return unresolved(`Unable to resolve reference ${token.raw}`);
    }

    return {
      ...token,
      resolution: {
        status: "resolved",
        value: fieldValue
      }
    };
  }

  return unresolved(`Unable to resolve reference ${token.raw}`);
};

const resolveMarkdownNode = (
  node: MarkdownNode,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>,
  diagnostics: Diagnostic[],
  context: TemplateContext
): MarkdownNode => ({
  ...node,
  references: node.references.map((token) => resolveReference(token, document, objectIndex, diagnostics, context))
});

const resolveTemplateDefinition = (
  node: TemplateNode,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>,
  diagnostics: Diagnostic[]
): TemplateNode => ({
  ...node,
  body: node.body.map((child) => {
    if (child.type === "markdown") {
      return resolveMarkdownNode(child, document, objectIndex, diagnostics, createContext({ template: node }));
    }

    if (child.type === "template") {
      return resolveTemplateDefinition(child, document, objectIndex, diagnostics);
    }

    return child;
  })
});

const reportExpansionLimit = (diagnostics: Diagnostic[], guard: ExpansionGuard, message: string) => {
  if (guard.limitReached) {
    return;
  }

  guard.limitReached = true;
  diagnostics.push({
    code: "E_TEMPLATE_EXPANSION_LIMIT",
    severity: "error",
    message
  });
};

const consumeExpansionSlot = (diagnostics: Diagnostic[], guard: ExpansionGuard): boolean => {
  if (guard.expandedNodes < MAX_TEMPLATE_EXPANDED_NODES) {
    guard.expandedNodes += 1;
    return true;
  }

  reportExpansionLimit(
    diagnostics,
    guard,
    `Template expansion limit reached: max expanded nodes is ${MAX_TEMPLATE_EXPANDED_NODES}`
  );
  return false;
};

const expandTemplateChild = (
  child: ChemdNode,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>,
  templateIndex: Record<string, TemplateNode>,
  diagnostics: Diagnostic[],
  context: TemplateContext,
  guard: ExpansionGuard
): ChemdNode[] => {
  if (child.type === "markdown") {
    if (!consumeExpansionSlot(diagnostics, guard)) {
      return [];
    }

    return [resolveMarkdownNode(child, document, objectIndex, diagnostics, context)];
  }

  if (child.type === "use") {
    return expandUseNode(child, document, objectIndex, templateIndex, diagnostics, guard, context);
  }

  if (child.type === "template") {
    if (!consumeExpansionSlot(diagnostics, guard)) {
      return [];
    }

    return [resolveTemplateDefinition(child, document, objectIndex, diagnostics)];
  }

  if (!consumeExpansionSlot(diagnostics, guard)) {
    return [];
  }

  return [child];
};

const expandUseNode = (
  node: UseNode,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>,
  templateIndex: Record<string, TemplateNode>,
  diagnostics: Diagnostic[],
  guard: ExpansionGuard,
  parentContext: TemplateContext = createContext()
): ChemdNode[] => {
  if (parentContext.templateStack.length >= MAX_TEMPLATE_EXPANSION_DEPTH) {
    reportExpansionLimit(
      diagnostics,
      guard,
      `Template expansion depth limit reached: max depth is ${MAX_TEMPLATE_EXPANSION_DEPTH}`
    );
    return [];
  }

  if (parentContext.templateStack.includes(node.template)) {
    const cyclePath = [...parentContext.templateStack, node.template].join(" -> ");
    diagnostics.push({
      code: "E_TEMPLATE_CYCLE",
      severity: "error",
      message: `Template cycle detected: ${cyclePath}`
    });
    return [];
  }

  const template = getIndexedValue(templateIndex, node.template);

  if (!template) {
    diagnostics.push({
      code: "E_UNKNOWN_TEMPLATE",
      severity: "error",
      message: `Unknown template: ${node.template}`
    });
    return [];
  }

  const context = createContext({
    template,
    useNode: node,
    templateStack: [...parentContext.templateStack, node.template]
  });

  return template.body.flatMap((child) =>
    expandTemplateChild(child, document, objectIndex, templateIndex, diagnostics, context, guard)
  );
};

const resolveNode = (
  node: ChemdNode,
  document: ChemdDocument,
  objectIndex: Record<string, ObjectNode>,
  templateIndex: Record<string, TemplateNode>,
  diagnostics: Diagnostic[],
  guard: ExpansionGuard
): ChemdNode[] => {
  if (node.type === "markdown") {
    return [resolveMarkdownNode(node, document, objectIndex, diagnostics, createContext())];
  }

  if (node.type === "template") {
    return [resolveTemplateDefinition(node, document, objectIndex, diagnostics)];
  }

  if (node.type === "use") {
    return expandUseNode(node, document, objectIndex, templateIndex, diagnostics, guard);
  }

  return [node];
};

export const resolveChemd = (document: ChemdDocument): ChemdDocument => {
  const diagnostics: Diagnostic[] = [...document.diagnostics];
  const objectIndex = buildObjectIndex(document.children, diagnostics);
  const templateIndex = buildTemplateIndex(document.children, diagnostics);
  const expansionGuard: ExpansionGuard = { expandedNodes: 0, limitReached: false };

  validateNodes(document.children, diagnostics);
  validatePrimaryReferences(document, objectIndex, diagnostics);

  return {
    ...document,
    diagnostics,
    children: document.children.flatMap((child) =>
      resolveNode(child, document, objectIndex, templateIndex, diagnostics, expansionGuard)
    )
  };
};

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
import { validateTemplateParams } from "./template-params";

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
  sample: "primary_sample",
  molecule: "primary_molecule",
  analysis: "primary_analysis"
};

const PRIMARY_META_FIELDS = Object.values(PRIMARY_ALIAS_FIELDS);
const MAX_TEMPLATE_EXPANSION_DEPTH = 32;
const MAX_TEMPLATE_EXPANDED_NODES = 2000;

const isObjectNode = (node: ChemdNode): node is ObjectNode =>
  ["molecule", "reaction", "result", "analysis", "procedure", "observation", "sample"].includes(node.type);

const getNestedNodes = (node: ChemdNode): ChemdNode[] => {
  if (node.type === "col") {
    return node.children;
  }

  return [];
};

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

const buildObjectIndex = (
  children: ChemdNode[],
  diagnostics?: Diagnostic[]
): Record<string, ObjectNode> => {
  const index: Record<string, ObjectNode> = Object.create(null) as Record<string, ObjectNode>;
  const queue = [...children];
  let cursor = 0;

  while (cursor < queue.length) {
    const child = queue[cursor];
    cursor += 1;
    if (!isObjectNode(child) || !child.id) {
      queue.push(...getNestedNodes(child));
      continue;
    }

    if (hasOwn(index, child.id)) {
      diagnostics?.push({
        code: "E_DUPLICATE_ID",
        severity: "error",
        message: `Duplicate object id: ${child.id}`,
        nodeId: child.id
      });
      queue.push(...getNestedNodes(child));
      continue;
    }

    index[child.id] = child;
    queue.push(...getNestedNodes(child));
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

const getRequiredFields = (node: ObjectNode): string[] | undefined => {
  if (node.type === "analysis" && node.type_name?.toLowerCase() === "tlc") {
    return ["type_name"];
  }

  return REQUIRED_FIELDS[node.type];
};

const validateNodes = (children: ChemdNode[], diagnostics: Diagnostic[]) => {
  const queue = [...children];
  let cursor = 0;

  while (cursor < queue.length) {
    const child = queue[cursor];
    cursor += 1;
    queue.push(...getNestedNodes(child));

    if (!isObjectNode(child)) {
      continue;
    }

    const requiredFields = getRequiredFields(child);

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

const createDefaultObjectId = (
  documentId: string,
  type: ObjectNode["type"],
  counters: Partial<Record<ObjectNode["type"], number>>
): string => {
  const nextCount = (counters[type] ?? 0) + 1;
  counters[type] = nextCount;
  return `${documentId}-${type}-${nextCount}`;
};

const assignDefaultObjectIds = (
  nodes: ChemdNode[],
  documentId: string,
  counters: Partial<Record<ObjectNode["type"], number>> = {}
): ChemdNode[] =>
  nodes.map((node) => {
    if (node.type === "col") {
      return {
        ...node,
        children: assignDefaultObjectIds(node.children, documentId, counters)
      };
    }

    if (node.type === "template") {
      return {
        ...node,
        body: assignDefaultObjectIds(node.body, documentId, counters) as TemplateNode["body"]
      };
    }

    if (!isObjectNode(node)) {
      return node;
    }

    return node.id
      ? node
      : {
          ...node,
          id: createDefaultObjectId(documentId, node.type, counters)
        };
  });

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

interface ResolverEnvironment {
  document: ChemdDocument;
  objectIndex: Record<string, ObjectNode>;
  templateIndex: Record<string, TemplateNode>;
  diagnostics: Diagnostic[];
  guard: ExpansionGuard;
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
  environment: Pick<ResolverEnvironment, "document" | "objectIndex" | "diagnostics">,
  context: TemplateContext
): ReferenceToken => {
  const unresolved = (message: string): ReferenceToken => {
    environment.diagnostics.push({
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
    const value = token.field ? environment.document.meta[token.field] : undefined;

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
    const target = resolveAliasObject(
      token.source,
      context,
      environment.document,
      environment.objectIndex
    );
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
    const value = getIndexedValue(environment.objectIndex, token.source);

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
    const value = getIndexedValue(environment.objectIndex, token.source);
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
  environment: Pick<ResolverEnvironment, "document" | "objectIndex" | "diagnostics">,
  context: TemplateContext
): MarkdownNode => ({
  ...node,
  references: node.references.map((token) => resolveReference(token, environment, context))
});

const cloneNode = (node: ChemdNode): ChemdNode => {
  if (node.type === "markdown") {
    return {
      ...node,
      references: node.references.map((token) => ({ ...token })),
      inlineChem: node.inlineChem.map((token) => ({ ...token })),
      inlineCode: node.inlineCode.map((token) => ({ ...token })),
      links: node.links.map((token) => ({ ...token }))
    };
  }

  if (node.type === "col") {
    return {
      ...node,
      children: node.children.map((child) => cloneNode(child))
    };
  }

  if (node.type === "template") {
    return {
      ...node,
      bind: { ...node.bind },
      params: [...node.params],
      ...(node.paramSpecs ? { paramSpecs: node.paramSpecs.map((param) => ({ ...param, type: { ...param.type } })) } : {}),
      body: node.body.map((child) => cloneNode(child) as TemplateNode["body"][number])
    };
  }

  if (node.type === "use") {
    return {
      ...node,
      values: { ...node.values }
    };
  }

  const cloned = { ...node } as Record<string, unknown>;
  for (const [key, value] of Object.entries(cloned)) {
    if (Array.isArray(value)) {
      cloned[key] = [...value];
    }
  }

  return cloned as unknown as ChemdNode;
};

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
  environment: ResolverEnvironment,
  context: TemplateContext,
): ChemdNode[] => {
  if (child.type === "markdown") {
    if (!consumeExpansionSlot(environment.diagnostics, environment.guard)) {
      return [];
    }

    return [resolveMarkdownNode(child, environment, context)];
  }

  if (child.type === "use") {
    return expandUseNode(child, environment, context);
  }

  if (child.type === "template") {
    if (!consumeExpansionSlot(environment.diagnostics, environment.guard)) {
      return [];
    }

    return [cloneNode(child)];
  }

  if (child.type === "col") {
    if (!consumeExpansionSlot(environment.diagnostics, environment.guard)) {
      return [];
    }

    return [{
      ...child,
      children: child.children.flatMap((nested) =>
        expandTemplateChild(nested, environment, context)
      )
    }];
  }

  if (!consumeExpansionSlot(environment.diagnostics, environment.guard)) {
    return [];
  }

  return [cloneNode(child)];
};

const expandUseNode = (
  node: UseNode,
  environment: ResolverEnvironment,
  parentContext: TemplateContext = createContext()
): ChemdNode[] => {
  if (parentContext.templateStack.length >= MAX_TEMPLATE_EXPANSION_DEPTH) {
    reportExpansionLimit(
      environment.diagnostics,
      environment.guard,
      `Template expansion depth limit reached: max depth is ${MAX_TEMPLATE_EXPANSION_DEPTH}`
    );
    return [];
  }

  if (parentContext.templateStack.includes(node.template)) {
    const cyclePath = [...parentContext.templateStack, node.template].join(" -> ");
    environment.diagnostics.push({
      code: "E_TEMPLATE_CYCLE",
      severity: "error",
      message: `Template cycle detected: ${cyclePath}`
    });
    return [];
  }

  const template = getIndexedValue(environment.templateIndex, node.template);

  if (!template) {
    environment.diagnostics.push({
      code: "E_UNKNOWN_TEMPLATE",
      severity: "error",
      message: `Unknown template: ${node.template}`
    });
    return [];
  }

  validateTemplateParams(template, node, environment.objectIndex, environment.diagnostics);

  const context = createContext({
    template,
    useNode: node,
    templateStack: [...parentContext.templateStack, node.template]
  });

  return template.body.flatMap((child) =>
    expandTemplateChild(child, environment, context)
  );
};

const resolveNode = (
  node: ChemdNode,
  environment: ResolverEnvironment
): ChemdNode[] => {
  if (node.type === "markdown") {
    return [resolveMarkdownNode(node, environment, createContext())];
  }

  if (node.type === "template") {
    return [cloneNode(node)];
  }

  if (node.type === "use") {
    return expandUseNode(node, environment);
  }

  if (node.type === "col") {
    return [{
      ...node,
      children: node.children.flatMap((child) =>
        resolveNode(child, environment)
      )
    }];
  }

  return [node];
};

export const resolveChemd = (document: ChemdDocument): ChemdDocument => {
  const diagnostics: Diagnostic[] = [...document.diagnostics];
  const templateIndex = buildTemplateIndex(document.children, diagnostics);
  const objectIndex = buildObjectIndex(document.children);
  const expansionGuard: ExpansionGuard = { expandedNodes: 0, limitReached: false };
  const environment: ResolverEnvironment = {
    document,
    objectIndex,
    templateIndex,
    diagnostics,
    guard: expansionGuard
  };
  const resolvedChildren = document.children.flatMap((child) =>
    resolveNode(child, environment)
  );
  const childrenWithDefaultIds = assignDefaultObjectIds(resolvedChildren, document.meta.id);
  const resolvedDocument: ChemdDocument = {
    ...document,
    children: childrenWithDefaultIds
  };
  const resolvedObjectIndex = buildObjectIndex(childrenWithDefaultIds, diagnostics);

  validateNodes(childrenWithDefaultIds, diagnostics);
  validatePrimaryReferences(resolvedDocument, resolvedObjectIndex, diagnostics);

  return {
    ...resolvedDocument,
    diagnostics,
    children: childrenWithDefaultIds
  };
};


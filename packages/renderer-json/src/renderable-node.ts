import type { ChemdDocument, ChemdNode, FieldSourceSpans, SourceSpan } from "@chemd/core";

export const CHEMD_RENDERABLE_NODE_SCHEMA_VERSION = "chemd.renderable-node.v1";

export type ChemdRenderableNodeKindV1 = ChemdNode["type"] | "document";
export type ChemdHydrationTargetV1 = "molecule" | "reaction" | "analysis";

export interface BuildRenderableNodeTreeOptions {
  includeSourceRefs?: boolean;
  sourceId?: string;
}

export interface ChemdSourceRefV1 {
  sourceId?: string;
  field?: string;
  range: SourceSpan;
}

export type ChemdRenderDirectiveV1 =
  | { kind: "document"; display: "flow" }
  | { kind: "text"; text: string }
  | { kind: "layout"; display: "columns"; columns: number }
  | { kind: "template"; template: string; expansion: "nested-body"; params: string[] }
  | {
      kind: "hydrate";
      target: ChemdHydrationTargetV1;
      hydration: { mode: "lazy"; key: string; status: "ready" };
      payload: Record<string, unknown>;
      fallback: "placeholder";
    }
  | {
      kind: "placeholder";
      target: ChemdHydrationTargetV1;
      hydration: { mode: "lazy"; key: string; status: "placeholder" };
      reason: "missing_render_payload";
      text: string;
    }
  | { kind: "semantic"; target: string; payload: Record<string, unknown> };

export interface ChemdRenderableNodeV1 {
  nodeId: string;
  kind: ChemdRenderableNodeKindV1;
  label: string;
  range?: SourceSpan;
  sourceRefs?: ChemdSourceRefV1[];
  directive: ChemdRenderDirectiveV1;
  children: ChemdRenderableNodeV1[];
}

export interface ChemdRenderableNodeTreeV1 {
  schemaVersion: typeof CHEMD_RENDERABLE_NODE_SCHEMA_VERSION;
  root: ChemdRenderableNodeV1;
}

interface BuildContext {
  includeSourceRefs: boolean;
  sourceId?: string;
}

const HEAVY_NODE_TYPES = new Set<ChemdHydrationTargetV1>(["molecule", "reaction", "analysis"]);

const FIELD_KEYS_BY_TYPE: Record<string, string[]> = {
  molecule: ["id", "name", "smiles", "cas", "inchi", "inchikey", "canonical_smiles", "formula", "mw", "role", "caption", "chemistryFeatureRefs"],
  material: ["id", "molecule", "supplier", "lot", "purity", "density", "storage", "notes", "chemistryFeatureRefs"],
  batch: ["id", "source", "molecule", "state", "mass", "purity", "artifacts", "notes", "chemistryFeatureRefs"],
  reaction: ["id", "name", "route", "reactants", "products", "conditions", "caption", "chemistryFeatureRefs"],
  analysis: ["id", "type_name", "ref", "method", "data", "result", "instrument", "notes"],
  result: ["id", "status", "yield", "conversion", "selectivity", "purity", "notes"],
  procedure: ["id", "ref", "reaction", "body", "evidence", "steps"],
  trace: ["id", "plan", "mode", "events"],
  observation: ["id", "ref", "body", "events"],
  sample: ["id", "name", "sample_id", "batch", "purity", "notes"],
  artifact: ["id", "kind", "path", "checksum", "instrument", "notes"],
  condition_varies: ["id", "reaction", "standard", "condition", "changes", "attempts", "notes"],
  use: ["template", "values"]
};

export const buildRenderableNodeTree = (
  document: ChemdDocument,
  options: BuildRenderableNodeTreeOptions = {}
): ChemdRenderableNodeTreeV1 => {
  const context: BuildContext = {
    includeSourceRefs: options.includeSourceRefs ?? true,
    sourceId: options.sourceId ?? document.meta.id
  };

  return {
    schemaVersion: CHEMD_RENDERABLE_NODE_SCHEMA_VERSION,
    root: {
      nodeId: "document",
      kind: "document",
      label: document.meta.title || document.meta.id || "Chemd document",
      directive: { kind: "document", display: "flow" },
      children: document.children.map((node, index) => buildNode(node, [pathSegment(index, node.type)], context))
    }
  };
};

const buildNode = (node: ChemdNode, path: string[], context: BuildContext): ChemdRenderableNodeV1 => {
  const sourceRefs = buildSourceRefs(node, context);
  const range = sourceRefs?.[0]?.range;

  return {
    nodeId: buildNodeId(path, node),
    kind: node.type,
    label: buildLabel(node),
    ...(range ? { range } : {}),
    ...(sourceRefs ? { sourceRefs } : {}),
    directive: buildDirective(node, path),
    children: buildChildren(node, path, context)
  };
};

const buildChildren = (node: ChemdNode, path: string[], context: BuildContext): ChemdRenderableNodeV1[] => {
  if (node.type === "col") {
    return node.children.map((child, index) => buildNode(child, [...path, pathSegment(index, child.type)], context));
  }

  if (node.type === "template") {
    const templatePath = [...path, normalizeIdPart(node.name)];

    return node.body.map((child, index) => buildNode(child, [...templatePath, pathSegment(index, child.type)], context));
  }

  return [];
};

const buildDirective = (node: ChemdNode, path: string[]): ChemdRenderDirectiveV1 => {
  if (node.type === "markdown") {
    return { kind: "text", text: node.value };
  }

  if (node.type === "col") {
    return { kind: "layout", display: "columns", columns: node.columns };
  }

  if (node.type === "template") {
    return { kind: "template", template: node.name, expansion: "nested-body", params: [...node.params] };
  }

  if (HEAVY_NODE_TYPES.has(node.type as ChemdHydrationTargetV1)) {
    return buildHeavyDirective(node, buildNodeId(path, node));
  }

  return { kind: "semantic", target: node.type, payload: pickPayload(node) };
};

const buildHeavyDirective = (node: ChemdNode, nodeId: string): ChemdRenderDirectiveV1 => {
  const target = node.type as ChemdHydrationTargetV1;
  const payload = pickPayload(node);
  const hydration = { mode: "lazy" as const, key: nodeId, status: "ready" as const };

  if (hasRenderableHeavyPayload(target, payload)) {
    return { kind: "hydrate", target, hydration, payload, fallback: "placeholder" };
  }

  return {
    kind: "placeholder",
    target,
    hydration: { ...hydration, status: "placeholder" },
    reason: "missing_render_payload",
    text: `${target} content is not available`
  };
};

const hasRenderableHeavyPayload = (target: ChemdHydrationTargetV1, payload: Record<string, unknown>): boolean => {
  const requiredKeys: Record<ChemdHydrationTargetV1, string[]> = {
    molecule: ["name", "smiles", "cas", "formula", "chemistryFeatureRefs"],
    reaction: ["name", "route", "reactants", "products", "conditions", "chemistryFeatureRefs"],
    analysis: ["type_name", "method", "data", "result", "instrument"]
  };

  return requiredKeys[target].some((key) => payload[key] !== undefined);
};

const buildLabel = (node: ChemdNode): string => {
  if (node.type === "markdown") {
    return firstTextLine(node.value) ?? "Markdown";
  }

  if (node.type === "col") {
    return `${node.columns} columns`;
  }

  if (node.type === "template") {
    return node.name;
  }

  return readString(node, ["name", "id", "route", "ref", "status", "type_name", "template"]) ?? node.type;
};

const buildSourceRefs = (node: ChemdNode, context: BuildContext): ChemdSourceRefV1[] | undefined => {
  if (
    !context.includeSourceRefs ||
    node.type === "markdown" ||
    node.type === "col" ||
    node.type === "template" ||
    node.type === "use"
  ) {
    return undefined;
  }

  const refs = [
    ...spanRef(undefined, node.sourceSpan, context.sourceId),
    ...fieldSpanRefs(node.fieldSpans, context.sourceId)
  ];

  return refs.length > 0 ? refs : undefined;
};

const fieldSpanRefs = (fieldSpans: FieldSourceSpans | undefined, sourceId?: string): ChemdSourceRefV1[] => {
  if (!fieldSpans) {
    return [];
  }

  return Object.entries(fieldSpans)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([field, range]) => spanRef(field, range, sourceId));
};

const spanRef = (field: string | undefined, range: SourceSpan | undefined, sourceId?: string): ChemdSourceRefV1[] =>
  range && hasSpanValue(range)
    ? [{ ...(sourceId ? { sourceId } : {}), ...(field ? { field } : {}), range }]
    : [];

const hasSpanValue = (range: SourceSpan): boolean =>
  Object.values(range).some((value) => typeof value === "number");

const pickPayload = (node: ChemdNode): Record<string, unknown> => {
  const record = node as unknown as Record<string, unknown>;
  const keys = FIELD_KEYS_BY_TYPE[node.type] ?? [];

  return Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
};

const readString = (node: ChemdNode, keys: string[]): string | undefined => {
  const record = node as unknown as Record<string, unknown>;
  const value = keys.map((key) => record[key]).find((item) => typeof item === "string" && item.length > 0);

  return typeof value === "string" ? value : undefined;
};

const firstTextLine = (value: string): string | undefined =>
  value.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0);

const buildNodeId = (path: string[], node: ChemdNode): string => {
  const explicitId = readString(node, ["id", "name", "template", "ref"]);
  const suffix = explicitId ? `.${normalizeIdPart(explicitId)}` : "";

  return `document.${path.join(".")}${suffix}`;
};

const pathSegment = (index: number, kind: string): string =>
  `${String(index + 1).padStart(2, "0")}_${normalizeIdPart(kind)}`;

const normalizeIdPart = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "node";

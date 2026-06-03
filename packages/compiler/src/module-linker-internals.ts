import type {
  ChemdImportDeclaration,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  Diagnostic
} from "@chemd/core";

import type {
  ChemdModuleImportEdge,
  ChemdModuleImportGraph,
  LinkedChemdModule
} from "./module-linker";

export const buildModuleLookup = (
  modules: LinkedChemdModule[],
  diagnostics: Diagnostic[]
): Map<string, LinkedChemdModule> => {
  const lookup = new Map<string, LinkedChemdModule>();

  for (const module of modules) {
    for (const key of moduleIdentityKeys(module)) {
      const existing = lookup.get(key);
      if (existing && existing !== module) {
        diagnostics.push(createModuleDiagnostic({
          code: "E_MODULE_ID_DUPLICATE",
          message: `Duplicate module identity ${key}`,
          moduleName: module.moduleName,
          facts: { moduleName: module.moduleName, duplicateKey: key }
        }));
        continue;
      }
      lookup.set(key, module);
    }
  }

  return lookup;
};

export const buildImportGraph = (
  modules: LinkedChemdModule[],
  lookup: Map<string, LinkedChemdModule>,
  diagnostics: Diagnostic[]
): ChemdModuleImportGraph => ({
  nodes: modules.map((item) => item.moduleName),
  edges: modules.flatMap((module) =>
    module.coreResult.program.imports.map((item) =>
      buildImportEdge(module, item, lookup, diagnostics)
    )
  )
});

export const findImportCycleDiagnostics = (
  graph: ChemdModuleImportGraph
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const adjacency = buildAdjacency(graph.edges);

  for (const node of graph.nodes) {
    const cycle = findCycleFromNode(node, adjacency, []);
    const cycleKey = cycle ? canonicalCycleKey(cycle) : undefined;
    if (!cycle || !cycleKey || hasCycleDiagnostic(diagnostics, cycleKey)) continue;
    diagnostics.push(createModuleDiagnostic({
      code: "E_MODULE_IMPORT_CYCLE",
      message: `Cyclic module import: ${cycle.join(" -> ")}`,
      moduleName: node,
      facts: { cycle, cycleKey }
    }));
  }

  return diagnostics;
};

export const findMissingImportedSymbolDiagnostics = (
  modules: LinkedChemdModule[],
  lookup: Map<string, LinkedChemdModule>
): Diagnostic[] => modules.flatMap((module) =>
  collectModuleReferences(module.coreResult.program).flatMap((reference) =>
    findMissingSymbolDiagnostic(module, reference, lookup)
  )
);

export const matchesModuleIdentity = (
  module: LinkedChemdModule,
  identity: string
): boolean => moduleIdentityKeys(module).includes(normalizeIdentityKey(identity));

const buildImportEdge = (
  module: LinkedChemdModule,
  item: ChemdImportDeclaration,
  lookup: Map<string, LinkedChemdModule>,
  diagnostics: Diagnostic[]
): ChemdModuleImportEdge => {
  const target = lookupImportedModule(item, lookup);
  if (!target) {
    diagnostics.push(createImportDiagnostic(
      "E_MODULE_IMPORT_NOT_FOUND",
      `Unable to find imported module ${item.moduleName} from ${item.from}`,
      module.moduleName,
      item
    ));
  }
  return {
    fromModule: module.moduleName,
    importModuleName: item.moduleName,
    importFrom: item.from,
    ...(item.alias ? { alias: item.alias } : {}),
    ...(target ? { toModule: target.moduleName } : {}),
    status: target ? "resolved" : "missing"
  };
};

const lookupImportedModule = (
  item: ChemdImportDeclaration,
  lookup: Map<string, LinkedChemdModule>
): LinkedChemdModule | undefined =>
  lookup.get(normalizeIdentityKey(item.from)) ?? lookup.get(item.moduleName);

const buildAdjacency = (
  edges: ChemdModuleImportEdge[]
): Map<string, string[]> => {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.toModule) continue;
    adjacency.set(edge.fromModule, [
      ...(adjacency.get(edge.fromModule) ?? []),
      edge.toModule
    ]);
  }
  return adjacency;
};

const findCycleFromNode = (
  node: string,
  adjacency: Map<string, string[]>,
  stack: string[]
): string[] | undefined => {
  const existingIndex = stack.indexOf(node);
  if (existingIndex >= 0) return [...stack.slice(existingIndex), node];

  for (const next of adjacency.get(node) ?? []) {
    const cycle = findCycleFromNode(next, adjacency, [...stack, node]);
    if (cycle) return cycle;
  }
  return undefined;
};

const hasCycleDiagnostic = (
  diagnostics: Diagnostic[],
  cycleKey: string
): boolean => diagnostics.some((item) => item.facts?.cycleKey === cycleKey);

const canonicalCycleKey = (cycle: string[]): string | undefined => {
  const nodes = cycle.at(0) === cycle.at(-1) ? cycle.slice(0, -1) : cycle;
  if (!nodes.length) return undefined;
  const rotations = nodes.map((_, index) => [
    ...nodes.slice(index),
    ...nodes.slice(0, index)
  ].join(">"));
  return rotations.sort()[0];
};

const findMissingSymbolDiagnostic = (
  module: LinkedChemdModule,
  reference: ChemdReferenceExpr & { refKind: "module" },
  lookup: Map<string, LinkedChemdModule>
): Diagnostic[] => {
  const importDeclaration = module.coreResult.program.imports.find((item) =>
    item.moduleName === reference.moduleName || item.alias === reference.moduleName
  );
  const targetModule = importDeclaration
    ? lookupImportedModule(importDeclaration, lookup)
    : undefined;

  if (!importDeclaration || !targetModule) return [];
  if (hasDeclaration(targetModule.coreResult.program, reference.target)) return [];

  return [createModuleDiagnostic({
    code: "E_MODULE_SYMBOL_NOT_FOUND",
    message: `Unable to find symbol ${reference.target} in module ${importDeclaration.moduleName}`,
    moduleName: module.moduleName,
    nodeId: reference.target,
    sourceSpan: reference.sourceSpan,
    facts: {
      moduleName: importDeclaration.moduleName,
      alias: importDeclaration.alias,
      from: importDeclaration.from,
      target: reference.target,
      reference: reference.raw
    }
  })];
};

const collectModuleReferences = (
  program: ChemdProgramDocument
): Array<ChemdReferenceExpr & { refKind: "module" }> => {
  const references: Array<ChemdReferenceExpr & { refKind: "module" }> = [];
  const seen = new Set<object>();
  const visit = (value: unknown): void => visitReferenceValue(value, seen, references, visit);

  visit(program.meta);
  visit(program.declarations);

  return references;
};

const visitReferenceValue = (
  value: unknown,
  seen: Set<object>,
  references: Array<ChemdReferenceExpr & { refKind: "module" }>,
  visit: (value: unknown) => void
): void => {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (isModuleReference(value)) references.push(value);
  if (Array.isArray(value)) {
    value.forEach(visit);
    return;
  }
  Object.values(value).forEach(visit);
};

const isModuleReference = (
  value: object
): value is ChemdReferenceExpr & { refKind: "module" } =>
  "type" in value
    && "refKind" in value
    && (value as { type?: unknown }).type === "reference"
    && (value as { refKind?: unknown }).refKind === "module";

const hasDeclaration = (
  program: ChemdProgramDocument,
  id: string
): boolean => program.declarations.some((item) =>
  item.id === id || item.qualifiedId === id || item.qualifiedId === `${program.module.name}.${id}`
);

const createImportDiagnostic = (
  code: string,
  message: string,
  moduleName: string,
  item: ChemdImportDeclaration
): Diagnostic => createModuleDiagnostic({
  code,
  message,
  moduleName,
  nodeId: item.moduleName,
  sourceSpan: item.sourceSpan,
  facts: { moduleName: item.moduleName, alias: item.alias, from: item.from }
});

const createModuleDiagnostic = (input: {
  code: string;
  message: string;
  moduleName: string;
  nodeId?: string;
  sourceSpan?: Diagnostic["sourceSpan"];
  facts?: Record<string, unknown>;
}): Diagnostic => ({
  code: input.code,
  severity: "error",
  message: input.message,
  nodeId: input.nodeId ?? input.moduleName,
  sourceLayer: "module-linker",
  sourceSpan: input.sourceSpan,
  facts: input.facts
});

const moduleIdentityKeys = (module: LinkedChemdModule): string[] => [
  module.moduleName,
  normalizeIdentityKey(module.moduleName),
  ...(module.input.path ? [module.input.path, normalizeIdentityKey(module.input.path)] : []),
  ...(module.input.uri ? [module.input.uri, normalizeIdentityKey(module.input.uri)] : [])
].filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);

const normalizeIdentityKey = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\.\//, "");

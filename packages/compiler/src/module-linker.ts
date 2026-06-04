import type {
  ChemdDeclaration,
  ChemdProgramDeclarationKind,
  ChemdProgramDocument,
  Diagnostic,
  ReferenceTargetKind
} from "@chemd/core";
import type { ReferenceType } from "@chemd/typechecker";

import {
  compileChemdCore,
  type CompileCoreResult,
  type CompileOptions
} from "./index";
import {
  buildImportGraph,
  buildModuleLookup,
  findImportCycleDiagnostics,
  findMissingImportedSymbolDiagnostics,
  matchesModuleIdentity
} from "./module-linker-internals";

export interface ChemdModuleInput {
  source: string;
  path?: string;
  uri?: string;
}

export interface LinkedChemdModule {
  input: ChemdModuleInput;
  moduleName: string;
  documentId: string;
  coreResult: CompileCoreResult;
}

export interface ChemdModuleImportEdge {
  fromModule: string;
  importModuleName: string;
  importFrom: string;
  alias?: string;
  toModule?: string;
  status: "resolved" | "missing";
}

export interface ChemdModuleImportGraph {
  nodes: string[];
  edges: ChemdModuleImportEdge[];
}

export interface ChemdModuleBuildNode {
  documentId: string;
  moduleName: string;
  path?: string;
  uri?: string;
}

export interface ChemdModuleDependents {
  dependents: string[];
  moduleName: string;
}

export interface ChemdModuleBuildGraph {
  nodes: ChemdModuleBuildNode[];
  edges: ChemdModuleImportEdge[];
  dependents: ChemdModuleDependents[];
}

export interface LinkChemdModulesOptions {
  changedModules?: string[];
  entry?: string;
  compileOptions?: CompileOptions;
}

export interface LinkChemdModulesResult {
  entry: LinkedChemdModule;
  affectedModules: string[];
  buildGraph: ChemdModuleBuildGraph;
  modules: LinkedChemdModule[];
  importGraph: ChemdModuleImportGraph;
  diagnostics: Diagnostic[];
}

export const linkChemdModules = (
  inputs: ChemdModuleInput[],
  options: LinkChemdModulesOptions = {}
): LinkChemdModulesResult => {
  const modules = inputs.map((input) => compileModuleInput(input, options.compileOptions));
  const diagnostics = modules.flatMap((item) => item.coreResult.diagnostics);
  const lookup = buildModuleLookup(modules, diagnostics);
  const importGraph = buildImportGraph(modules, lookup, diagnostics);

  diagnostics.push(...findImportCycleDiagnostics(importGraph));
  diagnostics.push(...findMissingImportedSymbolDiagnostics(modules, lookup));
  const linkedModules = materializeLinkedTypedGraphs(modules);
  diagnostics.push(...validateLinkedReferenceTargetKinds(linkedModules));
  const buildGraph = buildModuleBuildGraph(linkedModules, importGraph);

  return {
    entry: selectEntryModule(linkedModules, options.entry, diagnostics),
    affectedModules: findAffectedModules(
      linkedModules,
      buildGraph,
      options.changedModules ?? []
    ),
    buildGraph,
    modules: linkedModules,
    importGraph,
    diagnostics
  };
};

const compileModuleInput = (
  input: ChemdModuleInput,
  options: CompileOptions | undefined
): LinkedChemdModule => {
  const coreResult = compileChemdCore(input.source, options);
  return {
    input,
    moduleName: coreResult.program.module.name,
    documentId: readDocumentId(coreResult.program),
    coreResult
  };
};

const readDocumentId = (program: ChemdProgramDocument): string => program.meta.id;

const buildModuleBuildGraph = (
  modules: LinkedChemdModule[],
  importGraph: ChemdModuleImportGraph
): ChemdModuleBuildGraph => {
  const dependents = new Map<string, Set<string>>();
  for (const module of modules) {
    dependents.set(module.moduleName, new Set());
  }
  for (const edge of importGraph.edges) {
    if (edge.status !== "resolved" || !edge.toModule) continue;
    dependents.get(edge.toModule)?.add(edge.fromModule);
  }

  return {
    nodes: modules.map((module) => ({
      documentId: module.documentId,
      moduleName: module.moduleName,
      ...(module.input.path ? { path: module.input.path } : {}),
      ...(module.input.uri ? { uri: module.input.uri } : {})
    })),
    edges: importGraph.edges,
    dependents: [...dependents.entries()].map(([moduleName, items]) => ({
      moduleName,
      dependents: [...items].sort()
    }))
  };
};

const findAffectedModules = (
  modules: LinkedChemdModule[],
  buildGraph: ChemdModuleBuildGraph,
  changedModules: string[]
): string[] => {
  const seeds = changedModules.flatMap((changed) => matchChangedModule(modules, changed));
  const affected: string[] = [];
  const queued = [...new Set(seeds)];
  const dependents = new Map(
    buildGraph.dependents.map((item) => [item.moduleName, item.dependents])
  );

  while (queued.length > 0) {
    const moduleName = queued.shift()!;
    if (affected.includes(moduleName)) continue;
    affected.push(moduleName);
    queued.push(...(dependents.get(moduleName) ?? []));
  }

  return affected;
};

const matchChangedModule = (
  modules: LinkedChemdModule[],
  changed: string
): string[] =>
  modules
    .filter((module) => matchesModuleIdentity(module, changed))
    .map((module) => module.moduleName);

const selectEntryModule = (
  modules: LinkedChemdModule[],
  entry: string | undefined,
  diagnostics: Diagnostic[]
): LinkedChemdModule => {
  if (!modules.length) {
    throw new Error("linkChemdModules requires at least one module input");
  }
  if (!entry) {
    return modules[0]!;
  }
  const selected = modules.find((item) => matchesModuleIdentity(item, entry));
  if (selected) {
    return selected;
  }
  diagnostics.push({
    code: "E_MODULE_ENTRY_NOT_FOUND",
    severity: "error",
    message: `Unable to find entry module ${entry}`,
    nodeId: entry,
    sourceLayer: "module-linker",
    facts: { entry }
  });
  return modules[0]!;
};

const materializeLinkedTypedGraphs = (
  modules: LinkedChemdModule[]
): LinkedChemdModule[] => {
  const referenceIndex = buildLinkedReferenceIndex(modules);
  return modules.map((module) => ({
    ...module,
    coreResult: {
      ...module.coreResult,
      typedSemanticGraph: {
        ...module.coreResult.typedSemanticGraph,
        nodes: patchLinkedReferences(module.coreResult.typedSemanticGraph.nodes, referenceIndex)
      }
    }
  }));
};

const validateLinkedReferenceTargetKinds = (
  modules: LinkedChemdModule[]
): Diagnostic[] =>
  modules.flatMap((module) =>
    module.coreResult.typedSemanticGraph.nodes.flatMap((node) => {
      const diagnostics: Diagnostic[] = [];
      const nodeRecord = node as unknown as Record<string, unknown>;
      for (const rule of linkedReferenceRulesForNode(node)) {
        const value = nodeRecord[rule.field];
        diagnostics.push(
          ...collectReferenceValues(value).flatMap((reference) =>
            rule.expected.includes(reference.targetKind)
              ? []
              : [createLinkedReferenceTargetDiagnostic(module, node, rule.field, rule.expected, reference)]
          )
        );
      }
      return diagnostics;
    })
  );

const linkedReferenceRulesForNode = (
  node: { kind: string }
): Array<{ field: string; expected: ReferenceTargetKind[] }> => {
  if (node.kind === "result") {
    return [
      { field: "reaction", expected: ["reaction"] },
      { field: "product", expected: ["molecule", "batch", "sample"] }
    ];
  }
  if (node.kind === "material") {
    return [{ field: "molecule", expected: ["molecule"] }];
  }
  if (node.kind === "batch") {
    return [
      { field: "source", expected: ["reaction", "result", "sample", "batch"] },
      { field: "molecule", expected: ["molecule"] },
      { field: "artifacts", expected: ["artifact"] }
    ];
  }
  if (node.kind === "analysis") {
    return [
      { field: "ref", expected: ["reaction", "result", "sample", "batch", "material"] },
      { field: "artifacts", expected: ["artifact"] }
    ];
  }
  if (node.kind === "trace") {
    return [{ field: "plan", expected: ["procedure"] }];
  }
  if (node.kind === "sample") {
    return [
      { field: "ref", expected: ["reaction", "result", "sample", "batch"] },
      { field: "derivedFrom", expected: ["sample", "batch", "result", "reaction"] },
      { field: "aliquotOf", expected: ["sample"] },
      { field: "batchOf", expected: ["batch"] },
      { field: "artifacts", expected: ["artifact"] }
    ];
  }
  if (node.kind === "artifact") {
    return [{ field: "ref", expected: ["reaction", "result", "analysis", "sample", "batch", "material"] }];
  }
  if (node.kind === "condition_varies" || node.kind === "condition_screen") {
    return [
      { field: "reaction", expected: ["reaction"] },
      { field: "standard", expected: ["reaction", "result"] }
    ];
  }
  return [];
};

const collectReferenceValues = (value: unknown): ReferenceType[] => {
  if (Array.isArray(value)) return value.flatMap(collectReferenceValues);
  if (!value || typeof value !== "object") return [];
  if (isTypedReference(value)) {
    return value.resolved && value.targetKind !== "unknown" ? [value] : [];
  }
  return Object.values(value).flatMap(collectReferenceValues);
};

const createLinkedReferenceTargetDiagnostic = (
  module: LinkedChemdModule,
  node: { kind: string; nodeId?: string },
  field: string,
  expected: ReferenceTargetKind[],
  reference: ReferenceType
): Diagnostic => ({
  code: "E_PROGRAM_REFERENCE_TARGET_KIND",
  severity: "error",
  message: `Field '${field}' on ${node.kind} expected reference target ${expected.join(" or ")}, got ${reference.targetKind}.`,
  nodeId: node.nodeId,
  sourceLayer: "module-linker",
  sourceNodeType: node.kind,
  sourceNodeId: node.nodeId,
  sourceField: field,
  facts: {
    moduleName: module.moduleName,
    expectedTargetKind: expected,
    actualTargetKind: reference.targetKind,
    referenceTarget: reference.refId
  }
});

const buildLinkedReferenceIndex = (
  modules: LinkedChemdModule[]
): Map<string, ReferenceTargetKind> => {
  const index = new Map<string, ReferenceTargetKind>();
  for (const module of modules) {
    for (const declaration of module.coreResult.program.declarations) {
      index.set(`${module.moduleName}.${declaration.id}`, toReferenceTargetKind(declaration.kind));
      index.set(`${module.documentId}#${declaration.id}`, toReferenceTargetKind(declaration.kind));
    }
  }
  return index;
};

const patchLinkedReferences = <TValue>(
  value: TValue,
  referenceIndex: Map<string, ReferenceTargetKind>
): TValue => {
  if (Array.isArray(value)) {
    return value.map((item) => patchLinkedReferences(item, referenceIndex)) as TValue;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (isTypedReference(value)) {
    const targetKind = findReferenceTargetKind(value.refId, referenceIndex);
    return targetKind && value.targetKind === "unknown"
      ? { ...value, targetKind, resolved: true } as TValue
      : value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      patchLinkedReferences(item, referenceIndex)
    ])
  ) as TValue;
};

const isTypedReference = (value: object): value is ReferenceType =>
  (value as { kind?: unknown }).kind === "reference" &&
  typeof (value as { refId?: unknown }).refId === "string" &&
  typeof (value as { targetKind?: unknown }).targetKind === "string";

const findReferenceTargetKind = (
  refId: string,
  referenceIndex: Map<string, ReferenceTargetKind>
): ReferenceTargetKind | undefined => {
  const parts = refId.split(".");
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join(".");
    const targetKind = referenceIndex.get(candidate);
    if (targetKind) return targetKind;
  }
  return referenceIndex.get(refId);
};

const toReferenceTargetKind = (
  kind: ChemdDeclaration["kind"]
): ReferenceTargetKind => {
  const mapping: Partial<Record<ChemdProgramDeclarationKind, ReferenceTargetKind>> = {
    condition_screen: "condition_varies",
    agent_run: "unknown"
  };
  return mapping[kind] ?? kind as ReferenceTargetKind;
};

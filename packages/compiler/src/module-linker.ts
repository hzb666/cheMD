import type { ChemdProgramDocument, Diagnostic } from "@chemd/core";

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

export interface LinkChemdModulesOptions {
  entry?: string;
  compileOptions?: CompileOptions;
}

export interface LinkChemdModulesResult {
  entry: LinkedChemdModule;
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

  return {
    entry: selectEntryModule(modules, options.entry),
    modules,
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

const selectEntryModule = (
  modules: LinkedChemdModule[],
  entry: string | undefined
): LinkedChemdModule => {
  if (!modules.length) {
    throw new Error("linkChemdModules requires at least one module input");
  }
  if (!entry) {
    return modules[0]!;
  }
  return modules.find((item) => matchesModuleIdentity(item, entry)) ?? modules[0]!;
};

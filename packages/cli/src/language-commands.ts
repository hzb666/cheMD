import type {
  ChemdIncrementalCompilerSnapshot,
  ChemdModuleInput,
  LinkChemdModulesResult
} from "@chemd/compiler";
import type { Diagnostic } from "@chemd/core";

type LinkChemdModules = typeof import("@chemd/compiler")["linkChemdModules"];
type CreateChemdIncrementalCompiler =
  typeof import("@chemd/compiler")["createChemdIncrementalCompiler"];

export interface CliWriter {
  write(chunk: string): unknown;
}

export interface LanguageCommandOptions {
  cwd: string;
  readSource(filePath: string, cwd: string): string;
  stdout: CliWriter;
}

export interface LinkCommand {
  entry?: string;
  filePaths: string[];
  format: "text" | "json";
  type: "link";
}

export interface IncrementalCommand {
  filePaths: string[];
  format: "text" | "json";
  type: "incremental";
}

interface DiagnosticCounts {
  error: number;
  warning: number;
  info: number;
}

type DiagnosticCodeCounts = Record<string, number>;

interface ProgramSummary {
  declarationCount: number;
  docCount: number;
}

interface LinkGraphSummary {
  nodeCount: number;
  quantityCount: number;
  stepCount: number;
}

interface LinkReferenceSummary {
  refId: string;
  resolved: boolean;
  targetKind: string;
}

interface LinkModuleReport {
  diagnostics: Diagnostic[];
  documentId: string;
  filePath?: string;
  graph: LinkGraphSummary;
  moduleName: string;
  references: LinkReferenceSummary[];
}

interface LinkReport {
  schemaVersion: "chemd-link/v0.1";
  codes: DiagnosticCodeCounts;
  diagnostics: Diagnostic[];
  entry: {
    documentId: string;
    filePath?: string;
    moduleName: string;
  };
  importGraph: LinkChemdModulesResult["importGraph"];
  modules: LinkModuleReport[];
  totals: DiagnosticCounts;
}

interface IncrementalFileReport {
  cache: {
    cacheKey: string;
    optionsHash: string;
    revision: number;
    sourceHash: string;
    status: string;
  };
  codes: DiagnosticCodeCounts;
  counts: DiagnosticCounts;
  diagnostics: Diagnostic[];
  filePath: string;
  program: ProgramSummary;
}

interface IncrementalReport {
  schemaVersion: "chemd-incremental/v0.1";
  codes: DiagnosticCodeCounts;
  results: IncrementalFileReport[];
  snapshot: ChemdIncrementalCompilerSnapshot;
  totals: DiagnosticCounts;
}

export const linkFiles = (
  command: LinkCommand,
  linkChemdModules: LinkChemdModules,
  options: LanguageCommandOptions
): number => {
  const inputs: ChemdModuleInput[] = command.filePaths.map((filePath) => ({
    path: filePath,
    source: options.readSource(filePath, options.cwd)
  }));
  const result = linkChemdModules(inputs, command.entry ? { entry: command.entry } : {});
  const report = toLinkReport(result);
  const output = command.format === "json"
    ? JSON.stringify(report, null, 2)
    : formatLinkText(report);

  options.stdout.write(`${output}\n`);
  return report.totals.error > 0 ? 1 : 0;
};

export const incrementalFiles = (
  command: IncrementalCommand,
  createIncrementalCompiler: CreateChemdIncrementalCompiler,
  options: LanguageCommandOptions
): number => {
  const compiler = createIncrementalCompiler();
  const results = command.filePaths.map((filePath) =>
    toIncrementalFileReport(
      filePath,
      compiler.compile(options.readSource(filePath, options.cwd), {}, { documentKey: filePath })
    )
  );
  const diagnostics = results.flatMap((item) => item.diagnostics);
  const report: IncrementalReport = {
    schemaVersion: "chemd-incremental/v0.1",
    codes: countDiagnosticCodes(diagnostics),
    results,
    snapshot: compiler.snapshot(),
    totals: mergeDiagnosticCounts(results.map((item) => item.counts))
  };
  const output = command.format === "json"
    ? JSON.stringify(report, null, 2)
    : formatIncrementalText(report);

  options.stdout.write(`${output}\n`);
  return report.totals.error > 0 ? 1 : 0;
};

const toLinkModuleReport = (
  module: LinkChemdModulesResult["modules"][number]
): LinkModuleReport => ({
  diagnostics: module.coreResult.diagnostics,
  documentId: module.documentId,
  ...(module.input.path ? { filePath: module.input.path } : {}),
  graph: summarizeTypedGraph(module.coreResult.typedSemanticGraph),
  moduleName: module.moduleName,
  references: collectReferenceSummaries(module.coreResult.typedSemanticGraph.nodes)
});

const summarizeTypedGraph = (
  graph: LinkChemdModulesResult["modules"][number]["coreResult"]["typedSemanticGraph"]
): LinkGraphSummary => ({
  nodeCount: graph.nodes.length,
  quantityCount: graph.quantities.length,
  stepCount: graph.nodes.filter((node) => node.kind === "step").length
});

const collectReferenceSummaries = (value: unknown): LinkReferenceSummary[] => {
  const references: LinkReferenceSummary[] = [];
  const seen = new Set<object>();
  collectReferences(value, seen, references);
  return uniqueReferenceSummaries(references);
};

const collectReferences = (
  value: unknown,
  seen: Set<object>,
  references: LinkReferenceSummary[]
): void => {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (isReferenceSummary(value)) {
    references.push({
      refId: value.refId,
      resolved: value.resolved,
      targetKind: value.targetKind
    });
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferences(item, seen, references));
    return;
  }
  Object.values(value).forEach((item) => collectReferences(item, seen, references));
};

const isReferenceSummary = (
  value: object
): value is LinkReferenceSummary & { kind: "reference" } =>
  (value as { kind?: unknown }).kind === "reference"
  && typeof (value as { refId?: unknown }).refId === "string"
  && typeof (value as { targetKind?: unknown }).targetKind === "string"
  && typeof (value as { resolved?: unknown }).resolved === "boolean";

const uniqueReferenceSummaries = (
  references: LinkReferenceSummary[]
): LinkReferenceSummary[] => {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.refId}:${reference.targetKind}:${reference.resolved}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toLinkReport = (result: LinkChemdModulesResult): LinkReport => ({
  schemaVersion: "chemd-link/v0.1",
  codes: countDiagnosticCodes(result.diagnostics),
  diagnostics: result.diagnostics,
  entry: {
    documentId: result.entry.documentId,
    ...(result.entry.input.path ? { filePath: result.entry.input.path } : {}),
    moduleName: result.entry.moduleName
  },
  importGraph: result.importGraph,
  modules: result.modules.map(toLinkModuleReport),
  totals: countDiagnostics(result.diagnostics)
});

const formatLinkText = (report: LinkReport): string => {
  const lines = [
    "Chemd module link",
    `  entry: ${report.entry.moduleName} (${report.entry.documentId})`,
    `  modules: ${report.modules.length}`,
    `  imports: ${report.importGraph.edges.length}`,
    `  diagnostics: ${report.totals.error} error(s), ${report.totals.warning} warning(s), ${report.totals.info} info`
  ];

  for (const module of report.modules) {
    const filePath = module.filePath ? ` ${module.filePath}` : "";
    lines.push(`  - ${module.moduleName} (${module.documentId})${filePath}`);
  }

  for (const edge of report.importGraph.edges) {
    const target = edge.toModule ? ` -> ${edge.toModule}` : "";
    lines.push(`  import ${edge.fromModule}: ${edge.importFrom} [${edge.status}]${target}`);
  }

  return lines.join("\n");
};

const toIncrementalFileReport = (
  filePath: string,
  output: ReturnType<ReturnType<CreateChemdIncrementalCompiler>["compile"]>
): IncrementalFileReport => {
  const diagnostics = output.result.diagnostics;
  return {
    cache: { ...output.cache },
    codes: countDiagnosticCodes(diagnostics),
    counts: countDiagnostics(diagnostics),
    diagnostics,
    filePath,
    program: {
      declarationCount: output.result.program.declarations.length,
      docCount: output.result.program.docs.length
    }
  };
};

const formatIncrementalText = (report: IncrementalReport): string => {
  const lines = [
    "Chemd incremental compile",
    `  files: ${report.results.length}`,
    `  diagnostics: ${report.totals.error} error(s), ${report.totals.warning} warning(s), ${report.totals.info} info`
  ];

  for (const item of report.results) {
    lines.push(
      `  - ${item.filePath}: ${item.cache.status} rev=${item.cache.revision} `
      + `${item.counts.error} error(s), ${item.counts.warning} warning(s)`
    );
  }

  return lines.join("\n");
};

const countDiagnostics = (diagnostics: Diagnostic[]): DiagnosticCounts =>
  diagnostics.reduce<DiagnosticCounts>((counts, diagnostic) => {
    if (diagnostic.severity === "error") counts.error += 1;
    else if (diagnostic.severity === "warning") counts.warning += 1;
    else counts.info += 1;
    return counts;
  }, { error: 0, info: 0, warning: 0 });

const countDiagnosticCodes = (diagnostics: Diagnostic[]): DiagnosticCodeCounts =>
  diagnostics.reduce<DiagnosticCodeCounts>((counts, diagnostic) => ({
    ...counts,
    [diagnostic.code]: (counts[diagnostic.code] ?? 0) + 1
  }), {});

const mergeDiagnosticCounts = (items: DiagnosticCounts[]): DiagnosticCounts =>
  items.reduce<DiagnosticCounts>(
    (total, item) => ({
      error: total.error + item.error,
      info: total.info + item.info,
      warning: total.warning + item.warning
    }),
    { error: 0, info: 0, warning: 0 }
  );

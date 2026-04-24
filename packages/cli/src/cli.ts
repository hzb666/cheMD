import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  ChemdAgentLoopAgent,
  ChemdAgentLoopResult,
  ChemdRepairLoopResult,
  CompileResult
} from "@chemd/compiler";
import type { Diagnostic } from "@chemd/core";

import {
  discoverChangedChemdFiles,
  readGitFileAtRef,
  type GitChangedFile,
  type GitRunner
} from "./git-changed";
import {
  buildSemanticDiff,
  formatSemanticDiffText,
  type SemanticDiff
} from "./semantic-diff";
import { createProcessAgentLoopDriver } from "./agent-driver";

const EXPORT_FORMATS = new Set(["json", "lnf", "rag", "training", "training-full"]);
const DIFF_FORMATS = new Set(["text", "json"]);
const FORMAT_OPTION = new Set<CliOption>(["format"]);
const CHANGED_OPTIONS = new Set<CliOption>(["base", "format"]);
const REPAIR_OPTIONS = new Set<CliOption>(["format", "max-iterations", "write"]);
const AGENT_LOOP_OPTIONS = new Set<CliOption>([
  "driver",
  "driver-arg",
  "format",
  "max-iterations",
  "max-repair-iterations",
  "write"
]);

export const EXIT_OK = 0;
export const EXIT_VALIDATION_FAILED = 1;
export const EXIT_USAGE = 2;

const usage = [
  "Usage:",
  "  chemd validate <file...>",
  "  chemd export <file> --format json|lnf|rag|training|training-full",
  "  chemd diff <old-file> <new-file> [--format text|json]",
  "  chemd changed [--base <ref>] [--format text|json]",
  "  chemd repair <file> [--format text|json] [--max-iterations <n>] [--write]",
  "  chemd agent-loop <file> --driver <cmd> [--driver-arg <arg> ...] [--format text|json] [--max-iterations <n>] [--max-repair-iterations <n>] [--write]"
].join("\n");

type ExportFormat = "json" | "lnf" | "rag" | "training" | "training-full";
type TextFormat = "text" | "json";
type CliOption =
  | "base"
  | "driver"
  | "driver-arg"
  | "format"
  | "max-iterations"
  | "max-repair-iterations"
  | "write";
type CompileChemd = (
  source: string,
  options?: { strictChemdKind?: boolean }
) => CompileResult;
type RunChemdAgentLoop = (
  source: string,
  options: {
    agent: ChemdAgentLoopAgent;
    compileOptions?: { strictChemdKind?: boolean };
    maxIterations?: number;
    repairMaxIterations?: number;
  }
) => Promise<ChemdAgentLoopResult>;
type RunChemdRepairLoop = (
  source: string,
  options?: {
    compileOptions?: { strictChemdKind?: boolean };
    maxIterations?: number;
  }
) => ChemdRepairLoopResult;

interface CliWriter {
  write(chunk: string): unknown;
}

type CliCommand =
  | { type: "help" }
  | { type: "validate"; filePaths: string[] }
  | { type: "export"; filePath: string; format: ExportFormat }
  | { type: "diff"; beforePath: string; afterPath: string; format: TextFormat }
  | { type: "changed"; base: string; format: TextFormat }
  | {
      type: "agent-loop";
      driverArgs: string[];
      driverCommand: string;
      filePath: string;
      format: TextFormat;
      maxIterations: number;
      maxRepairIterations: number;
      write: boolean;
    }
  | { type: "repair"; filePath: string; format: TextFormat; maxIterations: number; write: boolean };

interface RunOptions {
  compileChemd?: CompileChemd;
  cwd?: string;
  gitRunner?: GitRunner;
  runChemdAgentLoop?: RunChemdAgentLoop;
  runChemdRepairLoop?: RunChemdRepairLoop;
  stderr?: CliWriter;
  stdout?: CliWriter;
}

interface NormalizedRunOptions {
  compileChemd?: CompileChemd;
  cwd: string;
  gitRunner?: GitRunner;
  runChemdAgentLoop?: RunChemdAgentLoop;
  runChemdRepairLoop?: RunChemdRepairLoop;
  stderr: CliWriter;
  stdout: CliWriter;
}

interface DiagnosticCounts {
  error: number;
  warning: number;
  info: number;
}

interface ValidationReport {
  counts: DiagnosticCounts;
  diagnostics: Diagnostic[];
}

interface SkippedValidation {
  skipped: true;
  reason: string;
}

interface ChangedFileReport {
  path: string;
  status: string;
  previousPath?: string;
  validation: ValidationReport | SkippedValidation;
  diff?: SemanticDiff;
}

interface ChangedReport {
  schemaVersion: "chemd-changed/v0.1";
  base: string;
  files: ChangedFileReport[];
}

interface RepairReportIteration {
  iteration: number;
  diagnosisStatus: ChemdRepairLoopResult["finalResult"]["diagnosis"]["status"];
  summary: ChemdRepairLoopResult["finalResult"]["diagnosis"]["summary"];
  appliedSafeFixes: Array<{
    fixId: string;
    diagnosticCode: string;
    sourceField?: string;
    sourceNodeId?: string;
    title: string;
  }>;
}

interface RepairReport {
  schemaVersion: "chemd-repair/v0.1";
  changed: boolean;
  filePath: string;
  finalDiagnosis: ChemdRepairLoopResult["finalResult"]["diagnosis"];
  finalSource: string;
  iterations: RepairReportIteration[];
  maxIterations: number;
  stoppedReason: ChemdRepairLoopResult["stoppedReason"];
  writeRequested: boolean;
  wroteFile: boolean;
}

interface AgentLoopReportIteration {
  iteration: number;
  repairDiagnosisStatus: ChemdAgentLoopResult["finalResult"]["diagnosis"]["status"];
  repairStoppedReason: ChemdRepairLoopResult["stoppedReason"];
  summary: ChemdAgentLoopResult["finalResult"]["diagnosis"]["summary"];
  appliedSafeFixes: Array<{
    fixId: string;
    diagnosticCode: string;
    sourceField?: string;
    sourceNodeId?: string;
    title: string;
  }>;
  agentResponse?: {
    action: "rewrite" | "stop";
    changedSource: boolean;
    note?: string;
  };
}

interface AgentLoopReport {
  schemaVersion: "chemd-agent-loop/v0.1";
  changed: boolean;
  filePath: string;
  finalDiagnosis: ChemdAgentLoopResult["finalResult"]["diagnosis"];
  finalSource: string;
  iterations: AgentLoopReportIteration[];
  maxIterations: number;
  maxRepairIterations: number;
  stoppedReason: ChemdAgentLoopResult["stoppedReason"];
  writeRequested: boolean;
  wroteFile: boolean;
}

class CliUsageError extends Error {
  exitCode = EXIT_USAGE;
}

const asExportFormat = (format: string | undefined): ExportFormat => {
  if (format && EXPORT_FORMATS.has(format)) {
    return format as ExportFormat;
  }

  throw new CliUsageError("Export format must be one of: json, lnf, rag, training, training-full.");
};

const asTextFormat = (format: string | undefined, command: string): TextFormat => {
  if (format && DIFF_FORMATS.has(format)) {
    return format as TextFormat;
  }

  throw new CliUsageError(`${command} format must be one of: text, json.`);
};

const assertOptionAllowed = (
  optionName: CliOption,
  allowedOptions: ReadonlySet<CliOption>
) => {
  if (!allowedOptions.has(optionName)) {
    throw new CliUsageError(`Unsupported option: --${optionName}`);
  }
};

const readOptionValue = (
  args: string[],
  index: number,
  optionName: CliOption
): string => {
  const value = args[index + 1];
  const allowsDashValue = optionName === "driver-arg";
  if (!value || (!allowsDashValue && value.startsWith("-"))) {
    throw new CliUsageError(`Option --${optionName} requires a value.`);
  }

  return value;
};

const readInlineOptionValue = (arg: string, optionName: CliOption): string => {
  const value = arg.slice(`--${optionName}=`.length);
  if (!value) {
    throw new CliUsageError(`Option --${optionName} requires a value.`);
  }

  return value;
};

const parsePositiveIntegerOption = (
  value: string,
  optionName: "max-iterations" | "max-repair-iterations"
): number => {
  if (!/^\d+$/.test(value)) {
    throw new CliUsageError(`Option --${optionName} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`Option --${optionName} must be a positive integer.`);
  }

  return parsed;
};

interface ParsedOptionToken {
  consumedNext: boolean;
  name: CliOption;
  value?: string;
}

const parseOptionToken = (args: string[], index: number): ParsedOptionToken | undefined => {
  const arg = args[index];
  if (!arg.startsWith("--")) {
    return undefined;
  }

  if (arg === "--write") {
    return { consumedNext: false, name: "write" };
  }

  const equalsIndex = arg.indexOf("=");
  if (equalsIndex >= 0) {
    const name = arg.slice(2, equalsIndex) as CliOption;
    return {
      consumedNext: false,
      name,
      value: readInlineOptionValue(arg, name)
    };
  }

  const name = arg.slice(2) as CliOption;
  return {
    consumedNext: true,
    name,
    value: readOptionValue(args, index, name)
  };
};

const assignCommandOption = (
  option: ParsedOptionToken,
  allowedOptions: ReadonlySet<CliOption>,
  state: {
    base?: string;
    driver?: string;
    driverArgs: string[];
    format?: string;
    maxIterations?: number;
    maxRepairIterations?: number;
    write: boolean;
  }
): void => {
  assertOptionAllowed(option.name, allowedOptions);

  switch (option.name) {
    case "format":
      state.format = option.value;
      return;
    case "base":
      state.base = option.value;
      return;
    case "driver":
      state.driver = option.value;
      return;
    case "driver-arg":
      state.driverArgs.push(option.value ?? "");
      return;
    case "max-iterations":
      state.maxIterations = parsePositiveIntegerOption(option.value ?? "", "max-iterations");
      return;
    case "max-repair-iterations":
      state.maxRepairIterations = parsePositiveIntegerOption(
        option.value ?? "",
        "max-repair-iterations"
      );
      return;
    case "write":
      state.write = true;
      return;
    default:
      throw new CliUsageError(`Unsupported option: --${option.name}`);
  }
};

const parseCommandArgs = (args: string[], allowedOptions: ReadonlySet<CliOption>) => {
  const positional: string[] = [];
  const state: {
    base?: string;
    driver?: string;
    driverArgs: string[];
    format?: string;
    maxIterations?: number;
    maxRepairIterations?: number;
    write: boolean;
  } = {
    driverArgs: [],
    write: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("-") && !arg.startsWith("--")) {
      throw new CliUsageError(`Unsupported option: ${arg}`);
    }

    const option = parseOptionToken(args, index);
    if (!option) {
      positional.push(arg);
      continue;
    }

    assignCommandOption(option, allowedOptions, state);
    if (option.consumedNext) {
      index += 1;
    }
  }

  return {
    base: state.base,
    driver: state.driver,
    driverArgs: state.driverArgs,
    format: state.format,
    maxIterations: state.maxIterations,
    maxRepairIterations: state.maxRepairIterations,
    positional,
    write: state.write
  };
};

const parseExportArgs = (args: string[]): CliCommand => {
  const { format, positional } = parseCommandArgs(args, FORMAT_OPTION);

  if (positional.length !== 1) {
    throw new CliUsageError("Export requires exactly one file path.");
  }

  return { type: "export", filePath: positional[0], format: asExportFormat(format) };
};

const parseDiffArgs = (args: string[]): CliCommand => {
  const { format = "text", positional } = parseCommandArgs(args, FORMAT_OPTION);

  if (positional.length !== 2) {
    throw new CliUsageError("Diff requires exactly two file paths.");
  }

  return {
    type: "diff",
    beforePath: positional[0],
    afterPath: positional[1],
    format: asTextFormat(format, "Diff")
  };
};

const parseChangedArgs = (args: string[]): CliCommand => {
  const { base = "HEAD", format = "text", positional } = parseCommandArgs(args, CHANGED_OPTIONS);

  if (positional.length > 0) {
    throw new CliUsageError(`Unsupported changed argument: ${positional[0]}`);
  }

  if (!base) {
    throw new CliUsageError("Changed base ref cannot be empty.");
  }

  if (base.startsWith("-")) {
    throw new CliUsageError("Changed base ref cannot start with '-'.");
  }

  return { type: "changed", base, format: asTextFormat(format, "Changed") };
};

const parseRepairArgs = (args: string[]): CliCommand => {
  const {
    format = "text",
    maxIterations = 5,
    positional,
    write
  } = parseCommandArgs(args, REPAIR_OPTIONS);

  if (positional.length !== 1) {
    throw new CliUsageError("Repair requires exactly one file path.");
  }

  return {
    type: "repair",
    filePath: positional[0],
    format: asTextFormat(format, "Repair"),
    maxIterations,
    write
  };
};

const parseAgentLoopArgs = (args: string[]): CliCommand => {
  const {
    driver,
    driverArgs,
    format = "text",
    maxIterations = 5,
    maxRepairIterations = 5,
    positional,
    write
  } = parseCommandArgs(args, AGENT_LOOP_OPTIONS);

  if (positional.length !== 1) {
    throw new CliUsageError("Agent loop requires exactly one file path.");
  }

  if (!driver) {
    throw new CliUsageError("Agent loop requires --driver <cmd>.");
  }

  return {
    type: "agent-loop",
    driverArgs,
    driverCommand: driver,
    filePath: positional[0],
    format: asTextFormat(format, "Agent loop"),
    maxIterations,
    maxRepairIterations,
    write
  };
};

export const parseChemdCliArgs = (argv: string[]): CliCommand => {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    return { type: "help" };
  }

  if (command === "validate") {
    if (rest.length === 0) {
      throw new CliUsageError("Validate requires at least one file path.");
    }
    return { type: "validate", filePaths: rest };
  }

  if (command === "export") {
    return parseExportArgs(rest);
  }

  if (command === "diff") {
    return parseDiffArgs(rest);
  }

  if (command === "changed") {
    return parseChangedArgs(rest);
  }

  if (command === "repair") {
    return parseRepairArgs(rest);
  }

  if (command === "agent-loop") {
    return parseAgentLoopArgs(rest);
  }

  throw new CliUsageError(`Unknown command: ${command}`);
};

const loadCompiler = async (): Promise<{
  compileChemd: CompileChemd;
  runChemdAgentLoop: RunChemdAgentLoop;
  runChemdRepairLoop: RunChemdRepairLoop;
}> => import("@chemd/compiler");

const readSource = (filePath: string, cwd: string): string => {
  const resolvedPath = path.resolve(cwd, filePath);

  try {
    return readFileSync(resolvedPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`Unable to read file "${filePath}": ${message}`);
  }
};

const writeSource = (filePath: string, cwd: string, source: string): void => {
  const resolvedPath = path.resolve(cwd, filePath);

  try {
    writeFileSync(resolvedPath, source, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`Unable to write file "${filePath}": ${message}`);
  }
};

const countDiagnostics = (diagnostics: Diagnostic[]): DiagnosticCounts => ({
  error: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
  warning: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
  info: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length
});

const hasErrorDiagnostics = (diagnostics: Diagnostic[]): boolean =>
  countDiagnostics(diagnostics).error > 0;

const formatDiagnosticLocation = (diagnostic: Diagnostic): string => {
  const start = diagnostic.position?.start;

  return start ? `:${start.line}:${start.column}` : "";
};

const formatDiagnostic = (filePath: string, diagnostic: Diagnostic): string => [
  `${filePath}${formatDiagnosticLocation(diagnostic)}`,
  diagnostic.severity,
  diagnostic.code,
  diagnostic.message
].join(" ");

const writeDiagnosticResult = (
  writer: CliWriter,
  filePath: string,
  diagnostics: Diagnostic[]
) => {
  if (diagnostics.length === 0) {
    writer.write(`${filePath}: ok\n`);
    return;
  }

  const counts = countDiagnostics(diagnostics);
  writer.write(
    `${filePath}: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info\n`
  );

  for (const diagnostic of diagnostics) {
    writer.write(`${formatDiagnostic(filePath, diagnostic)}\n`);
  }
};

const writeErrorsIfPresent = (
  filePath: string,
  result: CompileResult,
  stderr: CliWriter
): boolean => {
  const diagnostics = result.diagnostics ?? [];
  if (!hasErrorDiagnostics(diagnostics)) {
    return false;
  }

  writeDiagnosticResult(stderr, filePath, diagnostics);
  return true;
};

const validateFiles = (
  command: Extract<CliCommand, { type: "validate" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): number => {
  let hasErrors = false;

  for (const filePath of command.filePaths) {
    const source = readSource(filePath, options.cwd);
    const result = compileChemd(source, { strictChemdKind: true });
    const diagnostics = result.diagnostics ?? [];
    hasErrors = hasErrors || hasErrorDiagnostics(diagnostics);
    writeDiagnosticResult(options.stdout, filePath, diagnostics);
  }

  return hasErrors ? EXIT_VALIDATION_FAILED : EXIT_OK;
};

const selectExportPayload = (result: CompileResult, format: ExportFormat): unknown => {
  if (format === "json") {
    return JSON.parse(result.json);
  }

  if (format === "lnf") {
    return result.lnf;
  }

  if (format === "rag") {
    return result.ragExport;
  }

  return format === "training" ? result.trainingUnderstanding : result.trainingExport;
};

const exportFile = (
  command: Extract<CliCommand, { type: "export" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): number => {
  const source = readSource(command.filePath, options.cwd);
  const result = compileChemd(source, { strictChemdKind: true });
  if (writeErrorsIfPresent(command.filePath, result, options.stderr)) {
    return EXIT_VALIDATION_FAILED;
  }

  const payload = selectExportPayload(result, command.format);

  options.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return EXIT_OK;
};

const compileSourceFile = (
  filePath: string,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): CompileResult => {
  const source = readSource(filePath, options.cwd);
  return compileChemd(source, { strictChemdKind: true });
};

const diffFiles = (
  command: Extract<CliCommand, { type: "diff" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): number => {
  const before = compileSourceFile(command.beforePath, compileChemd, options);
  const after = compileSourceFile(command.afterPath, compileChemd, options);
  const beforeHasErrors = writeErrorsIfPresent(command.beforePath, before, options.stderr);
  const afterHasErrors = writeErrorsIfPresent(command.afterPath, after, options.stderr);

  if (beforeHasErrors || afterHasErrors) {
    return EXIT_VALIDATION_FAILED;
  }

  const diff = buildSemanticDiff(before.document, after.document);
  const output = command.format === "json"
    ? JSON.stringify(diff, null, 2)
    : formatSemanticDiffText(diff);

  options.stdout.write(`${output}\n`);
  return EXIT_OK;
};

const compileSource = (source: string, compileChemd: CompileChemd): CompileResult =>
  compileChemd(source, { strictChemdKind: true });

const compileCurrentChangedFile = (
  record: GitChangedFile,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): CompileResult | undefined =>
  record.status === "D" ? undefined : compileSourceFile(record.path, compileChemd, options);

const buildChangedFileReport = (
  record: GitChangedFile,
  command: Extract<CliCommand, { type: "changed" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): ChangedFileReport => {
  const current = compileCurrentChangedFile(record, compileChemd, options);
  const diagnostics = current?.diagnostics ?? [];
  const report: ChangedFileReport = {
    path: record.path,
    status: record.status,
    ...(record.previousPath ? { previousPath: record.previousPath } : {}),
    validation: current
      ? { counts: countDiagnostics(diagnostics), diagnostics }
      : { skipped: true, reason: "deleted" }
  };

  if (record.status === "D" || record.status === "?" || record.status === "A" || !current) {
    return report;
  }

  const basePath = record.previousPath ?? record.path;
  const beforeSource = readGitFileAtRef({
    base: command.base,
    cwd: options.cwd,
    filePath: basePath,
    gitRunner: options.gitRunner
  });
  const before = compileSource(beforeSource, compileChemd);

  return {
    ...report,
    diff: buildSemanticDiff(before.document, current.document)
  };
};

const buildChangedReport = (
  command: Extract<CliCommand, { type: "changed" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): ChangedReport => {
  const files = discoverChangedChemdFiles({
    base: command.base,
    cwd: options.cwd,
    gitRunner: options.gitRunner
  });

  return {
    schemaVersion: "chemd-changed/v0.1",
    base: command.base,
    files: files.map((record) => buildChangedFileReport(record, command, compileChemd, options))
  };
};

const formatValidationSummary = (validation: ChangedFileReport["validation"]): string => {
  if ("skipped" in validation) {
    return `validation: skipped (${validation.reason})`;
  }

  const { error, warning, info } = validation.counts;
  return `validation: ${error} error(s), ${warning} warning(s), ${info} info`;
};

const indent = (value: string): string =>
  value.split("\n").map((line) => `    ${line}`).join("\n");

const formatChangedFileText = (file: ChangedFileReport): string => {
  const lines = [`${file.status} ${file.path}`, `  ${formatValidationSummary(file.validation)}`];

  if (file.diff) {
    lines.push("  semantic diff:");
    lines.push(indent(formatSemanticDiffText(file.diff)));
  } else if (file.status === "?" || file.status === "A") {
    lines.push("  semantic diff: new file");
  } else if (file.status === "D") {
    lines.push("  semantic diff: deleted file");
  }

  return lines.join("\n");
};

const formatChangedText = (report: ChangedReport): string => {
  if (report.files.length === 0) {
    return "No changed .chemd.md files.";
  }

  return [
    `Changed .chemd.md files against ${report.base}:`,
    ...report.files.map((file) => formatChangedFileText(file))
  ].join("\n");
};

const hasChangedValidationErrors = (report: ChangedReport): boolean =>
  report.files.some((file) =>
    !("skipped" in file.validation) && file.validation.counts.error > 0
  );

const changedFiles = (
  command: Extract<CliCommand, { type: "changed" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): number => {
  const report = buildChangedReport(command, compileChemd, options);
  const output = command.format === "json"
    ? JSON.stringify(report, null, 2)
    : formatChangedText(report);

  options.stdout.write(`${output}\n`);
  return hasChangedValidationErrors(report) ? EXIT_VALIDATION_FAILED : EXIT_OK;
};

const toRepairReport = (
  command: Extract<CliCommand, { type: "repair" }>,
  filePath: string,
  result: ChemdRepairLoopResult,
  wroteFile: boolean
): RepairReport => ({
  schemaVersion: "chemd-repair/v0.1",
  changed: result.changed,
  filePath,
  finalDiagnosis: result.finalResult.diagnosis,
  finalSource: result.finalSource,
  iterations: result.iterations.map((iteration) => ({
    iteration: iteration.iteration,
    diagnosisStatus: iteration.compileResult.diagnosis.status,
    summary: iteration.compileResult.diagnosis.summary,
    appliedSafeFixes: iteration.appliedSafeFixes.map((fix) => ({
      fixId: fix.fixId,
      diagnosticCode: fix.diagnosticCode,
      sourceField: fix.sourceField,
      sourceNodeId: fix.sourceNodeId,
      title: fix.quickFix.title
    }))
  })),
  maxIterations: command.maxIterations,
  stoppedReason: result.stoppedReason,
  writeRequested: command.write,
  wroteFile
});

const formatRepairText = (report: RepairReport): string => {
  const lines = [
    `Repair ${report.filePath}`,
    `  stopped: ${report.stoppedReason}`,
    `  final status: ${report.finalDiagnosis.status}`,
    `  iterations: ${report.iterations.length}/${report.maxIterations}`,
    `  changed: ${report.changed ? "yes" : "no"}`,
    `  wrote file: ${report.wroteFile ? "yes" : "no"}`,
    `  final diagnostics: ${report.finalDiagnosis.summary.errorCount} error(s), ${report.finalDiagnosis.summary.warningCount} warning(s), ${report.finalDiagnosis.summary.infoCount} info`,
    `  safe fixes applied: ${report.iterations.reduce((count, iteration) => count + iteration.appliedSafeFixes.length, 0)}`
  ];

  if (report.finalDiagnosis.requiredInputs.length > 0) {
    lines.push("  required inputs:");
    for (const item of report.finalDiagnosis.requiredInputs) {
      lines.push(`    - ${item.title}`);
      for (const missingItem of item.missingItems) {
        lines.push(`      * ${missingItem}`);
      }
    }
  }

  if (report.finalDiagnosis.manualReviewItems.length > 0) {
    lines.push("  manual review:");
    for (const item of report.finalDiagnosis.manualReviewItems) {
      lines.push(`    - ${item.diagnosticCode}: ${item.message}`);
    }
  }

  if (!report.writeRequested && report.changed && report.finalDiagnosis.status === "clean") {
    lines.push("  repaired source:");
    lines.push(report.finalSource);
  }

  return lines.join("\n");
};

const repairFile = (
  command: Extract<CliCommand, { type: "repair" }>,
  runChemdRepairLoop: RunChemdRepairLoop,
  options: NormalizedRunOptions
): number => {
  const source = readSource(command.filePath, options.cwd);
  const repairResult = runChemdRepairLoop(source, {
    compileOptions: { strictChemdKind: true },
    maxIterations: command.maxIterations
  });
  const shouldWrite = command.write
    && repairResult.changed
    && repairResult.finalResult.diagnosis.status === "clean";

  if (shouldWrite) {
    writeSource(command.filePath, options.cwd, repairResult.finalSource);
  }

  const report = toRepairReport(command, command.filePath, repairResult, shouldWrite);
  const output = command.format === "json"
    ? JSON.stringify(report, null, 2)
    : formatRepairText(report);

  options.stdout.write(`${output}\n`);
  return repairResult.finalResult.diagnosis.status === "clean"
    ? EXIT_OK
    : EXIT_VALIDATION_FAILED;
};

const toAgentLoopReport = (
  command: Extract<CliCommand, { type: "agent-loop" }>,
  filePath: string,
  result: ChemdAgentLoopResult,
  wroteFile: boolean
): AgentLoopReport => ({
  schemaVersion: "chemd-agent-loop/v0.1",
  changed: result.changed,
  filePath,
  finalDiagnosis: result.finalResult.diagnosis,
  finalSource: result.finalSource,
  iterations: result.iterations.map((iteration) => ({
    iteration: iteration.iteration,
    repairDiagnosisStatus: iteration.repairResult.finalResult.diagnosis.status,
    repairStoppedReason: iteration.repairResult.stoppedReason,
    summary: iteration.repairResult.finalResult.diagnosis.summary,
    appliedSafeFixes: iteration.repairResult.totalAppliedSafeFixes.map((fix) => ({
      fixId: fix.fixId,
      diagnosticCode: fix.diagnosticCode,
      sourceField: fix.sourceField,
      sourceNodeId: fix.sourceNodeId,
      title: fix.quickFix.title
    })),
    ...(iteration.agentResponse
      ? {
          agentResponse: {
            action: iteration.agentResponse.action,
            changedSource: iteration.agentResponse.changedSource,
            ...(iteration.agentResponse.note ? { note: iteration.agentResponse.note } : {})
          }
        }
      : {})
  })),
  maxIterations: command.maxIterations,
  maxRepairIterations: command.maxRepairIterations,
  stoppedReason: result.stoppedReason,
  writeRequested: command.write,
  wroteFile
});

const appendRequiredInputs = (
  lines: string[],
  finalDiagnosis: AgentLoopReport["finalDiagnosis"]
): void => {
  if (finalDiagnosis.requiredInputs.length === 0) {
    return;
  }

  lines.push("  required inputs:");
  for (const item of finalDiagnosis.requiredInputs) {
    lines.push(`    - ${item.title}`);
    for (const missingItem of item.missingItems) {
      lines.push(`      * ${missingItem}`);
    }
  }
};

const appendManualReviewItems = (
  lines: string[],
  finalDiagnosis: AgentLoopReport["finalDiagnosis"]
): void => {
  if (finalDiagnosis.manualReviewItems.length === 0) {
    return;
  }

  lines.push("  manual review:");
  for (const item of finalDiagnosis.manualReviewItems) {
    lines.push(`    - ${item.diagnosticCode}: ${item.message}`);
  }
};

const formatAgentLoopIteration = (iteration: AgentLoopReportIteration): string[] => {
  const agentLine = iteration.agentResponse
    ? `; agent=${iteration.agentResponse.action}${iteration.agentResponse.changedSource ? " changed" : " unchanged"}`
    : "";
  const lines = [
    `  - iteration ${iteration.iteration}: repair=${iteration.repairStoppedReason}; diagnosis=${iteration.repairDiagnosisStatus}${agentLine}`
  ];

  if (iteration.agentResponse?.note) {
    lines.push(`      note: ${iteration.agentResponse.note}`);
  }

  return lines;
};

const formatAgentLoopText = (report: AgentLoopReport): string => {
  const lines = [
    `Agent loop ${report.filePath}`,
    `  stopped: ${report.stoppedReason}`,
    `  final status: ${report.finalDiagnosis.status}`,
    `  iterations: ${report.iterations.length}/${report.maxIterations}`,
    `  repair max iterations: ${report.maxRepairIterations}`,
    `  changed: ${report.changed ? "yes" : "no"}`,
    `  wrote file: ${report.wroteFile ? "yes" : "no"}`,
    `  final diagnostics: ${report.finalDiagnosis.summary.errorCount} error(s), ${report.finalDiagnosis.summary.warningCount} warning(s), ${report.finalDiagnosis.summary.infoCount} info`,
    `  safe fixes applied: ${report.iterations.reduce((count, iteration) => count + iteration.appliedSafeFixes.length, 0)}`
  ];

  for (const iteration of report.iterations) {
    lines.push(...formatAgentLoopIteration(iteration));
  }

  appendRequiredInputs(lines, report.finalDiagnosis);
  appendManualReviewItems(lines, report.finalDiagnosis);

  if (!report.writeRequested && report.changed && report.finalDiagnosis.status === "clean") {
    lines.push("  final source:");
    lines.push(report.finalSource);
  }

  return lines.join("\n");
};

const agentLoopFile = async (
  command: Extract<CliCommand, { type: "agent-loop" }>,
  runChemdAgentLoop: RunChemdAgentLoop,
  options: NormalizedRunOptions
): Promise<number> => {
  const source = readSource(command.filePath, options.cwd);
  const driver = createProcessAgentLoopDriver({
    args: command.driverArgs,
    command: command.driverCommand,
    cwd: options.cwd,
    filePath: command.filePath
  });
  const agentLoopResult = await runChemdAgentLoop(source, {
    agent: driver,
    compileOptions: { strictChemdKind: true },
    maxIterations: command.maxIterations,
    repairMaxIterations: command.maxRepairIterations
  });
  const shouldWrite = command.write
    && agentLoopResult.changed
    && agentLoopResult.finalResult.diagnosis.status === "clean";

  if (shouldWrite) {
    writeSource(command.filePath, options.cwd, agentLoopResult.finalSource);
  }

  const report = toAgentLoopReport(command, command.filePath, agentLoopResult, shouldWrite);
  const output = command.format === "json"
    ? JSON.stringify(report, null, 2)
    : formatAgentLoopText(report);

  options.stdout.write(`${output}\n`);
  return agentLoopResult.finalResult.diagnosis.status === "clean"
    ? EXIT_OK
    : EXIT_VALIDATION_FAILED;
};

const normalizeRunOptions = (options: RunOptions): NormalizedRunOptions => ({
  compileChemd: options.compileChemd,
  cwd: options.cwd ?? process.cwd(),
  gitRunner: options.gitRunner,
  runChemdAgentLoop: options.runChemdAgentLoop,
  runChemdRepairLoop: options.runChemdRepairLoop,
  stderr: options.stderr ?? process.stderr,
  stdout: options.stdout ?? process.stdout
});

const executeCommand = (
  command: Exclude<CliCommand, { type: "help" }>,
  compileChemd: CompileChemd,
  runChemdAgentLoop: RunChemdAgentLoop,
  runChemdRepairLoop: RunChemdRepairLoop,
  options: NormalizedRunOptions
): Promise<number> => {
  if (command.type === "validate") {
    return Promise.resolve(validateFiles(command, compileChemd, options));
  }

  if (command.type === "export") {
    return Promise.resolve(exportFile(command, compileChemd, options));
  }

  if (command.type === "diff") {
    return Promise.resolve(diffFiles(command, compileChemd, options));
  }

  if (command.type === "changed") {
    return Promise.resolve(changedFiles(command, compileChemd, options));
  }

  if (command.type === "repair") {
    return Promise.resolve(repairFile(command, runChemdRepairLoop, options));
  }

  return agentLoopFile(command, runChemdAgentLoop, options);
};

export const runChemdCli = async (
  argv: string[],
  rawOptions: RunOptions = {}
): Promise<number> => {
  const options = normalizeRunOptions(rawOptions);

  try {
    const command = parseChemdCliArgs(argv);
    if (command.type === "help") {
      options.stdout.write(`${usage}\n`);
      return EXIT_OK;
    }

    const compiler = await loadCompiler();
    const compileChemd = options.compileChemd ?? compiler.compileChemd;
    const runChemdAgentLoop = options.runChemdAgentLoop ?? compiler.runChemdAgentLoop;
    const runChemdRepairLoop = options.runChemdRepairLoop ?? compiler.runChemdRepairLoop;

    return executeCommand(command, compileChemd, runChemdAgentLoop, runChemdRepairLoop, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof CliUsageError) {
      options.stderr.write(`${message}\n\n${usage}\n`);
      return error.exitCode;
    }

    options.stderr.write(`${message}\n`);
    return EXIT_USAGE;
  }
};

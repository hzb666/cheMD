import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  BuildTrainingGraphIndexOptions,
  ChemdAgentLoopAgent,
  ChemdAgentLoopResult,
  ChemdTrainingGraphIndexV1,
  ChemdRepairLoopResult,
  CompileOptions,
  CompileResult
} from "@chemd/compiler";
import type { Diagnostic } from "@chemd/core";
import {
  getDomainTemplate,
  listDomainTemplates,
  renderDomainTemplate,
  type DomainTemplate,
  type DomainTemplateSummary
} from "@chemd/domain-templates";
import type {
  ImportDiagnostic,
  ProseToChemdResult
} from "@chemd/importer-prose";
import {
  DEFAULT_RUNTIME_CAPABILITIES,
  preflightRun,
  type RuntimeContext,
  type RuntimeMode
} from "@chemd/runtime-lab";

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
const CHECK_TARGETS = new Set(["validate", "run-plan", "training", "graph"]);
const VALIDATE_OPTIONS = new Set<CliOption>(["dry-run"]);
const FORMAT_OPTION = new Set<CliOption>(["format"]);
const CHECK_OPTIONS = new Set<CliOption>(["dry-run", "format", "target"]);
const PREFLIGHT_OPTIONS = new Set<CliOption>(["context", "dry-run", "format", "mode"]);
const TEMPLATES_OPTIONS = new Set<CliOption>(["json"]);
const NEW_OPTIONS = new Set<CliOption>(["dry-run", "out"]);
const IMPORT_OPTIONS = new Set<CliOption>(["dry-run", "format", "out"]);
const CHANGED_OPTIONS = new Set<CliOption>(["base", "format"]);
const FIX_OPTIONS = new Set<CliOption>(["format", "max-iterations", "write"]);
const AGENT_LOOP_OPTIONS = new Set<CliOption>([
  "driver",
  "driver-arg",
  "format",
  "max-iterations",
  "max-fix-iterations",
  "write"
]);

export const EXIT_OK = 0;
export const EXIT_VALIDATION_FAILED = 1;
export const EXIT_USAGE = 2;

const usage = [
  "Usage:",
  "  chemd validate <file...> [--dry-run]",
  "  chemd check <path...> [--target validate|run-plan|training|graph] [--format text|json] [--dry-run]",
  "  chemd preflight <file> [--mode dry-run|human-run|robot-run|replay-run] [--context lab.json] [--format text|json] [--dry-run]",
  "  chemd export <file> --format json|lnf|rag|training|training-full",
  "  chemd templates [template-id] [--json]",
  "  chemd new <template-id> --out <file> [--dry-run]",
  "  chemd import prose <file> [--out <file>] [--format text|json] [--dry-run]",
  "  chemd graph <file...> [--format text|json]",
  "  chemd diff <old-file> <new-file> [--format text|json]",
  "  chemd changed [--base <ref>] [--format text|json]",
  "  chemd fix <file> [--format text|json] [--max-iterations <n>] [--write]",
  "  chemd agent-loop <file> --driver <cmd> [--driver-arg <arg> ...] [--format text|json] [--max-iterations <n>] [--max-fix-iterations <n>] [--write]"
].join("\n");

type ExportFormat = "json" | "lnf" | "rag" | "training" | "training-full";
type TextFormat = "text" | "json";
type CheckTarget = "validate" | "run-plan" | "training" | "graph";
type CliOption =
  | "base"
  | "context"
  | "driver"
  | "driver-arg"
  | "dry-run"
  | "format"
  | "json"
  | "max-fix-iterations"
  | "max-iterations"
  | "mode"
  | "out"
  | "target"
  | "write";
type CompileChemd = (source: string, options?: CompileOptions) => CompileResult;
type BuildTrainingGraphIndex = (
  understandings: CompileResult["trainingUnderstanding"][],
  options?: BuildTrainingGraphIndexOptions
) => ChemdTrainingGraphIndexV1;
type RunChemdAgentLoop = (
  source: string,
  options: {
    agent: ChemdAgentLoopAgent;
    compileOptions?: CompileOptions;
    maxIterations?: number;
    repairMaxIterations?: number;
  }
) => Promise<ChemdAgentLoopResult>;
type RunChemdRepairLoop = (
  source: string,
  options?: {
    compileOptions?: CompileOptions;
    maxIterations?: number;
  }
) => ChemdRepairLoopResult;
type ImportProseToChemd = typeof import("@chemd/importer-prose")["importProseToChemd"];

interface CliWriter {
  write(chunk: string): unknown;
}

type CliCommand =
  | { type: "help" }
  | { type: "validate"; dryRun: boolean; filePaths: string[] }
  | { type: "check"; dryRun: boolean; format: TextFormat; paths: string[]; target: CheckTarget }
  | { type: "preflight"; contextPath?: string; dryRun: boolean; filePath: string; format: TextFormat; mode: RuntimeMode }
  | { type: "export"; filePath: string; format: ExportFormat }
  | { type: "templates"; json: boolean; templateId?: string }
  | { type: "new"; dryRun: boolean; outPath: string; templateId: string }
  | { type: "import-prose"; dryRun: boolean; filePath: string; format: TextFormat; outPath?: string }
  | { type: "graph"; filePaths: string[]; format: TextFormat }
  | { type: "diff"; beforePath: string; afterPath: string; format: TextFormat }
  | { type: "changed"; base: string; format: TextFormat }
  | {
      type: "agent-loop";
      driverArgs: string[];
      driverCommand: string;
      filePath: string;
      format: TextFormat;
      maxIterations: number;
      maxFixIterations: number;
      write: boolean;
    }
  | { type: "fix"; filePath: string; format: TextFormat; maxIterations: number; write: boolean };

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
  filePath?: string;
  counts: DiagnosticCounts;
  diagnostics: Diagnostic[];
}

interface CheckReport {
  schemaVersion: "chemd-check/v0.1";
  dryRun: boolean;
  files: ValidationReport[];
  target: CheckTarget;
  totals: DiagnosticCounts;
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

interface ProseImportCliReport {
  schemaVersion: "chemd-import-prose/v0.1";
  chemd: string;
  compilerDiagnosticCounts: DiagnosticCounts;
  compilerDiagnostics: Diagnostic[];
  dryRun: boolean;
  filePath: string;
  importDiagnosticCounts: DiagnosticCounts;
  importDiagnostics: readonly ImportDiagnostic[];
  materialCount: number;
  observationCount: number;
  outPath?: string;
  quantityCount: number;
  stepCount: number;
  valid: boolean;
  wroteFile: boolean;
}

interface FixReportIteration {
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

interface FixReport {
  schemaVersion: "chemd-fix/v0.1";
  changed: boolean;
  filePath: string;
  finalDiagnosis: ChemdRepairLoopResult["finalResult"]["diagnosis"];
  finalSource: string;
  iterations: FixReportIteration[];
  maxIterations: number;
  stoppedReason: ChemdRepairLoopResult["stoppedReason"];
  writeRequested: boolean;
  wroteFile: boolean;
}

interface AgentLoopReportIteration {
  iteration: number;
  fixDiagnosisStatus: ChemdAgentLoopResult["finalResult"]["diagnosis"]["status"];
  fixStoppedReason: ChemdRepairLoopResult["stoppedReason"];
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
  maxFixIterations: number;
  stoppedReason: ChemdAgentLoopResult["stoppedReason"];
  writeRequested: boolean;
  wroteFile: boolean;
}

interface CliCompilerServices {
  buildTrainingGraphIndex: BuildTrainingGraphIndex;
  compileChemd: CompileChemd;
  runChemdAgentLoop: RunChemdAgentLoop;
  runChemdRepairLoop: RunChemdRepairLoop;
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

const asCheckTarget = (target: string | undefined): CheckTarget => {
  if (!target || CHECK_TARGETS.has(target)) {
    return (target ?? "validate") as CheckTarget;
  }

  throw new CliUsageError("Check target must be one of: validate, run-plan, training, graph.");
};

const asRuntimeMode = (mode: string | undefined): RuntimeMode => {
  const value = mode ?? "dry-run";
  if (["dry-run", "human-run", "robot-run", "replay-run"].includes(value)) {
    return value as RuntimeMode;
  }

  throw new CliUsageError("Preflight mode must be one of: dry-run, human-run, robot-run, replay-run.");
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
  optionName: "max-iterations" | "max-fix-iterations"
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

  if (arg === "--write" || arg === "--dry-run" || arg === "--json") {
    return { consumedNext: false, name: arg.slice(2) as CliOption };
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
    context?: string;
    driver?: string;
    driverArgs: string[];
    dryRun: boolean;
    format?: string;
    json: boolean;
    maxIterations?: number;
    maxFixIterations?: number;
    mode?: string;
    out?: string;
    target?: string;
    write: boolean;
  }
): void => {
  assertOptionAllowed(option.name, allowedOptions);

  switch (option.name) {
    case "format":
      state.format = option.value;
      return;
    case "json":
      state.json = true;
      return;
    case "base":
      state.base = option.value;
      return;
    case "context":
      state.context = option.value;
      return;
    case "driver":
      state.driver = option.value;
      return;
    case "driver-arg":
      state.driverArgs.push(option.value ?? "");
      return;
    case "dry-run":
      state.dryRun = true;
      return;
    case "max-iterations":
      state.maxIterations = parsePositiveIntegerOption(option.value ?? "", "max-iterations");
      return;
    case "max-fix-iterations":
      state.maxFixIterations = parsePositiveIntegerOption(
        option.value ?? "",
        "max-fix-iterations"
      );
      return;
    case "mode":
      state.mode = option.value;
      return;
    case "out":
      state.out = option.value;
      return;
    case "target":
      state.target = option.value;
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
    context?: string;
    driver?: string;
    driverArgs: string[];
    dryRun: boolean;
    format?: string;
    json: boolean;
    maxIterations?: number;
    maxFixIterations?: number;
    mode?: string;
    out?: string;
    target?: string;
    write: boolean;
  } = {
    driverArgs: [],
    dryRun: false,
    json: false,
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
    context: state.context,
    driver: state.driver,
    driverArgs: state.driverArgs,
    dryRun: state.dryRun,
    format: state.format,
    json: state.json,
    maxIterations: state.maxIterations,
    maxFixIterations: state.maxFixIterations,
    mode: state.mode,
    out: state.out,
    positional,
    target: state.target,
    write: state.write
  };
};

const parseValidateArgs = (args: string[]): CliCommand => {
  const { dryRun, positional } = parseCommandArgs(args, VALIDATE_OPTIONS);

  if (positional.length === 0) {
    throw new CliUsageError("Validate requires at least one file path.");
  }

  return { type: "validate", dryRun, filePaths: positional };
};

const parseCheckArgs = (args: string[]): CliCommand => {
  const { dryRun, format = "text", positional, target } = parseCommandArgs(args, CHECK_OPTIONS);

  if (positional.length === 0) {
    throw new CliUsageError("Check requires at least one file or directory path.");
  }

  return {
    type: "check",
    dryRun,
    format: asTextFormat(format, "Check"),
    paths: positional,
    target: asCheckTarget(target)
  };
};

const parsePreflightArgs = (args: string[]): CliCommand => {
  const {
    context,
    dryRun,
    format = "text",
    mode,
    positional
  } = parseCommandArgs(args, PREFLIGHT_OPTIONS);

  if (positional.length !== 1) {
    throw new CliUsageError("Preflight requires exactly one file path.");
  }

  return {
    type: "preflight",
    ...(context ? { contextPath: context } : {}),
    dryRun,
    filePath: positional[0],
    format: asTextFormat(format, "Preflight"),
    mode: asRuntimeMode(mode)
  };
};

const parseExportArgs = (args: string[]): CliCommand => {
  const { format, positional } = parseCommandArgs(args, FORMAT_OPTION);

  if (positional.length !== 1) {
    throw new CliUsageError("Export requires exactly one file path.");
  }

  return { type: "export", filePath: positional[0], format: asExportFormat(format) };
};

const parseTemplatesArgs = (args: string[]): CliCommand => {
  const { json, positional } = parseCommandArgs(args, TEMPLATES_OPTIONS);

  if (positional.length > 1) {
    throw new CliUsageError("Templates accepts at most one template id.");
  }

  return {
    type: "templates",
    json,
    ...(positional[0] ? { templateId: positional[0] } : {})
  };
};

const parseNewArgs = (args: string[]): CliCommand => {
  const { dryRun, out, positional } = parseCommandArgs(args, NEW_OPTIONS);

  if (positional.length !== 1) {
    throw new CliUsageError("New requires exactly one template id.");
  }

  if (!out) {
    throw new CliUsageError("New requires --out <file>.");
  }

  return {
    type: "new",
    dryRun,
    outPath: out,
    templateId: positional[0]
  };
};

const parseImportArgs = (args: string[]): CliCommand => {
  const {
    dryRun,
    format = "text",
    out,
    positional
  } = parseCommandArgs(args, IMPORT_OPTIONS);

  if (positional.length !== 2 || positional[0] !== "prose") {
    throw new CliUsageError("Import requires: import prose <file>.");
  }

  return {
    type: "import-prose",
    dryRun,
    filePath: positional[1],
    format: asTextFormat(format, "Import"),
    ...(out ? { outPath: out } : {})
  };
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

const parseGraphArgs = (args: string[]): CliCommand => {
  const { format = "text", positional } = parseCommandArgs(args, FORMAT_OPTION);

  if (positional.length === 0) {
    throw new CliUsageError("Graph requires at least one file path.");
  }

  return {
    type: "graph",
    filePaths: positional,
    format: asTextFormat(format, "Graph")
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

const parseFixArgs = (args: string[]): CliCommand => {
  const {
    format = "text",
    maxIterations = 5,
    positional,
    write
  } = parseCommandArgs(args, FIX_OPTIONS);

  if (positional.length !== 1) {
    throw new CliUsageError("Fix requires exactly one file path.");
  }

  return {
    type: "fix",
    filePath: positional[0],
    format: asTextFormat(format, "Fix"),
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
    maxFixIterations = 5,
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
    maxFixIterations,
    write
  };
};

export const parseChemdCliArgs = (argv: string[]): CliCommand => {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    return { type: "help" };
  }

  if (command === "validate") {
    return parseValidateArgs(rest);
  }

  if (command === "check") {
    return parseCheckArgs(rest);
  }

  if (command === "preflight") {
    return parsePreflightArgs(rest);
  }

  if (command === "export") {
    return parseExportArgs(rest);
  }

  if (command === "templates") {
    return parseTemplatesArgs(rest);
  }

  if (command === "new") {
    return parseNewArgs(rest);
  }

  if (command === "import") {
    return parseImportArgs(rest);
  }

  if (command === "graph") {
    return parseGraphArgs(rest);
  }

  if (command === "diff") {
    return parseDiffArgs(rest);
  }

  if (command === "changed") {
    return parseChangedArgs(rest);
  }

  if (command === "fix") {
    return parseFixArgs(rest);
  }

  if (command === "agent-loop") {
    return parseAgentLoopArgs(rest);
  }

  throw new CliUsageError(`Unknown command: ${command}`);
};

const loadCompiler = async (): Promise<{
  buildTrainingGraphIndexFromUnderstandings: BuildTrainingGraphIndex;
  compileChemd: CompileChemd;
  runChemdAgentLoop: RunChemdAgentLoop;
  runChemdRepairLoop: RunChemdRepairLoop;
}> => import("@chemd/compiler");

const loadImporterProse = async (): Promise<{
  importProseToChemd: ImportProseToChemd;
}> => import("@chemd/importer-prose");

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

const countImportDiagnostics = (
  diagnostics: readonly ImportDiagnostic[]
): DiagnosticCounts => ({
  error: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
  warning: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
  info: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length
});

const hasErrorDiagnostics = (diagnostics: Diagnostic[]): boolean =>
  countDiagnostics(diagnostics).error > 0;

const getTargetDiagnostics = (
  result: CompileResult,
  target: CheckTarget
): Diagnostic[] => {
  if (target !== "training") {
    return result.diagnostics ?? [];
  }

  const governanceDiagnostics = getTrainingGovernanceDiagnostics(result);
  const reviewDiagnostic: Diagnostic[] = result.trainingExport.quality_layer.training_quality.review_required
    ? [{
        code: "W_TRAINING_REVIEW_REQUIRED",
        severity: "warning",
        message: "Training export requires review before non-audit reuse.",
        sourceLayer: "exporter-training",
        sourceNodeType: "document",
        sourceField: "governance",
        facts: {
          review_reasons: result.trainingExport.quality_layer.training_quality.review_reasons ?? []
        }
      }]
    : [];

  return [
    ...(result.diagnostics ?? []),
    ...governanceDiagnostics,
    ...reviewDiagnostic
  ];
};

const getTrainingGovernanceDiagnostics = (
  result: CompileResult
): Diagnostic[] =>
  result.trainingExport.quality_layer.governance_quality.diagnostics
    .map((diagnostic): Diagnostic => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      sourceLayer: "exporter-training",
      sourceNodeType: "document",
      sourceField: "governance"
    }));

const getExportDiagnostics = (
  result: CompileResult,
  format: ExportFormat
): Diagnostic[] => {
  if (format === "training") {
    return getTargetDiagnostics(result, "training");
  }

  if (format === "rag") {
    return [
      ...(result.diagnostics ?? []),
      ...getTrainingGovernanceDiagnostics(result)
    ];
  }

  return result.diagnostics ?? [];
};

const sumDiagnosticCounts = (reports: ValidationReport[]): DiagnosticCounts =>
  reports.reduce<DiagnosticCounts>(
    (total, report) => ({
      error: total.error + report.counts.error,
      info: total.info + report.counts.info,
      warning: total.warning + report.counts.warning
    }),
    { error: 0, warning: 0, info: 0 }
  );

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

const writeDiagnosticsErrorsIfPresent = (
  filePath: string,
  diagnostics: Diagnostic[],
  stderr: CliWriter
): boolean => {
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
    const result = compileChemd(source);
    const diagnostics = result.diagnostics ?? [];
    hasErrors = hasErrors || hasErrorDiagnostics(diagnostics);
    writeDiagnosticResult(options.stdout, filePath, diagnostics);
  }

  return hasErrors ? EXIT_VALIDATION_FAILED : EXIT_OK;
};

const isChemdFilePath = (filePath: string): boolean =>
  filePath.endsWith(".chemd") || filePath.endsWith(".chemd.md");

const collectChemdFilesFromDirectory = (dirPath: string): string[] =>
  readdirSync(dirPath, { withFileTypes: true })
    .flatMap((entry) => {
      const childPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return collectChemdFilesFromDirectory(childPath);
      }

      return entry.isFile() && isChemdFilePath(entry.name) ? [childPath] : [];
    })
    .sort();

const readCheckPathStat = (inputPath: string, resolvedPath: string) => {
  try {
    return statSync(resolvedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`Unable to access check path "${inputPath}": ${message}`);
  }
};

const collectCheckFilePaths = (inputPaths: string[], cwd: string): string[] => {
  const files = inputPaths.flatMap((inputPath) => {
    const resolvedPath = path.resolve(cwd, inputPath);
    const stat = readCheckPathStat(inputPath, resolvedPath);

    if (stat.isDirectory()) {
      return collectChemdFilesFromDirectory(resolvedPath);
    }

    return [resolvedPath];
  });

  return [...new Set(files)].sort();
};

const checkPaths = (
  command: Extract<CliCommand, { type: "check" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): number => {
  const files = collectCheckFilePaths(command.paths, options.cwd).map((filePath) => {
    const source = readSource(filePath, options.cwd);
    const result = compileChemd(source);
    const diagnostics = getTargetDiagnostics(result, command.target);

    return {
      filePath: path.relative(options.cwd, filePath) || filePath,
      counts: countDiagnostics(diagnostics),
      diagnostics
    };
  });
  const report: CheckReport = {
    schemaVersion: "chemd-check/v0.1",
    dryRun: command.dryRun,
    files,
    target: command.target,
    totals: sumDiagnosticCounts(files)
  };

  if (command.format === "json") {
    options.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    options.stdout.write(formatCheckReport(report));
  }

  return report.totals.error > 0 ? EXIT_VALIDATION_FAILED : EXIT_OK;
};

const formatCheckReport = (report: CheckReport): string => {
  const lines = [
    `Chemd check (${report.target})`,
    `  files: ${report.files.length}`,
    `  totals: ${report.totals.error} error(s), ${report.totals.warning} warning(s), ${report.totals.info} info`
  ];

  for (const file of report.files) {
    lines.push(
      `${file.filePath}: ${file.counts.error} error(s), `
      + `${file.counts.warning} warning(s), ${file.counts.info} info`
    );
    for (const diagnostic of file.diagnostics) {
      lines.push(formatDiagnostic(file.filePath ?? "", diagnostic));
    }
  }

  return `${lines.join("\n")}\n`;
};

interface PreflightReport {
  schemaVersion: "chemd-preflight/v0.1";
  dryRun: boolean;
  filePath: string;
  mode: RuntimeMode;
  preflight: ReturnType<typeof preflightRun>;
}

const readPreflightContext = (
  command: Extract<CliCommand, { type: "preflight" }>,
  cwd: string
): RuntimeContext => {
  const baseContext: RuntimeContext = {
    capabilities: DEFAULT_RUNTIME_CAPABILITIES,
    mode: command.mode
  };
  if (!command.contextPath) {
    return baseContext;
  }

  const raw = readSource(command.contextPath, cwd);
  try {
    const parsed = JSON.parse(raw) as Partial<RuntimeContext>;
    return {
      ...baseContext,
      ...parsed,
      capabilities: parsed.capabilities ?? baseContext.capabilities,
      mode: command.mode
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`Unable to parse preflight context "${command.contextPath}": ${message}`);
  }
};

const formatPreflightReport = (report: PreflightReport): string => {
  const lines = [
    `Chemd preflight (${report.mode})`,
    `  file: ${report.filePath}`,
    `  blocking: ${report.preflight.blocking ? "yes" : "no"}`,
    `  issues: ${report.preflight.issues.length}`
  ];

  for (const issue of report.preflight.issues) {
    lines.push(
      `${issue.severity} ${issue.kind} ${issue.stepId ?? issue.controlId ?? ""} ${issue.message}`.trim()
    );
  }
  for (const diagnostic of report.preflight.diagnostics) {
    lines.push(formatDiagnostic(report.filePath, diagnostic));
  }

  return `${lines.join("\n")}\n`;
};

const preflightFile = (
  command: Extract<CliCommand, { type: "preflight" }>,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): number => {
  const source = readSource(command.filePath, options.cwd);
  const result = compileChemd(source);
  if (writeErrorsIfPresent(command.filePath, result, options.stderr)) {
    return EXIT_VALIDATION_FAILED;
  }

  const report: PreflightReport = {
    schemaVersion: "chemd-preflight/v0.1",
    dryRun: command.dryRun,
    filePath: command.filePath,
    mode: command.mode,
    preflight: preflightRun(result.runPlan, readPreflightContext(command, options.cwd))
  };

  if (command.format === "json") {
    options.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    options.stdout.write(formatPreflightReport(report));
  }

  return report.preflight.blocking ? EXIT_VALIDATION_FAILED : EXIT_OK;
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
  const result = compileChemd(source);
  const diagnostics = getExportDiagnostics(result, command.format);
  if (writeDiagnosticsErrorsIfPresent(command.filePath, diagnostics, options.stderr)) {
    return EXIT_VALIDATION_FAILED;
  }

  const payload = selectExportPayload(result, command.format);

  options.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return EXIT_OK;
};

const formatTemplateSummary = (template: DomainTemplateSummary): string =>
  `${template.id}  ${template.title} (${template.feature})`;

const formatTemplateDetail = (template: DomainTemplate): string => [
  `${template.id}`,
  `  title: ${template.title}`,
  `  category: ${template.category}`,
  `  feature: ${template.feature}`,
  `  description: ${template.description}`
].join("\n");

const templatesCommand = (
  command: Extract<CliCommand, { type: "templates" }>,
  options: NormalizedRunOptions
): number => {
  if (command.templateId) {
    const template = getDomainTemplate(command.templateId);
    if (!template) {
      throw new CliUsageError(`Unknown template: ${command.templateId}`);
    }

    options.stdout.write(
      command.json
        ? `${JSON.stringify(template, null, 2)}\n`
        : `${formatTemplateDetail(template)}\n`
    );
    return EXIT_OK;
  }

  const templates = listDomainTemplates();
  options.stdout.write(
    command.json
      ? `${JSON.stringify(templates, null, 2)}\n`
      : `${templates.map(formatTemplateSummary).join("\n")}\n`
  );
  return EXIT_OK;
};

const newFromTemplate = (
  command: Extract<CliCommand, { type: "new" }>,
  options: NormalizedRunOptions
): number => {
  let source: string;
  try {
    source = renderDomainTemplate(command.templateId);
  } catch {
    throw new CliUsageError(`Unknown template: ${command.templateId}`);
  }

  if (command.dryRun) {
    options.stdout.write(source);
    return EXIT_OK;
  }

  writeSource(command.outPath, options.cwd, source);
  options.stdout.write(`Created ${command.outPath} from ${command.templateId}\n`);
  return EXIT_OK;
};

const toImportDocumentId = (filePath: string): string => {
  const baseName = path.parse(filePath).name.toLowerCase();
  const slug = baseName
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return `import-${slug || "prose"}`;
};

const toImportDocumentTitle = (filePath: string): string =>
  `Imported ${path.parse(filePath).name || "prose"}`;

const hasImportErrorDiagnostics = (
  diagnostics: readonly ImportDiagnostic[]
): boolean =>
  countImportDiagnostics(diagnostics).error > 0;

const toProseImportCliReport = (
  command: Extract<CliCommand, { type: "import-prose" }>,
  result: ProseToChemdResult,
  wroteFile: boolean
): ProseImportCliReport => ({
  schemaVersion: "chemd-import-prose/v0.1",
  chemd: result.chemd,
  compilerDiagnosticCounts: countDiagnostics(result.compileResult.diagnostics ?? []),
  compilerDiagnostics: result.compileResult.diagnostics ?? [],
  dryRun: command.dryRun,
  filePath: command.filePath,
  importDiagnosticCounts: countImportDiagnostics(result.candidate.diagnostics),
  importDiagnostics: result.candidate.diagnostics,
  materialCount: result.candidate.materials.length,
  observationCount: result.candidate.observations.length,
  ...(command.outPath ? { outPath: command.outPath } : {}),
  quantityCount: result.candidate.quantities.length,
  stepCount: result.candidate.steps.length,
  valid: result.valid && !hasImportErrorDiagnostics(result.candidate.diagnostics),
  wroteFile
});

const formatImportDiagnostic = (diagnostic: ImportDiagnostic): string => {
  const span = diagnostic.span ? `:${diagnostic.span.start}-${diagnostic.span.end}` : "";

  return [
    `prose${span}`,
    diagnostic.severity,
    diagnostic.code,
    diagnostic.message
  ].join(" ");
};

const formatProseImportText = (report: ProseImportCliReport): string => {
  const lines = [
    `Prose import ${report.filePath}`,
    `  valid: ${report.valid ? "yes" : "no"}`,
    `  wrote file: ${report.wroteFile ? "yes" : "no"}`,
    `  materials: ${report.materialCount}`,
    `  quantities: ${report.quantityCount}`,
    `  steps: ${report.stepCount}`,
    `  observations: ${report.observationCount}`,
    `  import diagnostics: ${report.importDiagnosticCounts.error} error(s), ${report.importDiagnosticCounts.warning} warning(s), ${report.importDiagnosticCounts.info} info`,
    `  compiler diagnostics: ${report.compilerDiagnosticCounts.error} error(s), ${report.compilerDiagnosticCounts.warning} warning(s), ${report.compilerDiagnosticCounts.info} info`
  ];

  for (const diagnostic of report.importDiagnostics) {
    lines.push(formatImportDiagnostic(diagnostic));
  }

  for (const diagnostic of report.compilerDiagnostics) {
    lines.push(formatDiagnostic(report.filePath, diagnostic));
  }

  if (!report.outPath || report.dryRun || !report.wroteFile) {
    lines.push("  chemd draft:");
    lines.push(report.chemd);
  }

  return lines.join("\n");
};

const importProseFile = async (
  command: Extract<CliCommand, { type: "import-prose" }>,
  importProseToChemd: ImportProseToChemd,
  options: NormalizedRunOptions
): Promise<number> => {
  const source = readSource(command.filePath, options.cwd);
  const result = await importProseToChemd(source, {
    documentId: toImportDocumentId(command.filePath),
    title: toImportDocumentTitle(command.filePath)
  });
  const canWrite = Boolean(command.outPath) && !command.dryRun && result.valid
    && !hasImportErrorDiagnostics(result.candidate.diagnostics);

  if (canWrite && command.outPath) {
    writeSource(command.outPath, options.cwd, result.chemd);
  }

  const report = toProseImportCliReport(command, result, canWrite);
  const output = command.format === "json"
    ? JSON.stringify(report, null, 2)
    : formatProseImportText(report);

  options.stdout.write(`${output}\n`);
  return report.valid ? EXIT_OK : EXIT_VALIDATION_FAILED;
};

const formatGraphIndexText = (index: ChemdTrainingGraphIndexV1): string => {
  const lines = [
    "Chemd graph index",
    `  documents: ${index.index_scope.document_ids.length}`,
    `  nodes: ${index.nodes.length}`,
    `  edges: ${index.edges.length}`,
    `  reactions: ${index.reaction_features.length}`,
    `  reaction clusters: ${index.reaction_clusters.length}`,
    `  reaction similarity edges: ${index.reaction_similarity_edges.length}`
  ];

  for (const cluster of index.reaction_clusters.slice(0, 20)) {
    lines.push(
      `  - ${cluster.basis} ${cluster.key}: ${cluster.member_reaction_entity_ids.length} reaction(s)`
    );
  }

  if (index.warnings.length > 0) {
    lines.push(`  warnings: ${index.warnings.join(", ")}`);
  }

  return lines.join("\n");
};

const graphFiles = (
  command: Extract<CliCommand, { type: "graph" }>,
  compileChemd: CompileChemd,
  buildTrainingGraphIndex: BuildTrainingGraphIndex,
  options: NormalizedRunOptions
): number => {
  const compiled = command.filePaths.map((filePath) => ({
    filePath,
    result: compileSourceFile(filePath, compileChemd, options)
  }));
  const hasErrors = compiled.some((item) =>
    writeErrorsIfPresent(item.filePath, item.result, options.stderr)
  );

  if (hasErrors) {
    return EXIT_VALIDATION_FAILED;
  }

  const index = buildTrainingGraphIndex(compiled.map((item) => item.result.trainingUnderstanding), {
    document_sources: compiled.map((item) => ({
      document_id: item.result.trainingUnderstanding.document.document_id,
      file_path: item.filePath
    }))
  });
  const output = command.format === "json"
    ? JSON.stringify(index, null, 2)
    : formatGraphIndexText(index);

  options.stdout.write(`${output}\n`);
  return EXIT_OK;
};

const compileSourceFile = (
  filePath: string,
  compileChemd: CompileChemd,
  options: NormalizedRunOptions
): CompileResult => {
  const source = readSource(filePath, options.cwd);
  return compileChemd(source);
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
  compileChemd(source);

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
    return "No changed Chemd files.";
  }

  return [
    `Changed Chemd files against ${report.base}:`,
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

const toFixReport = (
  command: Extract<CliCommand, { type: "fix" }>,
  filePath: string,
  result: ChemdRepairLoopResult,
  wroteFile: boolean
): FixReport => ({
  schemaVersion: "chemd-fix/v0.1",
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

const formatFixText = (report: FixReport): string => {
  const lines = [
    `Fix ${report.filePath}`,
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
    lines.push("  fixed source:");
    lines.push(report.finalSource);
  }

  return lines.join("\n");
};

const fixFile = (
  command: Extract<CliCommand, { type: "fix" }>,
  runChemdRepairLoop: RunChemdRepairLoop,
  options: NormalizedRunOptions
): number => {
  const source = readSource(command.filePath, options.cwd);
  const fixResult = runChemdRepairLoop(source, {
    maxIterations: command.maxIterations
  });
  const shouldWrite = command.write
    && fixResult.changed
    && fixResult.finalResult.diagnosis.status === "clean";

  if (shouldWrite) {
    writeSource(command.filePath, options.cwd, fixResult.finalSource);
  }

  const report = toFixReport(command, command.filePath, fixResult, shouldWrite);
  const output = command.format === "json"
    ? JSON.stringify(report, null, 2)
    : formatFixText(report);

  options.stdout.write(`${output}\n`);
  return fixResult.finalResult.diagnosis.status === "clean"
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
    fixDiagnosisStatus: iteration.repairResult.finalResult.diagnosis.status,
    fixStoppedReason: iteration.repairResult.stoppedReason,
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
  maxFixIterations: command.maxFixIterations,
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
    `  - iteration ${iteration.iteration}: fix=${iteration.fixStoppedReason}; diagnosis=${iteration.fixDiagnosisStatus}${agentLine}`
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
    `  fix max iterations: ${report.maxFixIterations}`,
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
    maxIterations: command.maxIterations,
    repairMaxIterations: command.maxFixIterations
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
  services: CliCompilerServices,
  options: NormalizedRunOptions
): Promise<number> => {
  if (command.type === "validate") {
    return Promise.resolve(validateFiles(command, services.compileChemd, options));
  }

  if (command.type === "check") {
    return Promise.resolve(checkPaths(command, services.compileChemd, options));
  }

  if (command.type === "preflight") {
    return Promise.resolve(preflightFile(command, services.compileChemd, options));
  }

  if (command.type === "export") {
    return Promise.resolve(exportFile(command, services.compileChemd, options));
  }

  if (command.type === "templates") {
    return Promise.resolve(templatesCommand(command, options));
  }

  if (command.type === "new") {
    return Promise.resolve(newFromTemplate(command, options));
  }

  if (command.type === "import-prose") {
    return loadImporterProse().then((importer) =>
      importProseFile(command, importer.importProseToChemd, options)
    );
  }

  if (command.type === "graph") {
    return Promise.resolve(graphFiles(
      command,
      services.compileChemd,
      services.buildTrainingGraphIndex,
      options
    ));
  }

  if (command.type === "diff") {
    return Promise.resolve(diffFiles(command, services.compileChemd, options));
  }

  if (command.type === "changed") {
    return Promise.resolve(changedFiles(command, services.compileChemd, options));
  }

  if (command.type === "fix") {
    return Promise.resolve(fixFile(command, services.runChemdRepairLoop, options));
  }

  return agentLoopFile(command, services.runChemdAgentLoop, options);
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
    const buildTrainingGraphIndex = compiler.buildTrainingGraphIndexFromUnderstandings;
    const runChemdAgentLoop = options.runChemdAgentLoop ?? compiler.runChemdAgentLoop;
    const runChemdRepairLoop = options.runChemdRepairLoop ?? compiler.runChemdRepairLoop;

    return executeCommand(command, {
      buildTrainingGraphIndex,
      compileChemd,
      runChemdAgentLoop,
      runChemdRepairLoop
    }, options);
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

import type { CompileOptions, CompileResult } from "./index";
import {
  applyCompilerDiagnosisSafeFixes,
  type CompilerDiagnosisSafeFix,
  type CompilerDiagnosisStatus
} from "./diagnosis";
import { compileChemd } from "./index";

export type ChemdRepairLoopStoppedReason =
  | CompilerDiagnosisStatus
  | "max_iterations"
  | "stalled";

export interface ChemdRepairLoopIteration {
  iteration: number;
  compileResult: CompileResult;
  appliedSafeFixes: CompilerDiagnosisSafeFix[];
}

export interface ChemdRepairLoopOptions {
  compileOptions?: CompileOptions;
  maxIterations?: number;
}

export interface ChemdRepairLoopResult {
  changed: boolean;
  finalResult: CompileResult;
  finalSource: string;
  initialSource: string;
  iterations: ChemdRepairLoopIteration[];
  maxIterations: number;
  stoppedReason: ChemdRepairLoopStoppedReason;
  totalAppliedSafeFixes: CompilerDiagnosisSafeFix[];
}

const DEFAULT_MAX_ITERATIONS = 5;

const normalizeMaxIterations = (value: number | undefined): number => {
  if (value === undefined) {
    return DEFAULT_MAX_ITERATIONS;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Repair loop maxIterations must be a positive integer, got: ${String(value)}`);
  }

  return value;
};

const buildResult = (input: {
  initialSource: string;
  currentSource: string;
  finalResult: CompileResult;
  iterations: ChemdRepairLoopIteration[];
  maxIterations: number;
  stoppedReason: ChemdRepairLoopStoppedReason;
  totalAppliedSafeFixes: CompilerDiagnosisSafeFix[];
}): ChemdRepairLoopResult => ({
  changed: input.initialSource !== input.currentSource,
  finalResult: input.finalResult,
  finalSource: input.currentSource,
  initialSource: input.initialSource,
  iterations: input.iterations,
  maxIterations: input.maxIterations,
  stoppedReason: input.stoppedReason,
  totalAppliedSafeFixes: input.totalAppliedSafeFixes
});

export const runChemdRepairLoop = (
  source: string,
  options: ChemdRepairLoopOptions = {}
): ChemdRepairLoopResult => {
  const maxIterations = normalizeMaxIterations(options.maxIterations);
  const iterations: ChemdRepairLoopIteration[] = [];
  const totalAppliedSafeFixes: CompilerDiagnosisSafeFix[] = [];
  let currentSource = source;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const compileResult = compileChemd(currentSource, options.compileOptions);
    const safeFixes = compileResult.diagnosis.safeFixes;

    if (safeFixes.length === 0) {
      iterations.push({
        iteration,
        compileResult,
        appliedSafeFixes: []
      });
      return buildResult({
        initialSource: source,
        currentSource,
        finalResult: compileResult,
        iterations,
        maxIterations,
        stoppedReason: compileResult.diagnosis.status,
        totalAppliedSafeFixes
      });
    }

    if (iteration === maxIterations) {
      iterations.push({
        iteration,
        compileResult,
        appliedSafeFixes: []
      });
      return buildResult({
        initialSource: source,
        currentSource,
        finalResult: compileResult,
        iterations,
        maxIterations,
        stoppedReason: "max_iterations",
        totalAppliedSafeFixes
      });
    }

    const nextSource = applyCompilerDiagnosisSafeFixes(currentSource, compileResult.diagnosis);
    if (nextSource === currentSource) {
      iterations.push({
        iteration,
        compileResult,
        appliedSafeFixes: []
      });
      return buildResult({
        initialSource: source,
        currentSource,
        finalResult: compileResult,
        iterations,
        maxIterations,
        stoppedReason: "stalled",
        totalAppliedSafeFixes
      });
    }

    iterations.push({
      iteration,
      compileResult,
      appliedSafeFixes: safeFixes
    });
    totalAppliedSafeFixes.push(...safeFixes);
    currentSource = nextSource;
  }

  const finalResult = compileChemd(currentSource, options.compileOptions);
  return buildResult({
    initialSource: source,
    currentSource,
    finalResult,
    iterations,
    maxIterations,
    stoppedReason: "max_iterations",
    totalAppliedSafeFixes
  });
};

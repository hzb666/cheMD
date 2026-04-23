import type { Diagnostic } from "@chemd/core";

import type { CompileOptions, CompileResult } from "./index";
import type { CompilerDiagnosisSafeFix } from "./diagnosis";
import { runChemdRepairLoop, type ChemdRepairLoopResult } from "./repair-loop";

export type ChemdAgentLoopStoppedReason =
  | "clean"
  | "max_iterations"
  | "repair_max_iterations"
  | "repair_stalled"
  | "agent_stalled"
  | CompileResult["diagnosis"]["status"];

export interface ChemdAgentLoopAgentRequest {
  iteration: number;
  source: string;
  diagnosis: CompileResult["diagnosis"];
  diagnostics: Diagnostic[];
  repairResult: ChemdRepairLoopResult;
  history: ChemdAgentLoopIteration[];
}

export interface ChemdAgentLoopAgentResponse {
  action: "rewrite" | "stop";
  nextSource?: string;
  note?: string;
}

export type ChemdAgentLoopAgent = (
  request: ChemdAgentLoopAgentRequest
) => Promise<ChemdAgentLoopAgentResponse> | ChemdAgentLoopAgentResponse;

export interface ChemdAgentLoopIteration {
  iteration: number;
  repairResult: ChemdRepairLoopResult;
  agentResponse?: {
    action: ChemdAgentLoopAgentResponse["action"];
    changedSource: boolean;
    note?: string;
  };
}

export interface ChemdAgentLoopOptions {
  agent: ChemdAgentLoopAgent;
  compileOptions?: CompileOptions;
  maxIterations?: number;
  repairMaxIterations?: number;
}

export interface ChemdAgentLoopResult {
  changed: boolean;
  finalResult: CompileResult;
  finalSource: string;
  initialSource: string;
  iterations: ChemdAgentLoopIteration[];
  maxIterations: number;
  repairMaxIterations: number;
  stoppedReason: ChemdAgentLoopStoppedReason;
  totalAppliedSafeFixes: CompilerDiagnosisSafeFix[];
}

const DEFAULT_MAX_ITERATIONS = 5;

const normalizePositiveInteger = (value: number | undefined, label: string): number => {
  if (value === undefined) {
    return DEFAULT_MAX_ITERATIONS;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got: ${String(value)}`);
  }

  return value;
};

const ensureValidAgentResponse = (
  response: ChemdAgentLoopAgentResponse
): ChemdAgentLoopAgentResponse => {
  if (response.action === "stop") {
    return response;
  }

  if (response.action === "rewrite" && typeof response.nextSource === "string") {
    return response;
  }

  throw new Error("Agent loop rewrite responses must provide nextSource.");
};

const buildResult = (input: {
  initialSource: string;
  currentSource: string;
  finalResult: CompileResult;
  iterations: ChemdAgentLoopIteration[];
  maxIterations: number;
  repairMaxIterations: number;
  stoppedReason: ChemdAgentLoopStoppedReason;
  totalAppliedSafeFixes: CompilerDiagnosisSafeFix[];
}): ChemdAgentLoopResult => ({
  changed: input.initialSource !== input.currentSource,
  finalResult: input.finalResult,
  finalSource: input.currentSource,
  initialSource: input.initialSource,
  iterations: input.iterations,
  maxIterations: input.maxIterations,
  repairMaxIterations: input.repairMaxIterations,
  stoppedReason: input.stoppedReason,
  totalAppliedSafeFixes: input.totalAppliedSafeFixes
});

const buildTerminalResult = (input: {
  currentSource: string;
  finalResult: CompileResult;
  initialSource: string;
  iterations: ChemdAgentLoopIteration[];
  maxIterations: number;
  repairMaxIterations: number;
  stoppedReason: ChemdAgentLoopStoppedReason;
  totalAppliedSafeFixes: CompilerDiagnosisSafeFix[];
}): ChemdAgentLoopResult =>
  buildResult({
    initialSource: input.initialSource,
    currentSource: input.currentSource,
    finalResult: input.finalResult,
    iterations: input.iterations,
    maxIterations: input.maxIterations,
    repairMaxIterations: input.repairMaxIterations,
    stoppedReason: input.stoppedReason,
    totalAppliedSafeFixes: input.totalAppliedSafeFixes
  });

const mapRepairTerminalReason = (
  stoppedReason: ChemdRepairLoopResult["stoppedReason"]
): "clean" | "repair_max_iterations" | "repair_stalled" | undefined => {
  if (stoppedReason === "clean") {
    return "clean";
  }

  if (stoppedReason === "max_iterations") {
    return "repair_max_iterations";
  }

  return stoppedReason === "stalled" ? "repair_stalled" : undefined;
};

export const runChemdAgentLoop = async (
  source: string,
  options: ChemdAgentLoopOptions
): Promise<ChemdAgentLoopResult> => {
  const maxIterations = normalizePositiveInteger(options.maxIterations, "Agent loop maxIterations");
  const repairMaxIterations = normalizePositiveInteger(
    options.repairMaxIterations,
    "Agent loop repairMaxIterations"
  );
  const iterations: ChemdAgentLoopIteration[] = [];
  const totalAppliedSafeFixes: CompilerDiagnosisSafeFix[] = [];
  let currentSource = source;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const repairResult = runChemdRepairLoop(currentSource, {
      compileOptions: options.compileOptions,
      maxIterations: repairMaxIterations
    });
    totalAppliedSafeFixes.push(...repairResult.totalAppliedSafeFixes);

    const iterationRecord: ChemdAgentLoopIteration = {
      iteration,
      repairResult
    };
    const repairTerminalReason = mapRepairTerminalReason(repairResult.stoppedReason);
    if (repairTerminalReason) {
      iterations.push(iterationRecord);
      return buildTerminalResult({
        initialSource: source,
        currentSource: repairResult.finalSource,
        finalResult: repairResult.finalResult,
        iterations,
        maxIterations,
        repairMaxIterations,
        stoppedReason: repairTerminalReason,
        totalAppliedSafeFixes
      });
    }

    if (iteration === maxIterations) {
      iterations.push(iterationRecord);
      return buildTerminalResult({
        initialSource: source,
        currentSource: repairResult.finalSource,
        finalResult: repairResult.finalResult,
        iterations,
        maxIterations,
        repairMaxIterations,
        stoppedReason: "max_iterations",
        totalAppliedSafeFixes
      });
    }

    const agentResponse = ensureValidAgentResponse(await options.agent({
      iteration,
      source: repairResult.finalSource,
      diagnosis: repairResult.finalResult.diagnosis,
      diagnostics: repairResult.finalResult.diagnostics,
      repairResult,
      history: [...iterations]
    }));
    const changedSource = agentResponse.action === "rewrite"
      && agentResponse.nextSource !== repairResult.finalSource;

    iterationRecord.agentResponse = {
      action: agentResponse.action,
      changedSource,
      ...(agentResponse.note ? { note: agentResponse.note } : {})
    };
    iterations.push(iterationRecord);

    if (agentResponse.action === "stop") {
      return buildTerminalResult({
        initialSource: source,
        currentSource: repairResult.finalSource,
        finalResult: repairResult.finalResult,
        iterations,
        maxIterations,
        repairMaxIterations,
        stoppedReason: repairResult.finalResult.diagnosis.status,
        totalAppliedSafeFixes
      });
    }

    if (!changedSource || agentResponse.nextSource === undefined) {
      return buildTerminalResult({
        initialSource: source,
        currentSource: repairResult.finalSource,
        finalResult: repairResult.finalResult,
        iterations,
        maxIterations,
        repairMaxIterations,
        stoppedReason: "agent_stalled",
        totalAppliedSafeFixes
      });
    }

    currentSource = agentResponse.nextSource;
  }

  throw new Error("Agent loop exhausted without returning a result.");
};

import { spawnSync } from "node:child_process";

import type {
  ChemdAgentLoopAgent,
  ChemdAgentLoopAgentRequest,
  ChemdAgentLoopAgentResponse
} from "@chemd/compiler";

const REQUEST_SCHEMA_VERSION = "chemd-agent-driver-request/v0.1";
const RESPONSE_SCHEMA_VERSION = "chemd-agent-driver-response/v0.1";

interface ProcessAgentLoopDriverOptions {
  args: string[];
  command: string;
  cwd: string;
  filePath: string;
}

interface AgentLoopDriverRequestPayload {
  schemaVersion: typeof REQUEST_SCHEMA_VERSION;
  filePath: string;
  iteration: number;
  source: string;
  diagnosis: ChemdAgentLoopAgentRequest["diagnosis"];
  diagnostics: ChemdAgentLoopAgentRequest["diagnostics"];
  fix: {
    changed: boolean;
    finalDiagnosis: ChemdAgentLoopAgentRequest["repairResult"]["finalResult"]["diagnosis"];
    stoppedReason: ChemdAgentLoopAgentRequest["repairResult"]["stoppedReason"];
    totalAppliedSafeFixCount: number;
  };
  history: Array<{
    iteration: number;
    diagnosisStatus: string;
    fixStoppedReason: string;
    safeFixCount: number;
    agentAction?: "rewrite" | "stop";
    agentChangedSource?: boolean;
    agentNote?: string;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const buildRequestPayload = (
  filePath: string,
  request: ChemdAgentLoopAgentRequest
): AgentLoopDriverRequestPayload => ({
  schemaVersion: REQUEST_SCHEMA_VERSION,
  filePath,
  iteration: request.iteration,
  source: request.source,
  diagnosis: request.diagnosis,
  diagnostics: request.diagnostics,
  fix: {
    changed: request.repairResult.changed,
    finalDiagnosis: request.repairResult.finalResult.diagnosis,
    stoppedReason: request.repairResult.stoppedReason,
    totalAppliedSafeFixCount: request.repairResult.totalAppliedSafeFixes.length
  },
  history: request.history.map((entry) => ({
    iteration: entry.iteration,
    diagnosisStatus: entry.repairResult.finalResult.diagnosis.status,
    fixStoppedReason: entry.repairResult.stoppedReason,
    safeFixCount: entry.repairResult.totalAppliedSafeFixes.length,
    ...(entry.agentResponse
      ? {
          agentAction: entry.agentResponse.action,
          agentChangedSource: entry.agentResponse.changedSource,
          ...(entry.agentResponse.note ? { agentNote: entry.agentResponse.note } : {})
        }
      : {})
  }))
});

const toDriverError = (command: string, stderr: string, details: string): Error => {
  const suffix = stderr.trim().length > 0 ? `\nDriver stderr:\n${stderr.trim()}` : "";
  return new Error(`Agent driver "${command}" failed: ${details}${suffix}`);
};

const parseDriverResponse = (
  command: string,
  stdout: string,
  stderr: string
): ChemdAgentLoopAgentResponse => {
  if (stdout.trim().length === 0) {
    throw toDriverError(command, stderr, "empty stdout");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw toDriverError(command, stderr, `invalid JSON response (${message})`);
  }

  if (!isRecord(parsed) || parsed.schemaVersion !== RESPONSE_SCHEMA_VERSION) {
    throw toDriverError(
      command,
      stderr,
      `response must include schemaVersion ${RESPONSE_SCHEMA_VERSION}`
    );
  }

  if (parsed.action === "stop") {
    return {
      action: "stop",
      ...(typeof parsed.note === "string" ? { note: parsed.note } : {})
    };
  }

  if (parsed.action === "rewrite" && typeof parsed.nextSource === "string") {
    return {
      action: "rewrite",
      nextSource: parsed.nextSource,
      ...(typeof parsed.note === "string" ? { note: parsed.note } : {})
    };
  }

  throw toDriverError(
    command,
    stderr,
    "response must be { action: \"stop\" } or { action: \"rewrite\", nextSource }"
  );
};

export const createProcessAgentLoopDriver = (
  options: ProcessAgentLoopDriverOptions
): ChemdAgentLoopAgent => async (request) => {
  const payload = buildRequestPayload(options.filePath, request);
  const result = spawnSync(options.command, options.args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: JSON.stringify(payload, null, 2),
    shell: false,
    windowsHide: true
  });

  if (result.error) {
    throw toDriverError(options.command, String(result.stderr ?? ""), result.error.message);
  }

  if (result.status !== 0) {
    throw toDriverError(
      options.command,
      String(result.stderr ?? ""),
      `exit code ${String(result.status)}`
    );
  }

  return parseDriverResponse(
    options.command,
    String(result.stdout ?? ""),
    String(result.stderr ?? "")
  );
};

import { useState, useEffect, useRef } from "react";
import type { SidecarOperation } from "../types";
import { invokeCommand, getSidecarErrorMessage } from "../utils";
import { shellSidecarStatus, type SidecarStatus } from "../contracts";

const sidecarLifecycleCommand = {
  refresh: "read_sidecar_status",
  start: "start_sidecar",
  stop: "stop_sidecar"
} as const;

const sidecarLifecycleVerb = {
  refresh: "refreshed",
  start: "started",
  stop: "stopped"
} as const;

export const useSidecarController = () => {
  const [status, setStatus] = useState<SidecarStatus>(shellSidecarStatus);
  const [logTail, setLogTail] = useState<string[]>(shellSidecarStatus.logTail);
  const [operation, setOperation] = useState<SidecarOperation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<SidecarOperation | null>(null);

  useEffect(() => {
    void invokeCommand("read_sidecar_status", undefined)
      .then((nextStatus) => {
        setStatus(nextStatus);
        setLogTail(nextStatus.logTail);
      })
      .catch((nextError: unknown) => {
        setStatus(shellSidecarStatus);
        setError(getSidecarErrorMessage(nextError));
      });
  }, []);

  const commitStatus = (nextStatus: SidecarStatus, nextMessage: string) => {
    setStatus(nextStatus);
    setLogTail(nextStatus.logTail);
    setMessage(nextMessage);
    setError(null);
  };

  const runLifecycleCommand = async (nextOperation: Exclude<SidecarOperation, "logs">) => {
    if (operationRef.current) return;
    operationRef.current = nextOperation;
    setOperation(nextOperation);
    try {
      const command = sidecarLifecycleCommand[nextOperation];
      const nextStatus = await invokeCommand(command, undefined);
      const verb = sidecarLifecycleVerb[nextOperation];
      commitStatus(nextStatus, `chem-service ${verb}.`);
    } catch (nextError: unknown) {
      setError(getSidecarErrorMessage(nextError));
      setMessage(null);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  const loadLogs = async () => {
    if (operationRef.current) return;
    operationRef.current = "logs";
    setOperation("logs");
    try {
      const [nextLogs, nextStatus] = await Promise.all([
        invokeCommand("read_sidecar_logs", undefined),
        invokeCommand("read_sidecar_status", undefined),
      ]);
      setStatus(nextStatus);
      setLogTail(nextLogs.lines);
      setMessage(`Loaded ${nextLogs.lines.length} log lines.`);
      setError(null);
    } catch (nextError: unknown) {
      setError(getSidecarErrorMessage(nextError));
      setMessage(null);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  return {
    status,
    logTail,
    operation,
    message,
    error,
    start: () => void runLifecycleCommand("start"),
    stop: () => void runLifecycleCommand("stop"),
    refresh: () => void runLifecycleCommand("refresh"),
    loadLogs: () => void loadLogs()
  };
};

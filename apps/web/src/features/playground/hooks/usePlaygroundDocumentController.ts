"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { compileChemd, type CompileResult } from "@chemd/compiler";

import { createCompileScheduler } from "../../editor/lib/compile-scheduler";
import { parseDocumentIdFromSource } from "../../editor/lib/parse-document-id-from-source";
import { getStructureSessionId } from "../../structure-editor/lib/structure-session";
import { sampleSource } from "../lib/sample-source";

const compilePreview = (source: string): CompileResult => compileChemd(source);
const initialPreviewResult = compilePreview(sampleSource);

export interface PlaygroundCompilerOutputCode {
  semantic: string;
  runtime: string;
  lnf: string;
  training: string;
}

export interface PlaygroundDocumentController {
  source: string;
  result: CompileResult;
  json: string;
  compilerOutputCode: PlaygroundCompilerOutputCode;
  documentId: string;
  sessionId: string;
  lineCount: number;
  previewIsFresh: boolean;
  compileState: string;
  compileStateTone: "pending" | "success" | "warning";
  editorStatus: string | null;
  setEditorStatus: (next: string | null) => void;
  applySourceChange: (nextSource: string) => void;
  getLatestSource: () => string;
}

const stringifyCompilerOutput = (value: unknown): string => JSON.stringify(value, null, 2);

const buildCompilerOutputCode = (result: CompileResult): PlaygroundCompilerOutputCode => ({
  semantic: stringifyCompilerOutput({
    typedSemanticGraph: result.typedSemanticGraph,
    stepGraph: result.stepGraph
  }),
  runtime: stringifyCompilerOutput({
    runPlan: result.runPlan,
    runtimePreflight: result.runtimePreflight
  }),
  lnf: stringifyCompilerOutput(result.lnf),
  training: stringifyCompilerOutput(result.trainingExport)
});

export const usePlaygroundDocumentController = (): PlaygroundDocumentController => {
  const [source, setSource] = useState(sampleSource);
  const [result, setResult] = useState<CompileResult>(initialPreviewResult);
  const [jsonState, setJsonState] = useState({
    source: sampleSource,
    value: initialPreviewResult.json
  });
  const [lastCompiledSource, setLastCompiledSource] = useState(sampleSource);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const deferredSource = useDeferredValue(source);
  const schedulerRef = useRef(createCompileScheduler(compilePreview));
  const sourceRef = useRef(sampleSource);

  const documentId = useMemo(() => parseDocumentIdFromSource(source), [source]);
  const sessionId = useMemo(() => getStructureSessionId(), []);
  const lineCount = useMemo(() => source.split(/\r?\n/).length, [source]);
  const compilerOutputCode = useMemo(() => buildCompilerOutputCode(result), [result]);

  const applySourceChange = (nextSource: string) => {
    sourceRef.current = nextSource;
    setSource(nextSource);
  };

  const commitCompileResult = useCallback((nextResult: CompileResult, nextSource: string) => {
    startTransition(() => {
      setResult(nextResult);
      setLastCompiledSource(nextSource);
      setJsonState((current) =>
        current.source === nextSource
          ? current
          : {
              source: nextSource,
              value: nextResult.json
            }
      );
    });
  }, []);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const scheduler = schedulerRef.current;

    scheduler.schedule(deferredSource, (nextResult) => {
      commitCompileResult(nextResult, deferredSource);
    });

    return () => {
      scheduler.cancel();
    };
  }, [commitCompileResult, deferredSource]);

  useEffect(() => {
    const abortController = new AbortController();

    void fetch("/api/export/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: deferredSource
      }),
      signal: abortController.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`JSON export failed (${response.status})`);
        }

        return response.text();
      })
      .then((json) => {
        if (abortController.signal.aborted) {
          return;
        }

        startTransition(() => {
          setJsonState({
            source: deferredSource,
            value: json
          });
        });
      })
      .catch(() => undefined);

    return () => {
      abortController.abort();
    };
  }, [deferredSource]);

  const diagnosticCount = result.diagnostics.length;
  const previewIsFresh = lastCompiledSource === source;
  const compileState = !previewIsFresh
    ? "Compiling"
    : diagnosticCount === 0
      ? "Clean compile"
      : `${diagnosticCount} diagnostics`;
  const compileStateTone = !previewIsFresh ? "pending" : diagnosticCount === 0 ? "success" : "warning";

  return {
    source,
    result,
    json: jsonState.value,
    compilerOutputCode,
    documentId,
    sessionId,
    lineCount,
    previewIsFresh,
    compileState,
    compileStateTone,
    editorStatus,
    setEditorStatus,
    applySourceChange,
    getLatestSource: () => sourceRef.current
  };
};

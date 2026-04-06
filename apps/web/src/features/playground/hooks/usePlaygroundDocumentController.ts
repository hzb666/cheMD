"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { compileChemd, type CompileResult } from "@chemd/compiler";

import { createCompileScheduler } from "../../editor/lib/compile-scheduler";
import { parseDocumentIdFromSource } from "../../editor/lib/parse-document-id-from-source";
import { getStructureSessionId } from "../../structure-editor/lib/structure-session";
import { sampleSource } from "../lib/sample-source";

const compilePreview = (source: string): CompileResult => compileChemd(source);

export interface PlaygroundDocumentController {
  source: string;
  result: CompileResult;
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

export const usePlaygroundDocumentController = (): PlaygroundDocumentController => {
  const [source, setSource] = useState(sampleSource);
  const [result, setResult] = useState<CompileResult>(() => compilePreview(sampleSource));
  const [lastCompiledSource, setLastCompiledSource] = useState(sampleSource);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const deferredSource = useDeferredValue(source);
  const schedulerRef = useRef(createCompileScheduler(compilePreview));
  const sourceRef = useRef(sampleSource);

  const documentId = useMemo(() => parseDocumentIdFromSource(source), [source]);
  const sessionId = useMemo(() => getStructureSessionId(), []);
  const lineCount = useMemo(() => source.split(/\r?\n/).length, [source]);

  const applySourceChange = (nextSource: string) => {
    sourceRef.current = nextSource;
    setSource(nextSource);
  };

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const scheduler = schedulerRef.current;

    scheduler.schedule(deferredSource, (nextResult) => {
      startTransition(() => {
        setResult(nextResult);
        setLastCompiledSource(deferredSource);
      });
    });

    return () => {
      scheduler.cancel();
    };
  }, [deferredSource]);

  const diagnosticCount = result.diagnostics.length;
  const previewIsFresh = lastCompiledSource === source;
  const compileState = !previewIsFresh
    ? "Compiling..."
    : diagnosticCount === 0
      ? "Preview synced"
      : `${diagnosticCount} diagnostics`;
  const compileStateTone = !previewIsFresh ? "pending" : diagnosticCount === 0 ? "success" : "warning";

  return {
    source,
    result,
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

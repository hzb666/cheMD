import { loader, Editor, type BeforeMount, type Monaco, type OnChange, type OnMount } from "@monaco-editor/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import * as monacoRuntime from "monaco-editor/esm/vs/editor/editor.api.js";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

import {
  toMonacoLanguageServiceModel,
  type ChemdLanguageCompileOutput,
  type ChemdWorkspaceSymbolIndex,
  type MonacoMarkerLike
} from "@chemd/language-service";
import {
  cleanupChemdCodeActionOutput,
  registerChemdCodeActionProvider,
  updateChemdCodeActionOutput
} from "./code-actions";
import {
  cleanupChemdCompletionOutput,
  cleanupChemdCompletionWorkspaceIndex,
  registerChemdCompletionProvider,
  updateChemdCompletionOutput,
  updateChemdCompletionWorkspaceIndex
} from "./completion";
import {
  cleanupChemdNavigationOutput,
  registerChemdNavigationProviders,
  updateChemdNavigationOutput
} from "./navigation";
import type { AppSettings } from "../settings/settings";
import {
  toChemdModelUri,
  type MonacoChemdEditorHandle,
  type MonacoCursorPosition,
  type MonacoUndoRedoState,
  type MonacoSourceJumpIntent
} from "./source-path";

export {
  isSameChemdDocumentPath,
  toChemdModelUri,
  type MonacoChemdEditorHandle,
  type MonacoCursorPosition,
  type MonacoUndoRedoState,
  type MonacoSourceJumpIntent
} from "./source-path";

export const CHEMD_LANGUAGE_ID = "chemd";

const CHEMD_MARKER_OWNER = "chemd-language-service";
const CHEMD_THEME_ID = "chemd-desktop";
const EDITOR_SURFACE_FALLBACK = "#ffffff";
const EDITOR_FONT_FAMILY = "\"JetBrains Mono\"";

const readCssColorToken = (name: string, fallback: string): string => {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

type MonacoWorkerEnvironment = {
  getWorker: (_moduleId: string, _label: string) => Worker;
};

const globalMonacoScope = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment;
};

globalMonacoScope.MonacoEnvironment ??= {
  getWorker: () => new editorWorker()
};

loader.config({ monaco: monacoRuntime });

type MonacoEditor = editor.IStandaloneCodeEditor;
type MonacoTypography = {
  fontSize: number;
  lineHeight: number;
};

const DEFAULT_EDITOR_FONT_SIZE = 14;
const DEFAULT_EDITOR_LINE_HEIGHT_RATIO = 1.54;

const createDefaultMonacoTypography = (): MonacoTypography => ({
  fontSize: DEFAULT_EDITOR_FONT_SIZE,
  lineHeight: Math.round(DEFAULT_EDITOR_FONT_SIZE * DEFAULT_EDITOR_LINE_HEIGHT_RATIO)
});

type MonacoChemdEditorProps = {
  value: string;
  documentPath: string;
  compileOutput: ChemdLanguageCompileOutput;
  workspaceSymbolIndex?: ChemdWorkspaceSymbolIndex | null;
  editorSettings: Pick<AppSettings, "editorFontSize" | "lineNumbers" | "minimap" | "wordWrap">;
  onChange: (nextSource: string) => void;
  onSave: () => void;
  onBlurSave?: () => void;
  onCursorPositionChange?: (position: MonacoCursorPosition) => void;
  onUndoRedoStateChange?: (state: MonacoUndoRedoState) => void;
};

type UndoRedoModel = {
  canRedo?: () => boolean;
  canUndo?: () => boolean;
};

const readUndoRedoState = (editorInstance: MonacoEditor | null): MonacoUndoRedoState => {
  const model = editorInstance?.getModel() as UndoRedoModel | null | undefined;
  return {
    canRedo: model?.canRedo?.() ?? false,
    canUndo: model?.canUndo?.() ?? false
  };
};

type SourceJumpModel = {
  getLineCount: () => number;
  getLineMaxColumn: (lineNumber: number) => number;
  getPositionAt: (offset: number) => { lineNumber: number; column: number };
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clampInteger = (value: number, min: number, max: number): number =>
  Math.min(Math.max(Math.trunc(value), min), max);

export const resolveMonacoSourceJumpSelection = (
  model: SourceJumpModel,
  range: MonacoSourceJumpIntent["range"]
) => {
  if (isFiniteNumber(range.startOffset)) {
    const startOffset = Math.max(0, Math.trunc(range.startOffset));
    const endOffset = isFiniteNumber(range.endOffset)
      ? Math.max(startOffset, Math.trunc(range.endOffset))
      : startOffset;
    const start = model.getPositionAt(startOffset);
    const end = model.getPositionAt(endOffset);

    return {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: Math.max(end.column, start.lineNumber === end.lineNumber ? start.column + 1 : 1)
    };
  }

  const lineCount = model.getLineCount();
  const startLineNumber = clampInteger(range.startLine, 1, lineCount);
  const endLineNumber = clampInteger(range.endLine ?? range.startLine, startLineNumber, lineCount);
  const startColumn = clampInteger(isFiniteNumber(range.startColumn) ? range.startColumn : 1, 1, model.getLineMaxColumn(startLineNumber));
  const endColumn = isFiniteNumber(range.endColumn)
    ? clampInteger(range.endColumn, 1, model.getLineMaxColumn(endLineNumber))
    : model.getLineMaxColumn(endLineNumber);

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn: Math.max(endColumn, startLineNumber === endLineNumber ? startColumn + 1 : 1)
  };
};

const toEditorMarker = (marker: MonacoMarkerLike): editor.IMarkerData => ({
  startLineNumber: marker.startLineNumber,
  startColumn: marker.startColumn,
  endLineNumber: marker.endLineNumber,
  endColumn: marker.endColumn,
  code: marker.code,
  message: marker.message,
  severity: marker.severity as editor.IMarkerData["severity"],
  source: marker.source
});

const registerChemdLanguageMetadata = (monaco: Monaco): void => {
  const languageExists = monaco.languages
    .getLanguages()
    .some((language: { id: string }) => language.id === CHEMD_LANGUAGE_ID);

  if (!languageExists) {
    monaco.languages.register({
      id: CHEMD_LANGUAGE_ID,
      aliases: ["Chemd", "chemd"],
      extensions: [".chemd", ".chemd.md"]
    });
  }
};

const configureChemdLanguage = (monaco: Monaco): void => {
  monaco.languages.setLanguageConfiguration(CHEMD_LANGUAGE_ID, {
    comments: { lineComment: "//" },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "\"", close: "\"" },
      { open: "'", close: "'" }
    ]
  });
};

const configureChemdTokens = (monaco: Monaco): void => {
  monaco.languages.setMonarchTokensProvider(CHEMD_LANGUAGE_ID, {
    defaultToken: "",
    tokenizer: {
      root: [
        [/^---$/, "delimiter.frontmatter"],
        [/^:::\s*[a-zA-Z][\w-]*/, "keyword.block"],
        [/^:::\s*$/, "keyword.block"],
        [/#[A-Za-z0-9_-]+/, "tag.identifier"],
        [/^\s*[A-Za-z_][\w-]*(?=\s*:)/, "attribute.name"],
        [/\b(kind|reactants|products|conditions|status|yield|amount|smiles|method|target|result)\b(?=\s*:)/, "attribute.name"],
        [/\b(error|failed|warning|pending|accepted|ready|ok)\b/, "keyword.status"],
        [/\b\d+(?:\.\d+)?\s*(?:mg|g|ml|mL|M|mol|%|degC|h|min)\b/, "number.quantity"],
        [/\/\/.*$/, "comment"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"]
      ]
    }
  });
};

const defineChemdTheme = (monaco: Monaco): void => {
  const editorSurface = readCssColorToken("--editor-surface", EDITOR_SURFACE_FALLBACK);

  monaco.editor.defineTheme(CHEMD_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "delimiter.frontmatter", foreground: "64748b", fontStyle: "bold" },
      { token: "keyword.block", foreground: "0f766e", fontStyle: "bold" },
      { token: "tag.identifier", foreground: "7c3aed" },
      { token: "attribute.name", foreground: "1d4ed8" },
      { token: "keyword.status", foreground: "b45309" },
      { token: "number.quantity", foreground: "047857" },
      { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
      { token: "string", foreground: "be123c" }
    ],
    colors: {
      "editor.background": editorSurface,
      "editor.foreground": "#0f172a",
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#334155",
      "editor.selectionBackground": "#bae6fd",
      "editor.lineHighlightBackground": "#305c5312",
      "editor.lineHighlightBorder": "#00000000"
    }
  });
};

const registerChemdLanguage = (monaco: Monaco): void => {
  registerChemdLanguageMetadata(monaco);
  configureChemdLanguage(monaco);
  configureChemdTokens(monaco);
  defineChemdTheme(monaco);
  registerChemdCodeActionProvider(monaco, CHEMD_LANGUAGE_ID);
  registerChemdCompletionProvider(monaco, CHEMD_LANGUAGE_ID);
  registerChemdNavigationProviders(monaco, CHEMD_LANGUAGE_ID);
};

export const MonacoChemdEditor = forwardRef<MonacoChemdEditorHandle, MonacoChemdEditorProps>(function MonacoChemdEditor({
  value,
  documentPath,
  compileOutput,
  workspaceSymbolIndex,
  editorSettings,
  onChange,
  onSave,
  onBlurSave,
  onCursorPositionChange,
  onUndoRedoStateChange
}: MonacoChemdEditorProps, ref) {
  const editorRef = useRef<MonacoEditor | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const cursorDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const blurDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const contentDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const undoRedoNotifyTimeoutRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const onBlurSaveRef = useRef(onBlurSave);
  const onUndoRedoStateChangeRef = useRef(onUndoRedoStateChange);
  const [typography, setTypography] = useState<MonacoTypography>(createDefaultMonacoTypography);
  const [scrollBottomPadding, setScrollBottomPadding] = useState(0);
  const markers = useMemo(
    () => toMonacoLanguageServiceModel(compileOutput).markers.map(toEditorMarker),
    [compileOutput]
  );
  const modelPath = useMemo(() => toChemdModelUri(documentPath), [documentPath]);

  useEffect(() => {
    updateChemdCodeActionOutput(modelPath, compileOutput);
    updateChemdCompletionOutput(modelPath, compileOutput);
    updateChemdNavigationOutput(modelPath, compileOutput);
    return () => {
      cleanupChemdCodeActionOutput(modelPath, compileOutput);
      cleanupChemdCompletionOutput(modelPath, compileOutput);
      cleanupChemdNavigationOutput(modelPath, compileOutput);
    };
  }, [compileOutput, modelPath]);

  useEffect(() => {
    if (!workspaceSymbolIndex) {
      cleanupChemdCompletionWorkspaceIndex(modelPath);
      return;
    }

    updateChemdCompletionWorkspaceIndex(modelPath, workspaceSymbolIndex);
    return () => {
      cleanupChemdCompletionWorkspaceIndex(modelPath, workspaceSymbolIndex);
    };
  }, [modelPath, workspaceSymbolIndex]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onBlurSaveRef.current = onBlurSave;
  }, [onBlurSave]);

  useEffect(() => {
    onUndoRedoStateChangeRef.current = onUndoRedoStateChange;
  }, [onUndoRedoStateChange]);

  useEffect(() => {
    const resolvedTypography = {
      fontSize: editorSettings.editorFontSize,
      lineHeight: Math.round(editorSettings.editorFontSize * DEFAULT_EDITOR_LINE_HEIGHT_RATIO)
    };
    setTypography((current) => (
      current.fontSize === resolvedTypography.fontSize && current.lineHeight === resolvedTypography.lineHeight
        ? current
        : resolvedTypography
    ));
  }, [editorSettings.editorFontSize]);

  useEffect(() => () => {
    cursorDisposableRef.current?.dispose();
    blurDisposableRef.current?.dispose();
    contentDisposableRef.current?.dispose();
    if (undoRedoNotifyTimeoutRef.current !== null) {
      window.clearTimeout(undoRedoNotifyTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const shellElement = shellRef.current;
    if (!shellElement) return;

    const updateScrollPadding = () => {
      const nextPadding = Math.round(shellElement.clientHeight / 2);
      setScrollBottomPadding((current) => current === nextPadding ? current : nextPadding);
    };

    updateScrollPadding();
    const resizeObserver = new ResizeObserver(updateScrollPadding);
    resizeObserver.observe(shellElement);
    return () => resizeObserver.disconnect();
  }, []);

  const notifyUndoRedoState = useCallback(() => {
    onUndoRedoStateChangeRef.current?.(readUndoRedoState(editorRef.current));
  }, []);

  const scheduleUndoRedoStateNotification = useCallback(() => {
    if (undoRedoNotifyTimeoutRef.current !== null) {
      return;
    }
    undoRedoNotifyTimeoutRef.current = window.setTimeout(() => {
      undoRedoNotifyTimeoutRef.current = null;
      notifyUndoRedoState();
    }, 0);
  }, [notifyUndoRedoState]);

  const syncMarkers = useCallback(() => {
    const editorInstance = editorRef.current;
    const monaco = monacoRef.current;
    const model = editorInstance?.getModel();

    if (!monaco || !model) {
      return;
    }

    monaco.editor.setModelMarkers(model, CHEMD_MARKER_OWNER, markers);
  }, [markers]);

  useEffect(() => {
    syncMarkers();
  }, [modelPath, syncMarkers]);

  useImperativeHandle(ref, () => ({
    jumpToSource: (intent) => {
      const editorInstance = editorRef.current;
      const model = editorInstance?.getModel();
      if (!editorInstance || !model) return false;
      const selection = resolveMonacoSourceJumpSelection(model, intent.range);
      editorInstance.setSelection(selection);
      editorInstance.revealRangeInCenterIfOutsideViewport(selection);
      editorInstance.focus();
      return true;
    },
    redo: () => {
      const editorInstance = editorRef.current;
      if (!editorInstance) return false;
      editorInstance.trigger("keyboard", "redo", null);
      editorInstance.focus();
      scheduleUndoRedoStateNotification();
      return true;
    },
    undo: () => {
      const editorInstance = editorRef.current;
      if (!editorInstance) return false;
      editorInstance.trigger("keyboard", "undo", null);
      editorInstance.focus();
      scheduleUndoRedoStateNotification();
      return true;
    }
  }), [scheduleUndoRedoStateNotification]);

  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    registerChemdLanguage(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    cursorDisposableRef.current?.dispose();
    blurDisposableRef.current?.dispose();
    contentDisposableRef.current?.dispose();
    cursorDisposableRef.current = editorInstance.onDidChangeCursorPosition((event) => {
      onCursorPositionChange?.({
        lineNumber: event.position.lineNumber,
        column: event.position.column
      });
    });
    const position = editorInstance.getPosition();
    if (position) {
      onCursorPositionChange?.({
        lineNumber: position.lineNumber,
        column: position.column
      });
    }
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current();
    });
    blurDisposableRef.current = editorInstance.onDidBlurEditorText(() => {
      onBlurSaveRef.current?.();
    });
    contentDisposableRef.current = editorInstance.onDidChangeModelContent(() => {
      scheduleUndoRedoStateNotification();
    });
    notifyUndoRedoState();
    syncMarkers();
  }, [notifyUndoRedoState, onCursorPositionChange, scheduleUndoRedoStateNotification, syncMarkers]);

  const handleChange = useCallback<OnChange>((nextValue) => {
    onChange(nextValue ?? "");
  }, [onChange]);

  const editorOptions = useMemo<editor.IStandaloneEditorConstructionOptions>(() => ({
    automaticLayout: true,
    fixedOverflowWidgets: true,
    fontFamily: EDITOR_FONT_FAMILY,
    fontLigatures: false,
    fontSize: typography.fontSize,
    letterSpacing: 0,
    lineHeight: typography.lineHeight,
    disableMonospaceOptimizations: true,
    glyphMargin: true,
    lineDecorationsWidth: 12,
    lineNumbers: editorSettings.lineNumbers,
    lineNumbersMinChars: editorSettings.lineNumbers === "off" ? 0 : 4,
    minimap: { enabled: editorSettings.minimap },
    renderLineHighlight: "line",
    renderWhitespace: "selection",
    padding: { bottom: scrollBottomPadding },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    wordWrap: editorSettings.wordWrap ? "on" : "off",
    wrappingStrategy: "advanced"
  }), [
    editorSettings.lineNumbers,
    editorSettings.minimap,
    editorSettings.wordWrap,
    scrollBottomPadding,
    typography.fontSize,
    typography.lineHeight,
  ]);

  return (
    <div ref={shellRef} className="monaco-shell min-h-0 flex-1 overflow-hidden bg-[var(--reference-surface-bg)]" data-language={CHEMD_LANGUAGE_ID}>
      <Editor
        height="100%"
        width="100%"
        language={CHEMD_LANGUAGE_ID}
        path={modelPath}
        value={value}
        theme={CHEMD_THEME_ID}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={handleChange}
        loading={<div className="monaco-loading flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading Monaco editor...</div>}
        options={editorOptions}
      />
    </div>
  );
});

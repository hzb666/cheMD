import { loader, Editor, type BeforeMount, type Monaco, type OnChange, type OnMount } from "@monaco-editor/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { editor, languages } from "monaco-editor";
import "monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";
import "monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css";
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
import {
  cleanupChemdSemanticTokenOutput,
  registerChemdSemanticProviders,
  updateChemdSemanticTokenOutput
} from "./semantic-tokens";
import type { AppSettings, ResolvedTheme } from "../settings/settings";
import {
  toChemdModelUri,
  type MonacoChemdEditorHandle,
  type MonacoCursorPosition,
  type MonacoUndoRedoState,
  type MonacoSourceJumpIntent
} from "./source-path";
import {
  findChemdBlockPathAtLine,
  findChemdFencePairAtLine,
  flattenChemdBlockStructure,
  parseChemdBlockStructure,
  type ChemdFencePair,
  type ChemdBlockNode,
} from "./chemd-block-structure";

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
const CHEMD_LIGHT_THEME_ID = "chemd-desktop-light";
const CHEMD_DARK_THEME_ID = "chemd-desktop-dark";
const CHEMD_FENCE_PAIR_LINE_CLASS = "chemd-fence-pair-line";
const CHEMD_FENCE_PAIR_GLYPH_CLASS = "chemd-fence-pair-glyph";
const CHEMD_BLOCK_SCOPE_GLYPH_CLASS = "chemd-block-scope-glyph";
const MONACO_TRANSPARENT_COLOR = "#00000000";
const EDITOR_FONT_FAMILY = "\"JetBrains Mono\"";

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

let monacoEditorContributionsReady: Promise<void> | null = null;

const loadMonacoEditorContributions = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();

  monacoEditorContributionsReady ??= Promise.all([
    import("monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js"),
    import("monaco-editor/esm/vs/editor/contrib/stickyScroll/browser/stickyScrollContribution.js"),
  ]).then(() => undefined);

  return monacoEditorContributionsReady;
};

type MonacoEditor = editor.IStandaloneCodeEditor;
type MonacoDisposable = { dispose: () => void };
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

let chemdFoldingProviderDisposable: MonacoDisposable | null = null;
let chemdDocumentSymbolProviderDisposable: MonacoDisposable | null = null;

type MonacoChemdEditorProps = {
  value: string;
  documentPath: string;
  compileOutput: ChemdLanguageCompileOutput;
  workspaceSymbolIndex?: ChemdWorkspaceSymbolIndex | null;
  editorSettings: Pick<AppSettings, "editorFontSize" | "lineNumbers" | "minimap" | "wordWrap">;
  resolvedTheme: ResolvedTheme;
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

export const createChemdLanguageConfiguration = (): languages.LanguageConfiguration => ({
  comments: { lineComment: "//" },
  brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "\"", close: "\"", notIn: ["string", "comment"] },
    { open: "'", close: "'", notIn: ["string", "comment"] }
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "\"", close: "\"" },
    { open: "'", close: "'" }
  ],
  wordPattern: /#?@?[A-Za-z0-9_.#/-]+/u,
  folding: {
    markers: {
      start: /^\s*:::\s*[a-z][\w-]*(?:\s+.*)?\s*$/iu,
      end: /^\s*:::\s*$/u
    }
  },
  indentationRules: {
    increaseIndentPattern: /^\s*:::\s*[a-z][\w-]*(?:\s+.*)?\s*$/iu,
    decreaseIndentPattern: /^\s*:::\s*$/u
  }
});

const configureChemdLanguage = (monaco: Monaco): void => {
  monaco.languages.setLanguageConfiguration(
    CHEMD_LANGUAGE_ID,
    createChemdLanguageConfiguration()
  );
};

export const createChemdMonarchTokensProvider = (): languages.IMonarchLanguage => ({
  defaultToken: "",
  tokenPostfix: ".chemd",
  tokenizer: {
    root: [
      [/^---$/, "delimiter.frontmatter"],
      [/^:::\s*$/, "delimiter.block"],
      [/^:::\s*([a-zA-Z][\w-]*)/, "keyword.block"],
      [/:chem\[[^\]]*\]/, "string.chem"],
      [/@[A-Za-z0-9_.#/-]+/, "identifier.reference"],
      [/#[A-Za-z0-9_-]+/, "identifier.declaration"],
      [/^\s*[A-Za-z_][\w-]*(?=\s*:)/, "attribute.name"],
      [/\b(kind|reactants|products|conditions|status|yield|amount|smiles|method|target|result)\b(?=\s*:)/, "attribute.name"],
      [/\b(error|failed|warning|pending|accepted|ready|ok)\b/, "keyword.status"],
      [/\b\d+(?:\.\d+)?\s*(?:mg|g|kg|ug|µg|ml|mL|L|M|mM|mol|mmol|eq|%|degC|°C|K|h|min|s|rpm|bar|atm|psi|pH)(?=$|[^\w%°µ])/u, "number.quantity"],
      [/\/\/.*$/, "comment"],
      [/"[^"]*"/, "string"],
      [/'[^']*'/, "string"]
    ]
  }
});

const configureChemdTokens = (monaco: Monaco): void => {
  monaco.languages.setMonarchTokensProvider(
    CHEMD_LANGUAGE_ID,
    createChemdMonarchTokensProvider()
  );
};

const createFencePairDecorations = (
  monaco: Monaco,
  model: editor.ITextModel,
  pair: ChemdFencePair
): editor.IModelDeltaDecoration[] =>
  [...new Set([pair.openLine, pair.closeLine])]
    .filter((lineNumber) => lineNumber >= 1 && lineNumber <= model.getLineCount())
    .map((lineNumber) => ({
      range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
      options: {
        className: CHEMD_FENCE_PAIR_LINE_CLASS,
        isWholeLine: true,
        linesDecorationsClassName: CHEMD_FENCE_PAIR_GLYPH_CLASS,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }));

const createBlockScopeDecorations = (
  monaco: Monaco,
  model: editor.ITextModel,
  lineNumber: number
): editor.IModelDeltaDecoration[] =>
  findChemdBlockPathAtLine(parseChemdBlockStructure(model.getValue()), lineNumber)
    .map((node) => ({
      range: new monaco.Range(
        node.startLine,
        1,
        node.endLine,
        model.getLineMaxColumn(node.endLine)
      ),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: CHEMD_BLOCK_SCOPE_GLYPH_CLASS,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }));

const createRangeForBlock = (
  monaco: Monaco,
  model: editor.ITextModel,
  node: ChemdBlockNode
): languages.DocumentSymbol["range"] =>
  new monaco.Range(node.startLine, 1, node.endLine, model.getLineMaxColumn(node.endLine));

const createSelectionRangeForBlock = (
  monaco: Monaco,
  node: ChemdBlockNode
): languages.DocumentSymbol["selectionRange"] =>
  new monaco.Range(node.startLine, 1, node.startLine, node.header.length + 1);

const toDocumentSymbol = (
  monaco: Monaco,
  model: editor.ITextModel,
  node: ChemdBlockNode
): languages.DocumentSymbol => ({
  name: node.label,
  detail: node.header,
  kind: monaco.languages.SymbolKind.Object,
  tags: [],
  range: createRangeForBlock(monaco, model, node),
  selectionRange: createSelectionRangeForBlock(monaco, node),
  children: node.children.map((child) => toDocumentSymbol(monaco, model, child))
});

const registerChemdStructureProviders = (monaco: Monaco): void => {
  if (!chemdFoldingProviderDisposable) {
    chemdFoldingProviderDisposable = monaco.languages.registerFoldingRangeProvider(
      CHEMD_LANGUAGE_ID,
      {
        provideFoldingRanges: (model: editor.ITextModel) =>
          flattenChemdBlockStructure(parseChemdBlockStructure(model.getValue()))
            .filter((node) => node.endLine > node.startLine)
            .map((node) => ({
              start: node.startLine,
              end: node.endLine,
              kind: monaco.languages.FoldingRangeKind.Region
            }))
      }
    );
  }

  if (!chemdDocumentSymbolProviderDisposable) {
    chemdDocumentSymbolProviderDisposable = monaco.languages.registerDocumentSymbolProvider(
      CHEMD_LANGUAGE_ID,
      {
        provideDocumentSymbols: (model: editor.ITextModel) =>
          parseChemdBlockStructure(model.getValue()).map((node) => toDocumentSymbol(monaco, model, node))
      }
    );
  }
};

export const toChemdMonacoThemeId = (theme: ResolvedTheme): string =>
  theme === "dark" ? CHEMD_DARK_THEME_ID : CHEMD_LIGHT_THEME_ID;

const defineChemdTheme = (monaco: Monaco): void => {
  monaco.editor.defineTheme(CHEMD_LIGHT_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "delimiter.frontmatter", foreground: "64748b", fontStyle: "bold" },
      { token: "delimiter.block", foreground: "0f766e", fontStyle: "bold" },
      { token: "keyword", foreground: "0f766e", fontStyle: "bold" },
      { token: "keyword.block", foreground: "0f766e", fontStyle: "bold" },
      { token: "identifier.declaration", foreground: "7c3aed" },
      { token: "identifier.reference", foreground: "2563eb" },
      { token: "variable", foreground: "7c3aed" },
      { token: "variable.reference", foreground: "2563eb" },
      { token: "parameter", foreground: "9333ea" },
      { token: "attribute.name", foreground: "1d4ed8" },
      { token: "property", foreground: "1d4ed8" },
      { token: "keyword.status", foreground: "b45309" },
      { token: "number.quantity", foreground: "047857" },
      { token: "number", foreground: "047857" },
      { token: "string.chem", foreground: "0f766e" },
      { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
      { token: "string", foreground: "be123c" }
    ],
    colors: {
      "editor.background": MONACO_TRANSPARENT_COLOR,
      "editor.foreground": "#0f172a",
      "editorGutter.background": MONACO_TRANSPARENT_COLOR,
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#334155",
      "editor.selectionBackground": "#bae6fd",
      "editor.lineHighlightBackground": "#305c5312",
      "editor.lineHighlightBorder": "#00000000",
      "editorStickyScroll.background": MONACO_TRANSPARENT_COLOR,
      "editorStickyScroll.border": "#d6dde733",
      "editorStickyScroll.shadow": "#64748b33",
      "editorStickyScrollHover.background": "#e2e8f04d",
      "editorStickyScrollGutter.background": MONACO_TRANSPARENT_COLOR
    }
  });
  monaco.editor.defineTheme(CHEMD_DARK_THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "delimiter.frontmatter", foreground: "94a3b8", fontStyle: "bold" },
      { token: "delimiter.block", foreground: "2dd4bf", fontStyle: "bold" },
      { token: "keyword", foreground: "2dd4bf", fontStyle: "bold" },
      { token: "keyword.block", foreground: "2dd4bf", fontStyle: "bold" },
      { token: "identifier.declaration", foreground: "c4b5fd" },
      { token: "identifier.reference", foreground: "93c5fd" },
      { token: "variable", foreground: "c4b5fd" },
      { token: "variable.reference", foreground: "93c5fd" },
      { token: "parameter", foreground: "d8b4fe" },
      { token: "attribute.name", foreground: "93c5fd" },
      { token: "property", foreground: "93c5fd" },
      { token: "keyword.status", foreground: "fbbf24" },
      { token: "number.quantity", foreground: "86efac" },
      { token: "number", foreground: "86efac" },
      { token: "string.chem", foreground: "5eead4" },
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "string", foreground: "fda4af" }
    ],
    colors: {
      "editor.background": MONACO_TRANSPARENT_COLOR,
      "editor.foreground": "#dbe4ee",
      "editorGutter.background": MONACO_TRANSPARENT_COLOR,
      "editorLineNumber.foreground": "#64748b",
      "editorLineNumber.activeForeground": "#cbd5e1",
      "editor.selectionBackground": "#164e6378",
      "editor.lineHighlightBackground": "#e2e8f00d",
      "editor.lineHighlightBorder": "#00000000",
      "editorStickyScroll.background": MONACO_TRANSPARENT_COLOR,
      "editorStickyScroll.border": "#4755694d",
      "editorStickyScroll.shadow": "#02061780",
      "editorStickyScrollHover.background": "#33415566",
      "editorStickyScrollGutter.background": MONACO_TRANSPARENT_COLOR
    }
  });
};

const registerChemdLanguage = (monaco: Monaco): void => {
  registerChemdLanguageMetadata(monaco);
  configureChemdLanguage(monaco);
  configureChemdTokens(monaco);
  registerChemdStructureProviders(monaco);
  defineChemdTheme(monaco);
  registerChemdCodeActionProvider(monaco, CHEMD_LANGUAGE_ID);
  registerChemdCompletionProvider(monaco, CHEMD_LANGUAGE_ID);
  registerChemdNavigationProviders(monaco, CHEMD_LANGUAGE_ID);
  registerChemdSemanticProviders(monaco, CHEMD_LANGUAGE_ID);
};

export const MonacoChemdEditor = forwardRef<MonacoChemdEditorHandle, MonacoChemdEditorProps>(function MonacoChemdEditor({
  value,
  documentPath,
  compileOutput,
  workspaceSymbolIndex,
  editorSettings,
  resolvedTheme,
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
  const fencePairDecorationIdsRef = useRef<string[]>([]);
  const undoRedoNotifyTimeoutRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const onBlurSaveRef = useRef(onBlurSave);
  const onUndoRedoStateChangeRef = useRef(onUndoRedoStateChange);
  const [contributionsReady, setContributionsReady] = useState(() => typeof window === "undefined");
  const [typography, setTypography] = useState<MonacoTypography>(createDefaultMonacoTypography);
  const [scrollBottomPadding, setScrollBottomPadding] = useState(0);
  const markers = useMemo(
    () => toMonacoLanguageServiceModel(compileOutput).markers.map(toEditorMarker),
    [compileOutput]
  );
  const modelPath = useMemo(() => toChemdModelUri(documentPath), [documentPath]);
  const monacoThemeId = toChemdMonacoThemeId(resolvedTheme);

  useEffect(() => {
    updateChemdCodeActionOutput(modelPath, compileOutput);
    updateChemdCompletionOutput(modelPath, compileOutput);
    updateChemdNavigationOutput(modelPath, compileOutput);
    updateChemdSemanticTokenOutput(modelPath, compileOutput);
    return () => {
      cleanupChemdCodeActionOutput(modelPath, compileOutput);
      cleanupChemdCompletionOutput(modelPath, compileOutput);
      cleanupChemdNavigationOutput(modelPath, compileOutput);
      cleanupChemdSemanticTokenOutput(modelPath, compileOutput);
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
    fencePairDecorationIdsRef.current = [];
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

  const updateFencePairDecorations = useCallback((lineNumber?: number) => {
    const editorInstance = editorRef.current;
    const monaco = monacoRef.current;
    const model = editorInstance?.getModel();

    if (!editorInstance || !monaco || !model) {
      return;
    }

    const currentLine = lineNumber ?? editorInstance.getPosition()?.lineNumber;
    const pair = currentLine
      ? findChemdFencePairAtLine(parseChemdBlockStructure(model.getValue()), currentLine)
      : undefined;
    if (!currentLine) {
      fencePairDecorationIdsRef.current = editorInstance.deltaDecorations(
        fencePairDecorationIdsRef.current,
        []
      );
      return;
    }

    const decorations = [
      ...createBlockScopeDecorations(monaco, model, currentLine),
      ...(pair ? createFencePairDecorations(monaco, model, pair) : [])
    ];

    fencePairDecorationIdsRef.current = editorInstance.deltaDecorations(
      fencePairDecorationIdsRef.current,
      decorations
    );
  }, []);

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
      updateFencePairDecorations(event.position.lineNumber);
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
      updateFencePairDecorations();
    });
    notifyUndoRedoState();
    syncMarkers();
    updateFencePairDecorations();
  }, [
    notifyUndoRedoState,
    onCursorPositionChange,
    scheduleUndoRedoStateNotification,
    syncMarkers,
    updateFencePairDecorations,
  ]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(monacoThemeId);
  }, [monacoThemeId]);

  const handleChange = useCallback<OnChange>((nextValue) => {
    onChange(nextValue ?? "");
  }, [onChange]);

  useEffect(() => {
    let isMounted = true;

    void loadMonacoEditorContributions().then(() => {
      if (isMounted) {
        setContributionsReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

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
    "semanticHighlighting.enabled": true,
    smoothScrolling: true,
    stickyScroll: {
      defaultModel: "foldingProviderModel",
      enabled: true,
      maxLineCount: 2,
      scrollWithEditor: true
    },
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
    <div ref={shellRef} className="monaco-shell min-h-0 flex-1 overflow-hidden bg-[var(--editor-workspace-surface)]" data-language={CHEMD_LANGUAGE_ID}>
      {contributionsReady ? (
        <Editor
          height="100%"
          width="100%"
          language={CHEMD_LANGUAGE_ID}
          path={modelPath}
          value={value}
          theme={monacoThemeId}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={handleChange}
          loading={<div className="monaco-loading flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading Monaco editor...</div>}
          options={editorOptions}
        />
      ) : (
        <div className="monaco-loading flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading Monaco editor...</div>
      )}
    </div>
  );
});

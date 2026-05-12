import { loader, Editor, type BeforeMount, type Monaco, type OnChange, type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { editor } from "monaco-editor";
import * as monacoRuntime from "monaco-editor/esm/vs/editor/editor.api.js";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

import { toMonacoLanguageServiceModel, type ChemdLanguageCompileOutput, type MonacoMarkerLike } from "@chemd/language-service";

export const CHEMD_LANGUAGE_ID = "chemd";

const CHEMD_MARKER_OWNER = "chemd-language-service";
const CHEMD_THEME_ID = "chemd-desktop";

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

type MonacoChemdEditorProps = {
  value: string;
  documentPath: string;
  compileOutput: ChemdLanguageCompileOutput;
  onChange: (nextSource: string) => void;
  onSave: () => void;
};

const encodeModelPathSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(/%2F/gi, "/");

const toModelPath = (documentPath: string): string => {
  const normalizedPath = documentPath.trim().replace(/\\/g, "/");
  const encodedPath = normalizedPath
    ? normalizedPath.split("/").filter(Boolean).map(encodeModelPathSegment).join("/")
    : "untitled.chemd.md";

  return `chemd://desktop/${encodedPath}`;
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

const registerChemdLanguage = (monaco: Monaco): void => {
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
      "editor.background": "#f8fafc",
      "editor.foreground": "#0f172a",
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#334155",
      "editor.selectionBackground": "#bae6fd",
      "editor.lineHighlightBackground": "#e2e8f040"
    }
  });
};

export const MonacoChemdEditor = ({
  value,
  documentPath,
  compileOutput,
  onChange,
  onSave
}: MonacoChemdEditorProps) => {
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onSaveRef = useRef(onSave);
  const markers = useMemo(
    () => toMonacoLanguageServiceModel(compileOutput).markers.map(toEditorMarker),
    [compileOutput]
  );
  const modelPath = useMemo(() => toModelPath(documentPath), [documentPath]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

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

  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    registerChemdLanguage(monaco);
  }, []);

  const handleMount = useCallback<OnMount>((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current();
    });
    syncMarkers();
  }, [syncMarkers]);

  const handleChange = useCallback<OnChange>((nextValue) => {
    onChange(nextValue ?? "");
  }, [onChange]);

  return (
    <div className="desktop-monaco-shell" data-language={CHEMD_LANGUAGE_ID}>
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
        loading={<div className="desktop-monaco-loading">Loading Monaco editor...</div>}
        options={{
          automaticLayout: true,
          fixedOverflowWidgets: true,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          glyphMargin: true,
          lineDecorationsWidth: 12,
          lineNumbersMinChars: 4,
          minimap: { enabled: false },
          renderLineHighlight: "line",
          renderWhitespace: "selection",
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: "on"
        }}
      />
    </div>
  );
};

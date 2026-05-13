import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Range } from "monaco-editor";
import {
  createSourceHash,
  toMonacoLanguageServiceModel,
  type ChemdLanguageCompileOutput,
  type MonacoCodeActionLike
} from "@chemd/language-service";

type MonacoDisposable = { dispose: () => void };

type CodeActionProviderOptions = {
  getCompileOutput: () => ChemdLanguageCompileOutput | undefined;
};

const QUICK_FIX_KIND = "quickfix";

let activeRegistration: {
  id: symbol;
  disposable: MonacoDisposable;
} | null = null;

const toMonacoRange = (
  monaco: Monaco,
  range: MonacoCodeActionLike["edit"]["edits"][number]["range"]
): Range =>
  new monaco.Range(
    range.startLineNumber,
    range.startColumn,
    range.endLineNumber,
    range.endColumn
  );

const markerMatchesAction = (
  markers: readonly editor.IMarkerData[],
  action: MonacoCodeActionLike
): boolean => {
  if (markers.length === 0) {
    return true;
  }
  return action.diagnostics.some((diagnostic) =>
    markers.some((marker) =>
      marker.code === diagnostic.code
      && marker.startLineNumber === diagnostic.startLineNumber
      && marker.startColumn === diagnostic.startColumn
    )
  );
};

export const toChemdCodeAction = (
  monaco: Monaco,
  model: editor.ITextModel,
  action: MonacoCodeActionLike,
  sourceHash: string
): languages.CodeAction => {
  if (action.data.patch.beforeHash !== sourceHash) {
    return {
      title: action.title,
      diagnostics: action.diagnostics,
      kind: QUICK_FIX_KIND,
      disabled: "Chemd source changed after diagnostics were produced. Recompile before applying this quick fix."
    };
  }

  return {
    title: action.title,
    diagnostics: action.diagnostics,
    kind: QUICK_FIX_KIND,
    isPreferred: action.data.diagnosticCode === "W_CHEMD_KIND_AMBIGUOUS",
    edit: {
      edits: action.edit.edits.map((edit) => ({
        resource: model.uri,
        textEdit: {
          range: toMonacoRange(monaco, edit.range),
          text: edit.text
        },
        versionId: model.getVersionId()
      }))
    }
  };
};

const provideCodeActions = (
  monaco: Monaco,
  model: editor.ITextModel,
  context: languages.CodeActionContext,
  options: CodeActionProviderOptions
): languages.CodeActionList => {
  const output = options.getCompileOutput();
  const sourceHash = createSourceHash(model.getValue());
  const actions = output
    ? toMonacoLanguageServiceModel(output).codeActions
      .filter((action) => markerMatchesAction(context.markers, action))
      .map((action) => toChemdCodeAction(monaco, model, action, sourceHash))
    : [];

  return {
    actions,
    dispose: () => undefined
  };
};

export const registerChemdCodeActionProvider = (
  monaco: Monaco,
  languageId: string,
  options: CodeActionProviderOptions
): MonacoDisposable => {
  activeRegistration?.disposable.dispose();

  const id = Symbol(languageId);
  const disposable = monaco.languages.registerCodeActionProvider(languageId, {
    provideCodeActions: (
      model: editor.ITextModel,
      _range: Range,
      context: languages.CodeActionContext
    ) => provideCodeActions(monaco, model, context, options)
  }, {
    providedCodeActionKinds: [QUICK_FIX_KIND]
  });
  activeRegistration = { id, disposable };

  return {
    dispose: () => {
      if (activeRegistration?.id !== id) {
        return;
      }
      activeRegistration.disposable.dispose();
      activeRegistration = null;
    }
  };
};

import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Range } from "monaco-editor";

import {
  toMonacoCodeActions,
  type ChemdEditorDiagnostic,
  type ChemdLanguageCompileOutput,
  type ChemdSourceRange,
  type MonacoCodeActionLike,
  type MonacoMarkerLike,
  type MonacoRangeLike
} from "@chemd/language-service";

type MonacoModel = editor.ITextModel;
type MonacoDisposable = { dispose: () => void };
type ChemdMonacoCodeAction = languages.CodeAction & {
  data?: MonacoCodeActionLike["data"];
};

const CHEMD_QUICK_FIX_KIND = "quickfix";
const chemdCodeActionOutputsByUri = new Map<string, ChemdLanguageCompileOutput>();
let chemdCodeActionProviderDisposable: MonacoDisposable | null = null;

export const updateChemdCodeActionOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  chemdCodeActionOutputsByUri.set(documentUri, compileOutput);
};

export const cleanupChemdCodeActionOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  if (chemdCodeActionOutputsByUri.get(documentUri) === compileOutput) {
    chemdCodeActionOutputsByUri.delete(documentUri);
  }
};

export const registerChemdCodeActionProvider = (
  monaco: Monaco,
  languageId: string
): void => {
  if (chemdCodeActionProviderDisposable) {
    return;
  }

  chemdCodeActionProviderDisposable = monaco.languages.registerCodeActionProvider(
    languageId,
    createChemdCodeActionProvider(monaco),
    { providedCodeActionKinds: [CHEMD_QUICK_FIX_KIND] }
  );
};

const createChemdCodeActionProvider = (
  monaco: Monaco
): languages.CodeActionProvider => ({
  provideCodeActions: (model, range, context) => {
    try {
      const compileOutput = getCompileOutputForModel(model);
      const diagnostics = getApplicableDiagnostics(compileOutput, range, context);
      return {
        actions: diagnostics.flatMap((diagnostic) =>
          toMonacoCodeActions(diagnostic).map((action) =>
            toMonacoCodeAction(action, monaco, model)
          )
        ),
        dispose: () => undefined
      };
    } catch {
      return { actions: [], dispose: () => undefined };
    }
  }
});

const getCompileOutputForModel = (
  model: MonacoModel
): ChemdLanguageCompileOutput | undefined =>
  chemdCodeActionOutputsByUri.get(model.uri.toString());

const getApplicableDiagnostics = (
  compileOutput: ChemdLanguageCompileOutput | undefined,
  range: Range,
  context: languages.CodeActionContext
): ChemdEditorDiagnostic[] => {
  if (!compileOutput || compileOutput.diagnostics.length === 0) {
    return [];
  }

  const markers = context.markers ?? [];
  if (markers.length > 0) {
    return compileOutput.diagnostics.filter((diagnostic) =>
      markers.some((marker) => matchesMarker(diagnostic, marker))
    );
  }

  return compileOutput.diagnostics.filter((diagnostic) =>
    rangesIntersect(diagnostic.range, range)
  );
};

const matchesMarker = (
  diagnostic: ChemdEditorDiagnostic,
  marker: editor.IMarkerData
): boolean =>
  marker.code === diagnostic.code
  && rangesEqual(diagnostic.range, marker);

const rangesEqual = (
  left: ChemdSourceRange,
  right: MonacoRangeLike
): boolean =>
  left.startLine === right.startLineNumber
  && left.startColumn === right.startColumn
  && left.endLine === right.endLineNumber
  && left.endColumn === right.endColumn;

const rangesIntersect = (
  left: ChemdSourceRange,
  right: Range
): boolean =>
  left.startLine <= right.endLineNumber
  && left.endLine >= right.startLineNumber;

const toMonacoCodeAction = (
  action: MonacoCodeActionLike,
  monaco: Monaco,
  model: MonacoModel
): ChemdMonacoCodeAction => ({
  title: action.title,
  kind: CHEMD_QUICK_FIX_KIND,
  diagnostics: action.diagnostics.map((diagnostic) =>
    toMarkerData(diagnostic)
  ),
  edit: {
    edits: action.edit.edits.map((edit) => ({
      resource: model.uri,
      textEdit: {
        range: toRange(monaco, edit.range),
        text: edit.text
      },
      versionId: model.getVersionId(),
      metadata: {
        needsConfirmation: false,
        label: action.title,
        description: `proposal=${action.data.id}; beforeHash=${action.data.patch.beforeHash}`
      }
    }))
  },
  data: action.data
});

const toMarkerData = (marker: MonacoMarkerLike): editor.IMarkerData => ({
  startLineNumber: marker.startLineNumber,
  startColumn: marker.startColumn,
  endLineNumber: marker.endLineNumber,
  endColumn: marker.endColumn,
  code: marker.code,
  message: marker.message,
  severity: marker.severity as editor.IMarkerData["severity"],
  source: marker.source
});

const toRange = (
  monaco: Monaco,
  range: MonacoRangeLike
) =>
  new monaco.Range(
    range.startLineNumber,
    range.startColumn,
    range.endLineNumber,
    range.endColumn
  );

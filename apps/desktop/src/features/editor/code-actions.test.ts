import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";

import {
  compileChemdForEditor,
  type ChemdEditorDiagnostic,
  toMonacoMarker
} from "@chemd/language-service";
import {
  cleanupChemdCodeActionOutput,
  registerChemdCodeActionProvider,
  updateChemdCodeActionOutput
} from "./code-actions";

const source = `module exp_monaco_code_actions

meta {
  id: "exp-monaco-code-actions"
  title: "Monaco code actions"
  date: "2026-05-13"
}

reaction rxn_main {
  reactants: [@missing_molecule]
  products: [product]
}
`;

const createModel = (
  text: string,
  documentUri: string
): editor.ITextModel => ({
  uri: {
    path: "/code-actions.chemd",
    toString: () => documentUri
  },
  getValue: () => text,
  getVersionId: () => 7
} as unknown as editor.ITextModel);

const createContext = (
  markers: editor.IMarkerData[]
): languages.CodeActionContext => ({
  markers,
  trigger: 1 as languages.CodeActionTriggerType
});

const createMonaco = (
  providers: languages.CodeActionProvider[],
  providedKinds: string[][]
): Monaco => ({
  Range: class {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;

    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number
    ) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  },
  languages: {
    registerCodeActionProvider: (
      _languageId: string,
      provider: languages.CodeActionProvider,
      metadata?: languages.CodeActionProviderMetadata
    ) => {
      providers.push(provider);
      providedKinds.push([...metadata?.providedCodeActionKinds ?? []]);
      return { dispose: () => undefined };
    }
  }
} as unknown as Monaco);

describe("chemd Monaco code action provider", () => {
  it("registers once and maps cached diagnostics to quick-fix workspace edits", async () => {
    const providers: languages.CodeActionProvider[] = [];
    const providedKinds: string[][] = [];
    const monaco = createMonaco(providers, providedKinds);
    const documentUri = "chemd://desktop/code-actions.chemd";
    const model = createModel(source, documentUri);
    const requestRange = new monaco.Range(1, 1, 20, 1);

    registerChemdCodeActionProvider(monaco, "chemd");
    registerChemdCodeActionProvider(monaco, "chemd");

    const emptyResult = await providers[0].provideCodeActions(
      model,
      requestRange,
      createContext([]),
      {} as never
    );

    const compileOutput = compileChemdForEditor({
      source,
      documentUri
    });
    const diagnostic = compileOutput.diagnostics.find((item) =>
      item.severity === "error"
    );
    if (!diagnostic) {
      throw new Error("Expected unresolved program reference diagnostic");
    }
    const diagnosticWithQuickFixes: ChemdEditorDiagnostic = {
      ...diagnostic,
      quickFixes: [
        {
          id: "test:declare-molecule",
          title: "Declare molecule kind",
          diagnosticCode: diagnostic.code,
          sourceRange: diagnostic.range,
          patch: {
            beforeHash: "before-molecule",
            edits: [{
              range: diagnostic.range,
              replacement: `molecule missing_molecule {\n  smiles: "CCO"\n}\n\n${source}`
            }]
          }
        },
        {
          id: "test:declare-reaction",
          title: "Declare reaction kind",
          diagnosticCode: diagnostic.code,
          sourceRange: diagnostic.range,
          patch: {
            beforeHash: "before-reaction",
            edits: [{
              range: diagnostic.range,
              replacement: source.replace("@missing_molecule", "product")
            }]
          }
        }
      ]
    };
    const outputWithQuickFixes = {
      ...compileOutput,
      diagnostics: [diagnosticWithQuickFixes]
    };

    updateChemdCodeActionOutput(documentUri, outputWithQuickFixes);
    const result = await providers[0].provideCodeActions(
      model,
      requestRange,
      createContext([toMonacoMarker(diagnosticWithQuickFixes) as editor.IMarkerData]),
      {} as never
    );
    cleanupChemdCodeActionOutput(documentUri, outputWithQuickFixes);
    const cleanedResult = await providers[0].provideCodeActions(
      model,
      requestRange,
      createContext([]),
      {} as never
    );

    expect(providers).toHaveLength(1);
    expect(providedKinds).toEqual([["quickfix"]]);
    expect(emptyResult?.actions).toEqual([]);
    expect(cleanedResult?.actions).toEqual([]);
    expect(result?.actions).toHaveLength(2);
    expect(result?.actions[0]).toMatchObject({
      title: diagnosticWithQuickFixes.quickFixes[0].title,
      kind: "quickfix",
      data: expect.objectContaining({
        id: diagnosticWithQuickFixes.quickFixes[0].id
      })
    });
    expect(result?.actions[1]).toMatchObject({
      title: diagnosticWithQuickFixes.quickFixes[1].title,
      kind: "quickfix",
      data: expect.objectContaining({
        id: diagnosticWithQuickFixes.quickFixes[1].id
      })
    });

    const edit = result?.actions[0].edit?.edits[0];
    expect(edit).toMatchObject({
      resource: model.uri,
      versionId: 7,
      textEdit: {
        text: expect.stringContaining("molecule missing_molecule")
      },
      metadata: {
        needsConfirmation: false,
        label: diagnosticWithQuickFixes.quickFixes[0].title,
        description: expect.stringContaining(diagnosticWithQuickFixes.quickFixes[0].patch.beforeHash)
      }
    });
  });
});

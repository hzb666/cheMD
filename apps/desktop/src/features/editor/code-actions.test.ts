import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";

import {
  compileChemdForEditor,
  toMonacoMarker
} from "@chemd/language-service";
import {
  cleanupChemdCodeActionOutput,
  registerChemdCodeActionProvider,
  updateChemdCodeActionOutput
} from "./code-actions";

const source = `---
id: exp-monaco-code-actions
title: Monaco code actions
date: 2026-05-13
---

:::chemd #mol-main
smiles: CCO
:::
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
      documentUri,
      options: { strictChemdKind: true }
    });
    const diagnostic = compileOutput.diagnostics.find((item) =>
      item.code === "W_CHEMD_KIND_AMBIGUOUS"
    );
    if (!diagnostic) {
      throw new Error("Expected W_CHEMD_KIND_AMBIGUOUS diagnostic");
    }

    updateChemdCodeActionOutput(documentUri, compileOutput);
    const result = await providers[0].provideCodeActions(
      model,
      requestRange,
      createContext([toMonacoMarker(diagnostic) as editor.IMarkerData]),
      {} as never
    );
    cleanupChemdCodeActionOutput(documentUri, compileOutput);
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
    expect(result?.actions).toHaveLength(1);
    expect(result?.actions[0]).toMatchObject({
      title: diagnostic.quickFixes[0].title,
      kind: "quickfix",
      data: expect.objectContaining({
        id: diagnostic.quickFixes[0].id
      })
    });

    const edit = result?.actions[0].edit?.edits[0];
    expect(edit).toMatchObject({
      resource: model.uri,
      versionId: 7,
      textEdit: {
        text: expect.stringContaining("kind: molecule")
      },
      metadata: {
        needsConfirmation: false,
        label: diagnostic.quickFixes[0].title,
        description: expect.stringContaining(diagnostic.quickFixes[0].patch.beforeHash)
      }
    });
  });
});

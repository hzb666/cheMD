import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";
import {
  compileChemdForEditor,
  createSourceHash,
  type MonacoCodeActionLike
} from "@chemd/language-service";

import {
  registerChemdCodeActionProvider,
  toChemdCodeAction
} from "./chemd-code-action-provider";

const fakeMonaco = {
  Range: class {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;

    constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  },
  languages: {
    CodeActionKind: { QuickFix: "quickfix" },
    registerCodeActionProvider: () => ({ dispose: () => undefined })
  }
} as unknown as Monaco;

const fakeModel = (source: string): editor.ITextModel => ({
  uri: { toString: () => "chemd://desktop/current.chemd.md" },
  getValue: () => source,
  getVersionId: () => 7
} as unknown as editor.ITextModel);

const quickFixAction = (source: string): MonacoCodeActionLike => ({
  title: "Insert kind: reaction",
  diagnostics: [{
    code: "W_CHEMD_KIND_AMBIGUOUS",
    message: "Missing kind",
    severity: 4,
    source: "chemd",
    startLineNumber: 3,
    startColumn: 1,
    endLineNumber: 3,
    endColumn: 9
  }],
  edit: {
    edits: [{
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 1
      },
      text: source.replace(":::chemd", ":::chemd kind: reaction")
    }]
  },
  data: {
    id: "W_CHEMD_KIND_AMBIGUOUS:rxn-a:kind:1",
    title: "Insert kind: reaction",
    diagnosticCode: "W_CHEMD_KIND_AMBIGUOUS",
    sourceRange: {
      startLine: 3,
      startColumn: 1,
      endLine: 3,
      endColumn: 9
    },
    patch: {
      beforeHash: createSourceHash(source),
      edits: []
    }
  }
});

describe("chemd Monaco code action provider", () => {
  it("maps a valid quick fix into a Monaco workspace edit", () => {
    const source = ":::chemd\nid: rxn-a\n:::\n";
    const action = toChemdCodeAction(
      fakeMonaco,
      fakeModel(source),
      quickFixAction(source),
      createSourceHash(source)
    );

    expect(action.kind).toBe("quickfix");
    expect(action.disabled).toBeUndefined();
    expect(action.edit?.edits).toHaveLength(1);
  });

  it("returns an edit that removes the originating diagnostic after recompilation", () => {
    const source = ":::chemd #mol-a\nsmiles: CCO\n:::\n";
    const output = compileChemdForEditor({
      source,
      options: { strictChemdKind: true }
    });
    const warning = output.diagnostics.find((item) =>
      item.code === "W_CHEMD_KIND_AMBIGUOUS"
    );
    const quickFix = warning?.quickFixes[0];

    expect(quickFix).toBeDefined();
    const nextOutput = compileChemdForEditor({
      source: quickFix?.patch.edits[0]?.replacement ?? source,
      options: { strictChemdKind: true }
    });

    expect(nextOutput.diagnostics.some((item) =>
      item.code === "W_CHEMD_KIND_AMBIGUOUS"
    )).toBe(false);
  });

  it("disables stale quick fixes when source hash changed", () => {
    const source = ":::chemd\nid: rxn-a\n:::\n";
    const action = toChemdCodeAction(
      fakeMonaco,
      fakeModel(`${source}changed: true\n`),
      quickFixAction(source),
      createSourceHash(`${source}changed: true\n`)
    );

    expect(action.disabled).toContain("source changed");
    expect(action.edit).toBeUndefined();
  });

  it("registers and disposes the Monaco provider", () => {
    const providers: languages.CodeActionProvider[] = [];
    const disposals: string[] = [];
    const monaco = {
      ...fakeMonaco,
      languages: {
        CodeActionKind: { QuickFix: "quickfix" },
        registerCodeActionProvider: (_languageId: string, provider: languages.CodeActionProvider) => {
          providers.push(provider);
          return { dispose: () => disposals.push("code-action") };
        }
      }
    } as unknown as Monaco;

    const disposable = registerChemdCodeActionProvider(monaco, "chemd", {
      getCompileOutput: () => undefined
    });

    expect(providers).toHaveLength(1);
    disposable.dispose();
    expect(disposals).toEqual(["code-action"]);
  });
});

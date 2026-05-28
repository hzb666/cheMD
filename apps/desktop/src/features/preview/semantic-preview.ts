import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput
} from "@chemd/language-service";

import {
  buildRenderableNodeTree,
  type ChemdRenderableNodeTreeV1
} from "@chemd/renderer-json";
import { renderRenderableHtml } from "@chemd/renderer-html";

export type SemanticPreviewState = "ready" | "fallback";

export type SemanticPreviewFallbackReason =
  | "compile_failed"
  | "missing_semantic_input";

export interface SemanticPreview {
  state: SemanticPreviewState;
  reason: SemanticPreviewFallbackReason | null;
  html: string;
  tree: ChemdRenderableNodeTreeV1 | null;
  message: string;
  diagnostics: ChemdEditorDiagnostic[];
  compiledAt: string;
  documentUri?: string;
}

const readyMessage = "Semantic preview is ready.";
const missingSemanticInputMessage = "Semantic preview is unavailable because the compile output has no semantic input.";

const copyDiagnostics = (
  diagnostics: readonly ChemdEditorDiagnostic[]
): ChemdEditorDiagnostic[] => diagnostics.map((diagnostic) => ({
  ...diagnostic,
  quickFixes: diagnostic.quickFixes.map((quickFix) => ({
    ...quickFix,
    patch: {
      ...quickFix.patch,
      edits: quickFix.patch.edits.map((edit) => ({ ...edit }))
    }
  }))
}));

const buildFallbackPreview = (
  input: ChemdLanguageCompileOutput,
  reason: SemanticPreviewFallbackReason,
  message: string
): SemanticPreview => ({
  state: "fallback",
  reason,
  html: "",
  tree: null,
  message,
  diagnostics: copyDiagnostics(input.diagnostics),
  compiledAt: input.compiledAt,
  documentUri: input.documentUri
});

export const buildSemanticPreview = (
  input: ChemdLanguageCompileOutput
): SemanticPreview => {
  if (input.status === "failed") {
    return buildFallbackPreview(input, "compile_failed", `Compile failed: ${input.error.message}`);
  }

  const renderInput = input.result.program ?? input.result.document;
  if (!renderInput) {
    return buildFallbackPreview(input, "missing_semantic_input", missingSemanticInputMessage);
  }

  const tree = buildRenderableNodeTree(renderInput, {
    sourceId: input.documentUri ?? input.result.document.meta.id,
    typedGraph: input.result.typedSemanticGraph
  });

  return {
    state: "ready",
    reason: null,
    html: renderRenderableHtml(tree, { className: "chemd-desktop-semantic-preview" }),
    tree,
    message: readyMessage,
    diagnostics: copyDiagnostics(input.diagnostics),
    compiledAt: input.compiledAt,
    documentUri: input.documentUri
  };
};

import { parseChemd } from "@chemd/parser";
import type { RenderSelection } from "@chemd/core";
import {
  mapRenderOptionsToAdapterPayload,
  resolveRenderProfileWithDiagnostics
} from "@chemd/render-profile";
import { renderHtml } from "@chemd/renderer-html";
import { renderDocxBridge } from "@chemd/renderer-docx";
import { renderJson } from "@chemd/renderer-json";
import { resolveChemd } from "@chemd/resolver";

export interface CompileResult {
  document: ReturnType<typeof resolveChemd>;
  diagnostics: ReturnType<typeof resolveChemd>["diagnostics"];
  renderOptions: ReturnType<typeof resolveRenderProfileWithDiagnostics>["options"];
  renderAdapterPayload: ReturnType<typeof mapRenderOptionsToAdapterPayload>;
  html: string;
  json: string;
  docxBridge: string;
}

export interface CompileOptions {
  renderSelection?: RenderSelection;
}

const mergeRenderSelection = (
  baseSelection: RenderSelection | undefined,
  overrideSelection: RenderSelection | undefined
): RenderSelection | undefined => {
  if (!baseSelection && !overrideSelection) {
    return undefined;
  }

  const mergedOverrides = {
    ...(baseSelection?.overrides ?? {}),
    ...(overrideSelection?.overrides ?? {})
  };

  return {
    ...baseSelection,
    ...overrideSelection,
    ...(Object.keys(mergedOverrides).length > 0 ? { overrides: mergedOverrides } : {})
  };
};

export const compileChemd = (source: string, options: CompileOptions = {}): CompileResult => {
  const parsedDocument = parseChemd(source);
  const resolvedDocument = resolveChemd(parsedDocument);
  const renderSelection = mergeRenderSelection(
    resolvedDocument.renderSelection,
    options.renderSelection
  );
  const renderProfileResolution = resolveRenderProfileWithDiagnostics(renderSelection);
  const document = renderProfileResolution.diagnostics.length
    ? {
        ...resolvedDocument,
        diagnostics: [...resolvedDocument.diagnostics, ...renderProfileResolution.diagnostics]
      }
    : resolvedDocument;
  const renderOptions = renderProfileResolution.options;
  const renderAdapterPayload = mapRenderOptionsToAdapterPayload(renderOptions);
  const html = renderHtml(document, renderOptions);
  const json = renderJson(document);
  const docxBridge = renderDocxBridge(document, renderOptions, renderAdapterPayload);

  return {
    document,
    diagnostics: document.diagnostics,
    renderOptions,
    renderAdapterPayload,
    html,
    json,
    docxBridge
  };
};


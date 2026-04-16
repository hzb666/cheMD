import { parseChemd } from "@chemd/parser";
import type { RenderSelection } from "@chemd/core";
import { exportTrainingRecordFromDocument, type ChemdTrainingExportV1 } from "@chemd/exporter-training";
import { buildLnf, type ChemdLnfV03 } from "@chemd/lnf";
import {
  mapRenderOptionsToAdapterPayload,
  resolveRenderProfileWithDiagnostics
} from "@chemd/render-profile";
import { renderHtml } from "@chemd/renderer-html";
import { renderDocxBridge } from "@chemd/renderer-docx";
import { renderJson } from "@chemd/renderer-json";
import { resolveChemd } from "@chemd/resolver";
import {
  buildRunPlan,
  DEFAULT_RUNTIME_CAPABILITIES,
  preflightRun,
  type PreflightResult,
  type RunPlan
} from "@chemd/runtime-lab";
import { typecheckDocument, type TypedSemanticGraph } from "@chemd/typechecker";
import type { StepGraph } from "@chemd/step-ontology";

export interface CompileResult {
  document: ReturnType<typeof resolveChemd>;
  diagnostics: ReturnType<typeof resolveChemd>["diagnostics"];
  renderOptions: ReturnType<typeof resolveRenderProfileWithDiagnostics>["options"];
  renderAdapterPayload: ReturnType<typeof mapRenderOptionsToAdapterPayload>;
  typedSemanticGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  runPlan: RunPlan;
  runtimePreflight: PreflightResult;
  lnf: ChemdLnfV03;
  trainingExport: ChemdTrainingExportV1;
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
  const typecheckResult = typecheckDocument(resolvedDocument);
  const semanticDocument = typecheckResult.diagnostics.length
    ? {
        ...resolvedDocument,
        diagnostics: [...resolvedDocument.diagnostics, ...typecheckResult.diagnostics]
      }
    : resolvedDocument;
  const renderSelection = mergeRenderSelection(
    semanticDocument.renderSelection,
    options.renderSelection
  );
  const renderProfileResolution = resolveRenderProfileWithDiagnostics(renderSelection);
  const document = renderProfileResolution.diagnostics.length
    ? {
        ...semanticDocument,
        diagnostics: [...semanticDocument.diagnostics, ...renderProfileResolution.diagnostics]
      }
    : semanticDocument;
  const runPlan = buildRunPlan({
    documentId: document.meta.id,
    typedGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph
  });
  const runtimePreflight = preflightRun(runPlan, {
    capabilities: DEFAULT_RUNTIME_CAPABILITIES
  });
  const lnf = buildLnf({
    document,
    typedGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph,
    diagnostics: document.diagnostics,
    runPlan
  });
  const trainingExport = exportTrainingRecordFromDocument(document, {
    stepGraph: typecheckResult.stepGraph,
    v03Lnf: lnf
  });
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
    typedSemanticGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph,
    runPlan,
    runtimePreflight,
    lnf,
    trainingExport,
    html,
    json,
    docxBridge
  };
};


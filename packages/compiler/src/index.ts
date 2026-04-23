import { parseChemd } from "@chemd/parser";
import type { ChemdDocument, RenderSelection } from "@chemd/core";
import {
  buildRagExportFromTrainingRecord,
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument,
  type ChemdRagExportV1,
  type ChemdTrainingExportV2,
  type ChemdTrainingUnderstandingV1
} from "@chemd/exporter-training";
import {
  buildCanonicalLnf,
  type ChemdLnf
} from "@chemd/lnf";
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
import { buildAuthoringAssistance } from "./authoring-assistance";
import { buildAuthoringDiagnostics } from "./authoring-diagnostics";
import {
  buildCompilerDiagnosis,
  type CompilerDiagnosis
} from "./diagnosis";
import type { AuthoringAssistance } from "./authoring-types";
export {
  applyDiagnosticQuickFix,
  type DiagnosticQuickFix,
  type DiagnosticWithQuickFixes
} from "./quick-fix";
export { applyCompilerDiagnosisSafeFixes } from "./diagnosis";
export { runChemdRepairLoop } from "./repair-loop";
export {
  applyAuthoringPatch,
  applyAuthoringSuggestion,
  applyAuthoringTemplate
} from "./authoring-apply";
export type {
  AuthoringAssistance,
  AuthoringMinimalSet,
  AuthoringMinimalSetStatus,
  AuthoringPatch,
  AuthoringSuggestion,
  AuthoringSuggestionCategory,
  AuthoringTemplate,
  AuthoringTemplateCategory
} from "./authoring-types";
export type {
  CompilerDiagnosis,
  CompilerDiagnosisManualItem,
  CompilerDiagnosisNextAction,
  CompilerDiagnosisRequiredInput,
  CompilerDiagnosisSafeFix,
  CompilerDiagnosisStatus,
  CompilerDiagnosisSummary
} from "./diagnosis";
export type {
  ChemdRepairLoopIteration,
  ChemdRepairLoopOptions,
  ChemdRepairLoopResult,
  ChemdRepairLoopStoppedReason
} from "./repair-loop";

export interface CompileResult {
  document: ReturnType<typeof resolveChemd>;
  diagnostics: ReturnType<typeof resolveChemd>["diagnostics"];
  renderOptions: ReturnType<typeof resolveRenderProfileWithDiagnostics>["options"];
  renderAdapterPayload: ReturnType<typeof mapRenderOptionsToAdapterPayload>;
  typedSemanticGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  runPlan: RunPlan;
  runtimePreflight: PreflightResult;
  lnf: ChemdLnf;
  ragExport: ChemdRagExportV1;
  trainingUnderstanding: ChemdTrainingUnderstandingV1;
  trainingExport: ChemdTrainingExportV2;
  authoringAssistance: AuthoringAssistance;
  diagnosis: CompilerDiagnosis;
  html: string;
  json: string;
  docxBridge: string;
}

export interface CompileOptions {
  renderSelection?: RenderSelection;
  strictChemdKind?: boolean;
  procedureMode?: "auto" | "explicit" | "lowered";
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

export const renderCompiledJson = (
  document: ChemdDocument,
  typedGraph: TypedSemanticGraph
): string => renderJson(document, { typedGraph });

export const compileChemd = (source: string, options: CompileOptions = {}): CompileResult => {
  const parsedDocument = parseChemd(source, {
    strictChemdKind: options.strictChemdKind
  });
  const resolvedDocument = resolveChemd(parsedDocument);
  const typecheckResult = typecheckDocument(resolvedDocument, {
    procedureMode: options.procedureMode
  });
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
  const lnf = buildCanonicalLnf({
    document,
    typedGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph,
    diagnostics: document.diagnostics,
    runPlan,
    runtimePreflight
  });
  const trainingExport = exportTrainingRecordFromDocument(document, {
    stepGraph: typecheckResult.stepGraph,
    typedGraph: typecheckResult.typedGraph,
    lnf
  });
  const ragExport = buildRagExportFromTrainingRecord(trainingExport);
  const trainingUnderstanding = buildTrainingUnderstandingFromRecord(trainingExport);
  const authoringAssistance = buildAuthoringAssistance(document, trainingExport);
  const authoringDiagnostics = buildAuthoringDiagnostics(authoringAssistance, trainingExport);
  const compileDocument = authoringDiagnostics.length > 0
    ? {
        ...document,
        diagnostics: [...document.diagnostics, ...authoringDiagnostics]
      }
    : document;
  const diagnosis = buildCompilerDiagnosis(compileDocument.diagnostics);
  const renderOptions = renderProfileResolution.options;
  const renderAdapterPayload = mapRenderOptionsToAdapterPayload(renderOptions);
  const html = renderHtml(compileDocument, renderOptions, { typedGraph: typecheckResult.typedGraph });
  const json = renderCompiledJson(compileDocument, typecheckResult.typedGraph);
  const docxBridge = renderDocxBridge(compileDocument, renderOptions, renderAdapterPayload, {
    typedGraph: typecheckResult.typedGraph
  });

  return {
    document: compileDocument,
    diagnostics: compileDocument.diagnostics,
    renderOptions,
    renderAdapterPayload,
    typedSemanticGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph,
    runPlan,
    runtimePreflight,
    lnf,
    ragExport,
    trainingUnderstanding,
    trainingExport,
    authoringAssistance,
    diagnosis,
    html,
    json,
    docxBridge
  };
};


import { parseChemdProgram } from "@chemd/parser";
import type {
  ChemdDocument,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  ChemdValue,
  ReactionRouteContext,
  ReferenceContext,
  RenderSelection
} from "@chemd/core";
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
import { typecheckProgram, type TypedSemanticGraph } from "@chemd/typechecker";
import type { StepGraph } from "@chemd/step-ontology";
import {
  buildCompilerDiagnosis,
  type CompilerDiagnosis
} from "./diagnosis";
import { buildAuthoringAssistance } from "./authoring-assistance";
import { buildAuthoringDiagnostics } from "./authoring-diagnostics";
import { applyProgramSemanticLayer } from "./program-training-export";
import type { AuthoringAssistance } from "./authoring-types";
export {
  applyDiagnosticQuickFix,
  type DiagnosticQuickFix,
  type DiagnosticWithQuickFixes
} from "./quick-fix";
export { applyCompilerDiagnosisSafeFixes } from "./diagnosis";
export { runChemdAgentLoop } from "./agent-loop";
export { runChemdRepairLoop } from "./repair-loop";
export { buildTrainingGraphIndexFromUnderstandings } from "@chemd/exporter-training";
export type {
  BuildTrainingGraphIndexOptions,
  ChemdTrainingGraphIndexV1
} from "@chemd/exporter-training";
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
  ChemdAgentLoopAgent,
  ChemdAgentLoopAgentRequest,
  ChemdAgentLoopAgentResponse,
  ChemdAgentLoopIteration,
  ChemdAgentLoopOptions,
  ChemdAgentLoopResult,
  ChemdAgentLoopStoppedReason
} from "./agent-loop";
export type {
  ChemdRepairLoopIteration,
  ChemdRepairLoopOptions,
  ChemdRepairLoopResult,
  ChemdRepairLoopStoppedReason
} from "./repair-loop";

export interface CompileResult {
  program: ChemdProgramDocument;
  document: ChemdDocument;
  diagnostics: ChemdProgramDocument["diagnostics"];
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
  procedureMode?: "auto" | "explicit" | "lowered";
  referenceContext?: ReferenceContext;
  reactionRouteContext?: ReactionRouteContext;
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

const readReferenceTarget = (reference: ChemdReferenceExpr | undefined): string | undefined =>
  reference ? reference.raw.replace(/^@/, "") || reference.target : undefined;

const toLegacyMetaValue = (value: ChemdValue): unknown => {
  if (value.type === "string" || value.type === "boolean") {
    return value.value;
  }
  if (value.type === "identifier") {
    return value.name;
  }
  if (value.type === "number" || value.type === "quantity" || value.type === "percent") {
    return value.raw;
  }
  if (value.type === "reference") {
    return readReferenceTarget(value);
  }
  if (value.type === "list") {
    return value.items.map(toLegacyMetaValue);
  }
  if (value.type === "record") {
    return Object.fromEntries(value.fields.map((field) => [field.key, toLegacyMetaValue(field.value)]));
  }

  return value.raw;
};

const createLegacyDocumentBridge = (program: ChemdProgramDocument): ChemdDocument => ({
  type: "document",
  meta: {
    id: program.meta.id,
    title: program.meta.title,
    date: program.meta.date,
    ...Object.fromEntries(
      Object.entries(program.meta.fields).map(([field, value]) => [field, toLegacyMetaValue(value)])
    ),
    ...(readReferenceTarget(program.meta.primary?.molecule)
      ? { primary_molecule: readReferenceTarget(program.meta.primary?.molecule) }
      : {}),
    ...(readReferenceTarget(program.meta.primary?.reaction)
      ? { primary_reaction: readReferenceTarget(program.meta.primary?.reaction) }
      : {}),
    ...(readReferenceTarget(program.meta.primary?.result)
      ? { primary_result: readReferenceTarget(program.meta.primary?.result) }
      : {}),
    ...(readReferenceTarget(program.meta.primary?.analysis)
      ? { primary_analysis: readReferenceTarget(program.meta.primary?.analysis) }
      : {}),
    ...(readReferenceTarget(program.meta.primary?.sample)
      ? { primary_sample: readReferenceTarget(program.meta.primary?.sample) }
      : {})
  },
  children: [],
  diagnostics: program.diagnostics,
  ...(program.source ? { source: program.source } : {}),
  ...(program.renderSelection ? { renderSelection: program.renderSelection } : {})
});

export const compileChemd = (source: string, options: CompileOptions = {}): CompileResult => {
  const parsedProgram = parseChemdProgram(source);
  const resolvedProgram = resolveChemd(parsedProgram);
  const typecheckResult = typecheckProgram(resolvedProgram, {
    procedureMode: options.procedureMode,
    referenceContext: options.referenceContext,
    reactionRouteContext: options.reactionRouteContext
  });
  const semanticProgram = typecheckResult.diagnostics.length
    ? {
        ...resolvedProgram,
        diagnostics: [...resolvedProgram.diagnostics, ...typecheckResult.diagnostics]
      }
    : resolvedProgram;
  const renderSelection = mergeRenderSelection(
    semanticProgram.renderSelection,
    options.renderSelection
  );
  const renderProfileResolution = resolveRenderProfileWithDiagnostics(renderSelection);
  const renderProgram = renderProfileResolution.diagnostics.length
    ? {
        ...semanticProgram,
        diagnostics: [...semanticProgram.diagnostics, ...renderProfileResolution.diagnostics]
      }
    : semanticProgram;
  const legacyDocument = createLegacyDocumentBridge(renderProgram);
  const runPlan = buildRunPlan({
    documentId: renderProgram.meta.id,
    typedGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph
  });
  const runtimePreflight = preflightRun(runPlan, {
    capabilities: DEFAULT_RUNTIME_CAPABILITIES
  });
  const lnf = buildCanonicalLnf({
    document: legacyDocument,
    typedGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph,
    diagnostics: legacyDocument.diagnostics,
    runPlan,
    runtimePreflight
  });
  const trainingExport = applyProgramSemanticLayer(exportTrainingRecordFromDocument(legacyDocument, {
    stepGraph: typecheckResult.stepGraph,
    typedGraph: typecheckResult.typedGraph,
    lnf
  }), renderProgram);
  const ragExport = buildRagExportFromTrainingRecord(trainingExport);
  const trainingUnderstanding = buildTrainingUnderstandingFromRecord(trainingExport);
  const authoringAssistance = buildAuthoringAssistance(renderProgram, trainingExport);
  const authoringDiagnostics = buildAuthoringDiagnostics(authoringAssistance, trainingExport);
  const compileProgram = authoringDiagnostics.length
    ? {
        ...renderProgram,
        diagnostics: [...renderProgram.diagnostics, ...authoringDiagnostics]
      }
    : renderProgram;
  const compileDocument = createLegacyDocumentBridge(compileProgram);
  const diagnosis = buildCompilerDiagnosis(compileProgram.diagnostics);
  const renderOptions = renderProfileResolution.options;
  const renderAdapterPayload = mapRenderOptionsToAdapterPayload(renderOptions);
  const html = renderHtml(compileDocument, renderOptions, { typedGraph: typecheckResult.typedGraph });
  const json = renderCompiledJson(compileDocument, typecheckResult.typedGraph);
  const docxBridge = renderDocxBridge(compileDocument, renderOptions, renderAdapterPayload, {
    typedGraph: typecheckResult.typedGraph
  });

  return {
    program: compileProgram,
    document: compileDocument,
    diagnostics: compileProgram.diagnostics,
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


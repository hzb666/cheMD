import { parseChemdProgram } from "@chemd/parser";
import type {
  ChemdProgramDocument,
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
export {
  linkChemdModules,
  type ChemdModuleImportEdge,
  type ChemdModuleImportGraph,
  type ChemdModuleInput,
  type LinkedChemdModule,
  type LinkChemdModulesOptions,
  type LinkChemdModulesResult
} from "./module-linker";

export interface CompileCoreResult {
  program: ChemdProgramDocument;
  diagnostics: ChemdProgramDocument["diagnostics"];
  renderOptions: ReturnType<typeof resolveRenderProfileWithDiagnostics>["options"];
  renderAdapterPayload: ReturnType<typeof mapRenderOptionsToAdapterPayload>;
  typedSemanticGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  runPlan: RunPlan;
  runtimePreflight: PreflightResult;
  lnf: ChemdLnf;
  html: string;
  json: string;
  docxBridge: string;
}

export interface CompileResult extends CompileCoreResult {
  ragExport: ChemdRagExportV1;
  trainingUnderstanding: ChemdTrainingUnderstandingV1;
  trainingExport: ChemdTrainingExportV2;
  authoringAssistance: AuthoringAssistance;
  diagnosis: CompilerDiagnosis;
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

type CompilerDiagnostic = ChemdProgramDocument["diagnostics"][number];

const diagnosticKey = (diagnostic: CompilerDiagnostic): string =>
  [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.message,
    diagnostic.nodeId ?? "",
    diagnostic.sourceLayer ?? "",
    diagnostic.sourceNodeType ?? "",
    diagnostic.sourceNodeId ?? "",
    diagnostic.sourceField ?? "",
    JSON.stringify(diagnostic.sourceSpan ?? null),
    JSON.stringify(diagnostic.facts ?? null)
  ].join("\u0000");

const mergeDiagnostics = (
  ...groups: Array<readonly CompilerDiagnostic[]>
): CompilerDiagnostic[] => {
  const seen = new Set<string>();
  const merged: CompilerDiagnostic[] = [];

  for (const diagnostic of groups.flat()) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(diagnostic);
  }

  return merged;
};

export const renderCompiledJson = (
  document: ChemdProgramDocument,
  typedGraph: TypedSemanticGraph
): string => renderJson(document, { typedGraph });

export const compileChemdCore = (source: string, options: CompileOptions = {}): CompileCoreResult => {
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
        diagnostics: mergeDiagnostics(resolvedProgram.diagnostics, typecheckResult.diagnostics)
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
        diagnostics: mergeDiagnostics(semanticProgram.diagnostics, renderProfileResolution.diagnostics)
      }
    : semanticProgram;
  const runPlan = buildRunPlan({
    documentId: renderProgram.meta.id,
    typedGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph
  });
  const runtimePreflight = preflightRun(runPlan, {
    capabilities: DEFAULT_RUNTIME_CAPABILITIES
  });
  const lnf = buildCanonicalLnf({
    document: renderProgram,
    typedGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph,
    diagnostics: renderProgram.diagnostics,
    runPlan,
    runtimePreflight
  });
  const renderOptions = renderProfileResolution.options;
  const renderAdapterPayload = mapRenderOptionsToAdapterPayload(renderOptions);
  const html = renderHtml(renderProgram, renderOptions, { typedGraph: typecheckResult.typedGraph });
  const json = renderCompiledJson(renderProgram, typecheckResult.typedGraph);
  const docxBridge = renderDocxBridge(renderProgram, renderOptions, renderAdapterPayload, {
    typedGraph: typecheckResult.typedGraph
  });

  return {
    program: renderProgram,
    diagnostics: renderProgram.diagnostics,
    renderOptions,
    renderAdapterPayload,
    typedSemanticGraph: typecheckResult.typedGraph,
    stepGraph: typecheckResult.stepGraph,
    runPlan,
    runtimePreflight,
    lnf,
    html,
    json,
    docxBridge
  };
};

export const compileChemd = (source: string, options: CompileOptions = {}): CompileResult => {
  const coreResult = compileChemdCore(source, options);
  const trainingExport = exportTrainingRecordFromDocument(coreResult.program, {
    stepGraph: coreResult.stepGraph,
    typedGraph: coreResult.typedSemanticGraph,
    lnf: coreResult.lnf
  });
  const ragExport = buildRagExportFromTrainingRecord(trainingExport);
  const trainingUnderstanding = buildTrainingUnderstandingFromRecord(trainingExport);
  const authoringAssistance = buildAuthoringAssistance(coreResult.program, trainingExport);
  const authoringDiagnostics = buildAuthoringDiagnostics(
    authoringAssistance,
    trainingExport,
    coreResult.program
  );
  const compileProgram = authoringDiagnostics.length
    ? {
        ...coreResult.program,
        diagnostics: mergeDiagnostics(coreResult.program.diagnostics, authoringDiagnostics)
      }
    : coreResult.program;
  const diagnosis = buildCompilerDiagnosis(compileProgram.diagnostics);
  const html = renderHtml(compileProgram, coreResult.renderOptions, {
    typedGraph: coreResult.typedSemanticGraph
  });
  const json = renderCompiledJson(compileProgram, coreResult.typedSemanticGraph);
  const docxBridge = renderDocxBridge(
    compileProgram,
    coreResult.renderOptions,
    coreResult.renderAdapterPayload,
    { typedGraph: coreResult.typedSemanticGraph }
  );

  return {
    ...coreResult,
    program: compileProgram,
    diagnostics: compileProgram.diagnostics,
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


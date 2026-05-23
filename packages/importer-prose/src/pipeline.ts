import {
  localChemicalLookupProvider,
  recognizeChemicalMentions
} from "@chemd/chemical-lexicon";
import type { ChemicalMention } from "@chemd/chemical-lexicon";

import type {
  ImportDiagnostic,
  MaterialMention,
  ProseImportCandidate,
  ProseImportOptions,
  ProseSourceSpan
} from "./types";
import { scanProseQuantities } from "./quantity";
import { extractProseFrames } from "./frames";
import { buildReactionCandidateResult } from "./reaction-candidates";
import { extractRxnProseFrames } from "./rxn-actions";

const createSpan = (sourceText: string, start: number, end: number): ProseSourceSpan => ({
  start,
  end,
  text: sourceText.slice(start, end)
});

const mentionToMaterial = (
  sourceText: string,
  mention: ChemicalMention,
  index: number
): MaterialMention => ({
  id: `material:${index + 1}`,
  name: mention.text,
  normalizedName: mention.normalizedName,
  confidence: mention.score,
  category: mention.category,
  source: mention.source,
  span: createSpan(sourceText, mention.start, mention.end),
  evidence: mention.evidence,
  formula: mention.formula
});

const createLowConfidenceFormulaDiagnostics = (
  sourceText: string,
  materials: readonly MaterialMention[]
): ImportDiagnostic[] =>
  materials
    .filter((material) => material.source === "formula-like")
    .map((material) => ({
      code: "W_IMPORT_FORMULA_UNRESOLVED",
      severity: "warning" as const,
      message: "Formula-like material mention needs confirmation before it is treated as a named chemical.",
      span: createSpan(sourceText, material.span.start, material.span.end),
      facts: {
        raw: material.name,
        confidence: material.confidence
      }
    }));

const materialKey = (material: MaterialMention): string =>
  [
    material.normalizedName.toLowerCase(),
    material.span.start,
    material.span.end,
    material.name.toLowerCase()
  ].join(":");

const mergeMaterials = (
  localMaterials: readonly MaterialMention[],
  externalMaterials: readonly MaterialMention[]
): MaterialMention[] => {
  const seen = new Set<string>();
  const merged: MaterialMention[] = [];
  [...externalMaterials, ...localMaterials].forEach((material) => {
    const key = materialKey(material);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ ...material, id: `material:${merged.length + 1}` });
  });
  return merged;
};

export const importProse = async (
  sourceText: string,
  options: ProseImportOptions = {}
): Promise<ProseImportCandidate> => {
  const chemicalProvider = options.chemicalProvider ?? localChemicalLookupProvider;
  const mentions = recognizeChemicalMentions(sourceText, {
    includeFormulaLike: options.includeFormulaLike
  });
  const quantityResult = scanProseQuantities(sourceText);
  const localMaterials = mentions.map((mention, index) => mentionToMaterial(sourceText, mention, index));
  const localFrameResult = extractProseFrames(sourceText);
  let frameResult = localFrameResult;
  let externalMaterials: MaterialMention[] = [];
  let providerDiagnostics: ImportDiagnostic[] = [];

  if (options.procedureActionProvider) {
    try {
      const actionResult = await options.procedureActionProvider.extractActions(sourceText);
      const rxnResult = extractRxnProseFrames(sourceText, actionResult);
      if (rxnResult.steps.length > 0) {
        frameResult = {
          steps: rxnResult.steps,
          observations: localFrameResult.observations,
          procedureState: rxnResult.procedureState,
          unparsedSpans: rxnResult.unparsedSpans,
          diagnostics: rxnResult.diagnostics
        };
        externalMaterials = rxnResult.materials;
      }
    } catch (error) {
      providerDiagnostics = [{
        code: "W_IMPORT_PROCEDURE_ACTION_PROVIDER_FALLBACK",
        severity: "warning",
        message: "External procedure action provider failed; local Chemd lowering was used.",
        facts: {
          provider: options.procedureActionProvider.name,
          error: error instanceof Error ? error.message : String(error)
        }
      }];
    }
  }

  const materials = mergeMaterials(localMaterials, externalMaterials);
  const reactionResult = buildReactionCandidateResult({
    sourceText,
    materials,
    quantities: quantityResult.quantities,
    steps: frameResult.steps
  });

  return {
    sourceText,
    materials,
    quantities: quantityResult.quantities,
    steps: frameResult.steps,
    observations: frameResult.observations,
    procedureState: frameResult.procedureState,
    reactionCandidates: reactionResult.candidates,
    unparsedSpans: frameResult.unparsedSpans,
    diagnostics: [
      ...createLowConfidenceFormulaDiagnostics(sourceText, materials),
      ...quantityResult.diagnostics,
      ...frameResult.diagnostics,
      ...providerDiagnostics,
      ...reactionResult.diagnostics,
      {
        code: "I_IMPORT_CHEMICAL_PROVIDER",
        severity: "info",
        message: "Chemical lookup provider selected for optional enrichment.",
        facts: { provider: chemicalProvider.name }
      }
    ]
  };
};

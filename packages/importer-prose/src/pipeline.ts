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

export const importProse = async (
  sourceText: string,
  options: ProseImportOptions = {}
): Promise<ProseImportCandidate> => {
  const chemicalProvider = options.chemicalProvider ?? localChemicalLookupProvider;
  const mentions = recognizeChemicalMentions(sourceText, {
    includeFormulaLike: options.includeFormulaLike
  });
  const materials = mentions.map((mention, index) => mentionToMaterial(sourceText, mention, index));
  const quantityResult = scanProseQuantities(sourceText);
  const frameResult = extractProseFrames(sourceText);
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

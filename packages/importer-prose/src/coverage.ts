import type { StepFamily } from "@chemd/step-ontology";

import type {
  ImportDiagnostic,
  ObservationFrame,
  ProseSourceSpan,
  StepFrame,
  UnparsedProseSpan
} from "./types";

export type CoverageLedgerStatus =
  | "covered_by_step"
  | "covered_by_observation"
  | "uncovered_action_like"
  | "uncovered_material_like"
  | "ignored_narrative";

interface CoverageLedgerEntry {
  status: CoverageLedgerStatus;
  span: ProseSourceSpan;
  source: "english_action_keyword" | "observation_keyword" | "material_like" | "narrative";
  action?: string;
  family?: StepFamily;
}

interface CoverageResult {
  ledger: CoverageLedgerEntry[];
  unparsedSpans: UnparsedProseSpan[];
  diagnostics: ImportDiagnostic[];
}

interface ActionKeywordRule {
  action: string;
  family: StepFamily;
  pattern: RegExp;
}

const ACTION_KEYWORDS: readonly ActionKeywordRule[] = [
  { action: "added", family: "add", pattern: /\badd(?:ed|s|ing)?\b/gi },
  { action: "charged", family: "charge", pattern: /\bcharg(?:ed|es|ing|e)\b/gi },
  { action: "cooled", family: "cool", pattern: /\bcool(?:ed|s|ing)?\b/gi },
  { action: "heated", family: "heat", pattern: /\bheat(?:ed|s|ing)?\b/gi },
  { action: "warmed", family: "heat", pattern: /\bwarm(?:ed|s|ing)?\b/gi },
  { action: "stirred", family: "hold", pattern: /\bstir(?:red|s|ring)?\b/gi },
  { action: "quenched", family: "quench", pattern: /\bquench(?:ed|es|ing)?\b/gi },
  { action: "extracted", family: "extract", pattern: /\bextract(?:ed|s|ing)?\b/gi },
  { action: "washed", family: "wash", pattern: /\bwash(?:ed|es|ing)?\b/gi },
  { action: "dried", family: "dry", pattern: /\b(?:dry|dried|drying)\b/gi },
  { action: "filtered", family: "filter", pattern: /\bfilter(?:ed|s|ing)?\b/gi },
  { action: "concentrated", family: "concentrate", pattern: /\bconcentrat(?:e|ed|es|ing)\b/gi },
  { action: "purified", family: "purify", pattern: /\bpurif(?:y|ied|ies|ying)\b/gi }
];

const OBSERVATION_KEYWORD = /\b(?:observed|detected|appeared|formed)\b/gi;
const MATERIAL_LIKE_TOKEN = /\b(?:[A-Z][a-z]?\d*){2,}\b/g;

const spansOverlap = (left: ProseSourceSpan, right: ProseSourceSpan): boolean =>
  left.start < right.end && right.start < left.end;

const createSpan = (sourceText: string, start: number, end: number): ProseSourceSpan => ({
  start,
  end,
  text: sourceText.slice(start, end)
});

const collectMatches = (
  sourceText: string,
  pattern: RegExp,
  source: CoverageLedgerEntry["source"],
  action?: string,
  family?: StepFamily
): CoverageLedgerEntry[] => {
  const matches: CoverageLedgerEntry[] = [];

  for (const match of sourceText.matchAll(pattern)) {
    if (match.index === undefined) continue;
    matches.push({
      status: "ignored_narrative",
      span: createSpan(sourceText, match.index, match.index + match[0].length),
      source,
      ...(action ? { action } : {}),
      ...(family ? { family } : {})
    });
  }

  return matches;
};

const collectActionEntries = (sourceText: string): CoverageLedgerEntry[] =>
  ACTION_KEYWORDS.flatMap((rule) =>
    collectMatches(
      sourceText,
      new RegExp(rule.pattern.source, rule.pattern.flags),
      "english_action_keyword",
      rule.action,
      rule.family
    )
  ).sort((left, right) => left.span.start - right.span.start);

const isNoCanonicalSpan = (
  entry: CoverageLedgerEntry,
  unparsedSpans: readonly UnparsedProseSpan[]
): boolean =>
  unparsedSpans.some((span) =>
    span.reason === "no_canonical_step" && spansOverlap(entry.span, span)
  );

const isCoveredByStep = (
  entry: CoverageLedgerEntry,
  steps: readonly StepFrame[]
): boolean =>
  steps.some((step) =>
    step.family === entry.family && spansOverlap(entry.span, step.span)
  );

const isCoveredByObservation = (
  entry: CoverageLedgerEntry,
  observations: readonly ObservationFrame[]
): boolean =>
  observations.some((observation) => spansOverlap(entry.span, observation.span));

const classifyActionEntry = (
  entry: CoverageLedgerEntry,
  steps: readonly StepFrame[],
  observations: readonly ObservationFrame[],
  unparsedSpans: readonly UnparsedProseSpan[]
): CoverageLedgerEntry => {
  if (isCoveredByStep(entry, steps)) {
    return { ...entry, status: "covered_by_step" };
  }

  if (isCoveredByObservation(entry, observations)) {
    return { ...entry, status: "covered_by_observation" };
  }

  if (isNoCanonicalSpan(entry, unparsedSpans)) {
    return { ...entry, status: "ignored_narrative" };
  }

  return { ...entry, status: "uncovered_action_like" };
};

const collectObservationEntries = (sourceText: string): CoverageLedgerEntry[] =>
  collectMatches(sourceText, OBSERVATION_KEYWORD, "observation_keyword")
    .map((entry) => ({ ...entry, status: "covered_by_observation" }));

const collectMaterialEntries = (sourceText: string): CoverageLedgerEntry[] =>
  collectMatches(sourceText, MATERIAL_LIKE_TOKEN, "material_like")
    .map((entry) => ({ ...entry, status: "uncovered_material_like" }));

const createUncoveredActionDiagnostic = (entry: CoverageLedgerEntry): ImportDiagnostic => ({
  code: "W_IMPORT_PROSE_UNCOVERED_ACTION",
  severity: "warning",
  message: "Action-like prose was not covered by a canonical imported step.",
  span: entry.span,
  facts: {
    action: entry.action ?? entry.span.text,
    family: entry.family,
    source: entry.source
  }
});

const createUnparsedActionSpan = (
  entry: CoverageLedgerEntry,
  index: number
): UnparsedProseSpan => ({
  id: `unparsed:${index + 1}`,
  start: entry.span.start,
  end: entry.span.end,
  text: entry.span.text,
  reason: "uncovered_action_like",
  confidence: 0.6
});

export const createCoverageLedger = (
  sourceText: string,
  steps: readonly StepFrame[],
  observations: readonly ObservationFrame[],
  existingUnparsedSpans: readonly UnparsedProseSpan[]
): CoverageResult => {
  const actionEntries = collectActionEntries(sourceText).map((entry) =>
    classifyActionEntry(entry, steps, observations, existingUnparsedSpans)
  );
  const uncoveredActionEntries = actionEntries.filter((entry) =>
    entry.status === "uncovered_action_like"
  );

  return {
    ledger: [
      ...actionEntries,
      ...collectObservationEntries(sourceText),
      ...collectMaterialEntries(sourceText)
    ].sort((left, right) => left.span.start - right.span.start),
    unparsedSpans: uncoveredActionEntries.map((entry, index) =>
      createUnparsedActionSpan(entry, existingUnparsedSpans.length + index)
    ),
    diagnostics: uncoveredActionEntries.map(createUncoveredActionDiagnostic)
  };
};

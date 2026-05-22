import { DEFAULT_CHEMICAL_LEXICON } from "./lexicon";
import { FORMULA_CANDIDATE_PATTERN, isFormulaLike } from "./formula";
import { createAliasPattern, normalizeChemicalName } from "./normalize";
import type {
  ChemicalLexiconEntry,
  ChemicalMention,
  ChemicalMentionSource,
  RecognizeChemicalMentionsOptions
} from "./types";

const CONTEXT_WORDS = [
  "add",
  "added",
  "charged",
  "dissolved",
  "extract",
  "washed",
  "dried",
  "solvent",
  "reagent",
  "加入",
  "滴加",
  "溶于",
  "萃取",
  "洗涤",
  "干燥"
] as const;

interface AliasCandidate {
  alias: string;
  entry: ChemicalLexiconEntry;
  source: ChemicalMentionSource;
}

const createAliasCandidates = (
  entries: readonly ChemicalLexiconEntry[]
): AliasCandidate[] =>
  entries
    .flatMap((entry) => [
      {
        alias: entry.canonicalName,
        entry,
        source: "local-canonical" as const
      },
      ...entry.aliases.map((alias) => ({
        alias,
        entry,
        source: "local-alias" as const
      }))
    ])
    .sort((left, right) => right.alias.length - left.alias.length);

const hasNearbyContext = (text: string, start: number, end: number): boolean => {
  const windowStart = Math.max(0, start - 32);
  const windowEnd = Math.min(text.length, end + 32);
  const context = normalizeChemicalName(text.slice(windowStart, windowEnd));
  return CONTEXT_WORDS.some((word) => context.includes(normalizeChemicalName(word)));
};

const clampScore = (score: number): number =>
  Math.min(0.99, Math.max(0, Number(score.toFixed(3))));

const scoreAlias = (
  candidate: AliasCandidate,
  text: string,
  start: number,
  end: number
): number => {
  const base = candidate.entry.confidenceBase
    ?? (candidate.source === "local-canonical" ? 0.96 : 0.9);
  return clampScore(base + (hasNearbyContext(text, start, end) ? 0.04 : 0));
};

const createMention = (
  text: string,
  start: number,
  end: number,
  candidate: AliasCandidate
): ChemicalMention => ({
  text: text.slice(start, end),
  start,
  end,
  normalizedName: candidate.entry.canonicalName,
  source: candidate.source,
  score: scoreAlias(candidate, text, start, end),
  category: candidate.entry.category,
  entryId: candidate.entry.id,
  formula: candidate.entry.formula,
  evidence: [`matched alias: ${candidate.alias}`]
});

const createFormulaMention = (
  text: string,
  start: number,
  end: number
): ChemicalMention => {
  const formula = text.slice(start, end);
  return {
    text: formula,
    start,
    end,
    normalizedName: formula,
    source: "formula-like",
    score: clampScore(0.62 + (hasNearbyContext(text, start, end) ? 0.04 : 0)),
    category: "unknown",
    formula,
    evidence: ["valid element-symbol formula candidate"]
  };
};

const overlaps = (left: ChemicalMention, right: ChemicalMention): boolean =>
  left.start < right.end && right.start < left.end;

const selectMaximumSpanMentions = (
  candidates: readonly ChemicalMention[]
): ChemicalMention[] => {
  const selected: ChemicalMention[] = [];
  const sorted = [...candidates].sort((left, right) =>
    (right.end - right.start) - (left.end - left.start)
    || right.score - left.score
    || left.start - right.start
  );

  for (const candidate of sorted) {
    if (!selected.some((item) => overlaps(item, candidate))) {
      selected.push(candidate);
    }
  }

  return selected.sort((left, right) => left.start - right.start);
};

export const recognizeChemicalMentions = (
  text: string,
  options: RecognizeChemicalMentionsOptions = {}
): ChemicalMention[] => {
  const entries = options.entries ?? DEFAULT_CHEMICAL_LEXICON;
  const candidates: ChemicalMention[] = [];

  for (const candidate of createAliasCandidates(entries)) {
    const pattern = createAliasPattern(candidate.alias);
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      candidates.push(createMention(text, match.index, match.index + match[0].length, candidate));
    }
  }

  if (options.includeFormulaLike !== false) {
    for (const match of text.matchAll(FORMULA_CANDIDATE_PATTERN)) {
      if (match.index === undefined || !isFormulaLike(match[0])) continue;
      candidates.push(createFormulaMention(text, match.index, match.index + match[0].length));
    }
  }

  return selectMaximumSpanMentions(candidates);
};

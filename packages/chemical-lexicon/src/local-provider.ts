import { DEFAULT_CHEMICAL_LEXICON } from "./lexicon";
import { normalizeChemicalName } from "./normalize";
import type {
  ChemicalLexiconEntry,
  ChemicalLookupProvider,
  ChemicalLookupResult
} from "./types";

const entryToResult = (
  query: string,
  entry: ChemicalLexiconEntry,
  score: number
): ChemicalLookupResult => ({
  provider: "local-lexicon",
  query,
  canonicalName: entry.canonicalName,
  score,
  category: entry.category,
  formula: entry.formula,
  synonyms: entry.aliases,
  evidence: [`local entry: ${entry.id}`]
});

export const createLocalChemicalLookupProvider = (
  entries: readonly ChemicalLexiconEntry[] = DEFAULT_CHEMICAL_LEXICON
): ChemicalLookupProvider => ({
  name: "local-lexicon",
  async lookupName(input: string): Promise<readonly ChemicalLookupResult[]> {
    const normalized = normalizeChemicalName(input);
    return entries
      .flatMap((entry) => {
        const canonical = normalizeChemicalName(entry.canonicalName);
        const aliases = entry.aliases.map(normalizeChemicalName);
        if (canonical === normalized) {
          return [entryToResult(input, entry, 0.98)];
        }
        if (aliases.includes(normalized)) {
          return [entryToResult(input, entry, 0.94)];
        }
        return [];
      })
      .sort((left, right) => right.score - left.score);
  },
  async lookupFormula(formula: string): Promise<readonly ChemicalLookupResult[]> {
    const normalized = normalizeChemicalName(formula);
    return entries
      .filter((entry) => entry.formula && normalizeChemicalName(entry.formula) === normalized)
      .map((entry) => entryToResult(formula, entry, 0.95));
  }
});

export const localChemicalLookupProvider = createLocalChemicalLookupProvider();

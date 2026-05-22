export type ChemicalCategory =
  | "solvent"
  | "reagent"
  | "acid"
  | "base"
  | "salt"
  | "gas"
  | "drying_agent"
  | "workup"
  | "catalyst"
  | "unknown";

export type ChemicalMentionSource =
  | "local-canonical"
  | "local-alias"
  | "formula-like";

export interface ChemicalLexiconEntry {
  id: string;
  canonicalName: string;
  aliases: readonly string[];
  category: ChemicalCategory;
  formula?: string;
  confidenceBase?: number;
}

export interface ChemicalMention {
  text: string;
  start: number;
  end: number;
  normalizedName: string;
  source: ChemicalMentionSource;
  score: number;
  evidence: readonly string[];
  category: ChemicalCategory;
  entryId?: string;
  formula?: string;
}

export interface ChemicalLookupResult {
  provider: string;
  query: string;
  canonicalName: string;
  score: number;
  category?: ChemicalCategory;
  cid?: number;
  formula?: string;
  synonyms?: readonly string[];
  evidence?: readonly string[];
}

export interface ChemicalLookupProvider {
  name: string;
  lookupName(input: string): Promise<readonly ChemicalLookupResult[]>;
  lookupFormula?(formula: string): Promise<readonly ChemicalLookupResult[]>;
}

export interface RecognizeChemicalMentionsOptions {
  entries?: readonly ChemicalLexiconEntry[];
  includeFormulaLike?: boolean;
}

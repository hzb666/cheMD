export const CHEMD_LANGUAGE_CONTRACT = {
  id: "chemd-current",
  schemaVersion: "chemd-language-contract/v0.4",
  compatibilityModes: [] as const,
  authorConfigFields: [] as const
} as const;

export type ChemdLanguageContract = typeof CHEMD_LANGUAGE_CONTRACT;

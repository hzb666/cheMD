import type {
  ChemEditorDraft,
  ChemEditorReactionDraft,
  KetcherBridgeInstance
} from "../types";

interface ReactionSmilesParts {
  reactants: string[];
  products: string[];
}

interface ReactionSmilesParseOptions {
  rxnfile?: string;
  fallback?: Pick<ChemEditorReactionDraft, "reactants" | "products">;
}

const normalizeString = (value: string): string => value.trim();

const normalizeList = (values: string[]): string[] =>
  values.map((item) => item.trim()).filter((item) => item.length > 0);

const RXN_PARTICIPANT_COUNTS_RE = /^\s*(\d+)\s+(\d+)(?:\s+\d+)?\s*$/;

const parseRxnParticipantCounts = (
  rxnfile: string | undefined
): { reactants: number; products: number } | null => {
  if (!rxnfile) {
    return null;
  }

  for (const line of rxnfile.split(/\r?\n/)) {
    const match = line.match(RXN_PARTICIPANT_COUNTS_RE);
    if (!match) {
      continue;
    }

    return {
      reactants: Number.parseInt(match[1], 10),
      products: Number.parseInt(match[2], 10)
    };
  }

  return null;
};

const inferFallbackParticipantCount = (
  sideText: string,
  fallback: string[]
): number | undefined => {
  if (fallback.length > 1) {
    return fallback.length;
  }

  if (fallback.length !== 1) {
    return undefined;
  }

  if (fallback[0]?.includes(".")) {
    return 1;
  }

  const normalizedSide = normalizeString(sideText);
  return normalizedSide.includes("[") && normalizedSide.includes(".") ? 1 : undefined;
};

const resolveReactionParticipants = (
  sideText: string,
  expectedCount: number | undefined,
  fallback: string[]
): string[] => {
  const normalizedSide = normalizeString(sideText);
  if (normalizedSide.length === 0) {
    return [];
  }

  if (expectedCount === 1) {
    return [normalizedSide];
  }

  const components = normalizeList(normalizedSide.split("."));
  if (expectedCount === undefined || components.length === expectedCount) {
    return components;
  }

  if (fallback.length === expectedCount) {
    return normalizeList(fallback);
  }

  return components;
};

const createReactionFallback = (
  fallback: ReactionSmilesParseOptions["fallback"]
): Pick<ChemEditorReactionDraft, "reactants" | "products"> => ({
  reactants: fallback?.reactants ?? [],
  products: fallback?.products ?? []
});

const resolveReactionSide = (
  sideText: string,
  expectedCount: number | undefined,
  fallback: string[]
): string[] =>
  resolveReactionParticipants(
    sideText,
    expectedCount ?? inferFallbackParticipantCount(sideText, fallback),
    fallback
  );

export const buildReactionSmiles = ({
  reactants,
  products
}: Pick<ChemEditorReactionDraft, "reactants" | "products">): string =>
  `${normalizeList(reactants).join(".")}>>${normalizeList(products).join(".")}`;

export const parseReactionSmiles = (
  value: string,
  options: ReactionSmilesParseOptions = {}
): ReactionSmilesParts => {
  const [reactantsText = "", productsText = ""] = value.split(">>", 2);
  const participantCounts = parseRxnParticipantCounts(options.rxnfile);
  const fallback = createReactionFallback(options.fallback);

  // RXN counts 用于区分 participant 分隔符和 ionic fragment 内部的点号。
  return {
    reactants: resolveReactionSide(reactantsText, participantCounts?.reactants, fallback.reactants),
    products: resolveReactionSide(productsText, participantCounts?.products, fallback.products)
  };
};

export const exportChemEditorDraft = async (
  instance: Pick<KetcherBridgeInstance, "containsReaction" | "getSmiles" | "getMolfile" | "getRxn">,
  currentDraft: ChemEditorDraft
): Promise<ChemEditorDraft> => {
  if (instance.containsReaction()) {
    const [reactionSmiles, rxnfile] = await Promise.all([
      instance.getSmiles(),
      instance.getRxn?.()
    ]);
    const normalizedReactionSmiles = normalizeString(reactionSmiles);
    const normalizedRxnfile = typeof rxnfile === "string" ? normalizeString(rxnfile) || undefined : undefined;
    const { reactants, products } = parseReactionSmiles(reactionSmiles, {
      rxnfile: normalizedRxnfile,
      fallback: currentDraft.kind === "reaction"
        ? {
            reactants: currentDraft.reactants,
            products: currentDraft.products
          }
        : undefined
    });
    return {
      kind: "reaction",
      reactants,
      products,
      conditions: currentDraft.kind === "reaction" ? currentDraft.conditions : [],
      reactionSmiles: normalizedReactionSmiles,
      rxnfile: normalizedRxnfile
    };
  }

  const [smiles, molfile] = await Promise.all([instance.getSmiles(), instance.getMolfile()]);
  return {
    kind: "molecule",
    smiles: normalizeString(smiles),
    molfile: normalizeString(molfile) || undefined
  };
};

export const getChemEditorStructureInput = (draft: ChemEditorDraft): string => {
  if (draft.kind === "reaction") {
    return draft.rxnfile ?? draft.reactionSmiles ?? buildReactionSmiles(draft);
  }

  return draft.molfile ?? draft.smiles;
};

export const getChemEditorImportCandidates = (draft: ChemEditorDraft): string[] => {
  if (draft.kind === "reaction") {
    return [
      draft.rxnfile,
      draft.reactionSmiles,
      buildReactionSmiles(draft)
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  }

  return [draft.molfile, draft.smiles].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
};

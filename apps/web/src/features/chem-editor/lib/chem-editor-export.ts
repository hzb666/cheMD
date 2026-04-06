import type {
  ChemEditorDraft,
  ChemEditorReactionDraft,
  KetcherBridgeInstance
} from "../types";

interface ReactionSmilesParts {
  reactants: string[];
  products: string[];
}

const normalizeString = (value: string): string => value.trim();

const normalizeList = (values: string[]): string[] =>
  values.map((item) => item.trim()).filter((item) => item.length > 0);

export const buildReactionSmiles = ({
  reactants,
  products
}: Pick<ChemEditorReactionDraft, "reactants" | "products">): string =>
  `${normalizeList(reactants).join(".")}>>${normalizeList(products).join(".")}`;

export const parseReactionSmiles = (value: string): ReactionSmilesParts => {
  const [reactantsText = "", productsText = ""] = value.split(">>", 2);
  return {
    reactants: normalizeList(reactantsText.split(".")),
    products: normalizeList(productsText.split("."))
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
    const { reactants, products } = parseReactionSmiles(reactionSmiles);
    return {
      kind: "reaction",
      reactants,
      products,
      conditions: currentDraft.kind === "reaction" ? currentDraft.conditions : [],
      reactionSmiles: normalizedReactionSmiles,
      rxnfile: typeof rxnfile === "string" ? normalizeString(rxnfile) || undefined : undefined
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

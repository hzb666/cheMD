import {
  lookupPubChemNotationMetadata
} from "./cas-resolver";
import {
  fetchLabStorageInventoryByCas,
  type LabStorageInventoryResponse
} from "./lab-storage-client";

export interface MoleculeInventoryItem {
  notation: string;
  displayName: string;
  casNumber: string | null;
  inventory: LabStorageInventoryResponse | null;
  error?: string;
}

export interface ReactionInventoryItem extends MoleculeInventoryItem {
  reactant: string;
}

const readInventoryDisplayName = (
  inventory: LabStorageInventoryResponse | null,
  fallbackName: string | null,
  notation: string
): string => {
  const inventoryName = Array.isArray(inventory?.items)
    ? inventory.items
        .map((item) => (typeof item.name === "string" ? item.name.trim() : ""))
        .find((item) => item.length > 0) ?? ""
    : "";

  if (inventoryName) {
    return inventoryName;
  }

  if (fallbackName && fallbackName.trim()) {
    return fallbackName.trim();
  }

  return notation;
};

const createInventoryItem = async (notation: string): Promise<MoleculeInventoryItem> => {
  const trimmed = notation.trim();
  if (!trimmed) {
    return {
      notation: trimmed,
      displayName: trimmed,
      casNumber: null,
      inventory: null,
      error: "empty notation"
    };
  }

  let casNumber: string | null = null;
  let preferredName: string | null = null;
  let inventory: LabStorageInventoryResponse | null = null;

  try {
    const metadata = await lookupPubChemNotationMetadata(trimmed);
    casNumber = metadata.casNumber;
    preferredName = metadata.preferredName;
    if (!casNumber) {
      return {
        notation: trimmed,
        displayName: readInventoryDisplayName(null, preferredName, trimmed),
        casNumber: null,
        inventory: null,
        error: "CAS not found"
      };
    }

    inventory = await fetchLabStorageInventoryByCas(casNumber);
    return {
      notation: trimmed,
      displayName: readInventoryDisplayName(inventory, preferredName, trimmed),
      casNumber,
      inventory
    };
  } catch (error) {
    return {
      notation: trimmed,
      displayName: readInventoryDisplayName(inventory, preferredName, trimmed),
      casNumber,
      inventory,
      error: error instanceof Error ? error.message : "inventory lookup failed"
    };
  }
};

export const lookupMoleculeInventory = async (notation: string): Promise<MoleculeInventoryItem> =>
  createInventoryItem(notation);

export const lookupReactionInventory = async (
  reactants: string[]
): Promise<ReactionInventoryItem[]> => {
  const seen = new Map<string, Promise<MoleculeInventoryItem>>();

  return Promise.all(
    reactants
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map(async (reactant) => {
        const existing = seen.get(reactant);
        const promise = existing ?? createInventoryItem(reactant);
        if (!existing) {
          seen.set(reactant, promise);
        }

        return {
          reactant,
          ...(await promise)
        };
      })
  );
};

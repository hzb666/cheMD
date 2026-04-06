import { loadStoredStructureDraft, removeStoredStructureDraft } from "./structure-draft-store";

interface StructureRoutePayload {
  found?: boolean;
  structure?: {
    smiles?: unknown;
    molfile?: unknown;
  };
}

interface LoadStructureDraftOptions {
  documentId: string;
  blockId: string;
  sessionId: string;
  fallbackSmiles: string;
  fetchImpl?: typeof fetch;
  storageImpl?: {
    getItem: (key: string) => string | null;
    removeItem: (key: string) => void;
    setItem: (key: string, value: string) => void;
  };
}

interface StructureDraft {
  blockId: string;
  smiles: string;
  molfile?: string;
}

export const loadStructureDraft = async ({
  documentId,
  blockId,
  sessionId,
  fallbackSmiles,
  fetchImpl = fetch,
  storageImpl
}: LoadStructureDraftOptions): Promise<StructureDraft> => {
  const stored = loadStoredStructureDraft({ documentId, blockId, sessionId }, storageImpl);
  const storedMatchesSource = stored
    ? (stored.sourceSmiles ?? stored.smiles) === fallbackSmiles
    : false;
  if (stored && storedMatchesSource) {
    return {
      blockId,
      smiles: stored.smiles,
      molfile: stored.molfile
    };
  }
  if (stored && !storedMatchesSource) {
    removeStoredStructureDraft({ documentId, blockId, sessionId }, storageImpl);
  }

  const params = new URLSearchParams({
    documentId,
    blockId,
    sessionId
  });
  const response = await fetchImpl(`/api/chem/structure?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Structure draft load failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as StructureRoutePayload | null;
  if (!payload?.found) {
    return {
      blockId,
      smiles: fallbackSmiles
    };
  }

  const smiles = typeof payload.structure?.smiles === "string"
    ? payload.structure.smiles
    : fallbackSmiles;
  const molfile = typeof payload.structure?.molfile === "string"
    ? payload.structure.molfile
    : undefined;

  return {
    blockId,
    smiles,
    molfile
  };
};

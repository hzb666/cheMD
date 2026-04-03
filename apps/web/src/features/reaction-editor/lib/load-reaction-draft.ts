import type { ReactionEditorDraft, ReactionEditorDraftWithBlockId } from "../types";
import {
  createReactionSourceKey,
  loadStoredReactionDraft,
  removeStoredReactionDraft
} from "./reaction-draft-store";

interface LoadReactionDraftOptions {
  documentId?: string;
  blockId: string;
  sessionId?: string;
  fallback: ReactionEditorDraft;
  fetchImpl?: typeof fetch;
  storageImpl?: {
    getItem: (key: string) => string | null;
    removeItem: (key: string) => void;
    setItem: (key: string, value: string) => void;
  };
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const loadReactionDraft = async ({
  documentId,
  blockId,
  sessionId,
  fallback,
  fetchImpl = fetch,
  storageImpl
}: LoadReactionDraftOptions): Promise<ReactionEditorDraftWithBlockId> => {
  const stored = documentId ? loadStoredReactionDraft({ documentId, blockId }, storageImpl) : null;
  const storedMatchesFallback = stored
    ? (stored.sourceReactionKey ?? createReactionSourceKey(stored)) === createReactionSourceKey(fallback)
    : false;

  if (stored && storedMatchesFallback) {
    return {
      blockId,
      reactants: stored.reactants,
      products: stored.products,
      conditions: stored.conditions,
      sourceReactionKey: stored.sourceReactionKey ?? createReactionSourceKey(fallback)
    };
  }

  if (stored && !storedMatchesFallback && documentId) {
    removeStoredReactionDraft({ documentId, blockId }, storageImpl);
  }

  if (documentId && sessionId) {
    const params = new URLSearchParams({
      documentId,
      blockId,
      sessionId
    });
    const response = await fetchImpl(`/api/chem/reaction/structure?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Reaction draft load failed (${response.status})`);
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          found?: boolean;
          reaction?: {
            reactants?: unknown;
            products?: unknown;
            conditions?: unknown;
          };
        }
      | null;

    if (payload?.found) {
      const reactants = isStringArray(payload.reaction?.reactants)
        ? payload.reaction.reactants
        : fallback.reactants;
      const products = isStringArray(payload.reaction?.products)
        ? payload.reaction.products
        : fallback.products;
      const conditions = isStringArray(payload.reaction?.conditions)
        ? payload.reaction.conditions
        : fallback.conditions;

      return {
        blockId,
        reactants,
        products,
        conditions,
        sourceReactionKey: createReactionSourceKey({
          reactants,
          products,
          conditions
        })
      };
    }
  }

  return {
    blockId,
    ...fallback,
    sourceReactionKey: createReactionSourceKey(fallback)
  };
};

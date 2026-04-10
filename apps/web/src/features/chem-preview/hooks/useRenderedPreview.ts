import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { RenderOptions } from "@chemd/render-profile";

import {
  buildPreviewBridgeScript,
  createPreviewBridgeToken,
  injectEditButtons
} from "../lib/preview-bridge";
import {
  buildMoleculeRenderRequestPayload,
  buildReactionRenderRequestPayload,
  type RenderPayload,
  loadHydratedMoleculeEntry,
  loadHydratedReactionEntry,
  parseMoleculeEntries,
  parseReactionEntries,
  replaceMoleculeFieldValues,
  replaceMoleculeGraphics,
  replaceReactionFieldValues,
  replaceReactionGraphics
} from "../lib/preview-hydration";

interface UseRenderedPreviewResult {
  hydratedHtml: string;
  previewBridgeToken: string;
}

interface UseRenderedPreviewOptions {
  documentId?: string;
  sessionId?: string;
  renderOptions?: RenderOptions;
}

interface RenderRequestResult {
  payload: RenderPayload | null;
  errorMessage?: string;
}

const RENDER_REQUEST_TIMEOUT_MS = 8000;
const subscribeToClientReady = (_onStoreChange: () => void) => () => undefined;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (match) => HTML_ESCAPE_MAP[match] ?? match);

export const buildReactionRenderErrorMarkup = (message: string): string => {
  const normalizedMessage = message.trim() || "Reaction render failed";
  return `<div class="chemd-render-error" role="alert" aria-live="polite">${escapeHtml(normalizedMessage)}</div>`;
};

const requestRenderPayload = async (
  payload: ReturnType<typeof buildMoleculeRenderRequestPayload> | ReturnType<typeof buildReactionRenderRequestPayload>
): Promise<RenderRequestResult> => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), RENDER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/chem/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const nextPayload = (await response.json().catch(() => null)) as
      | (RenderPayload & { message?: unknown })
      | null;
    if (!response.ok) {
      return {
        payload: nextPayload,
        errorMessage:
          typeof nextPayload?.message === "string" && nextPayload.message.trim().length > 0
            ? nextPayload.message.trim()
            : `Render request failed (${response.status})`
      };
    }

    return {
      payload: nextPayload
    };
  } catch {
    return {
      payload: null,
      errorMessage: "Reaction render failed"
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

export const useRenderedPreview = (
  html: string,
  options: UseRenderedPreviewOptions = {}
): UseRenderedPreviewResult => {
  const { documentId, sessionId, renderOptions } = options;
  const baseHtml = useMemo(() => injectEditButtons(html), [html]);
  const bridgeReady = useSyncExternalStore(subscribeToClientReady, () => true, () => false);
  const previewBridgeToken = useMemo(() => {
    if (!bridgeReady) {
      return "";
    }

    try {
      const seed = JSON.stringify({
        htmlLength: baseHtml.length,
        documentId,
        sessionId,
        renderOptions
      });
      return `preview-${seed.length.toString(36)}-${createPreviewBridgeToken()}`;
    } catch {
      return "";
    }
  }, [baseHtml, bridgeReady, documentId, renderOptions, sessionId]);
  const [hydratedHtml, setHydratedHtml] = useState(baseHtml);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      const molecules = parseMoleculeEntries(baseHtml);
      const reactions = parseReactionEntries(baseHtml);
      if (molecules.length === 0 && reactions.length === 0) {
        setHydratedHtml(baseHtml);
        return;
      }

      const moleculePayloadPromise = Promise.all(
        molecules.map(async (entry) => {
          if (!entry.smiles) {
            return {
              svg: "",
              smiles: entry.smiles
            };
          }

          try {
            const hydratedEntry = await loadHydratedMoleculeEntry(entry, { documentId, sessionId });
            const { payload } = await requestRenderPayload(
              buildMoleculeRenderRequestPayload(hydratedEntry, renderOptions)
            );
            if (!payload) {
              return {
                svg: "",
                smiles: hydratedEntry.smiles
              };
            }
            return {
              svg: typeof payload?.svg === "string" ? payload.svg : "",
              smiles:
                typeof payload?.canonicalSmiles === "string" && payload.canonicalSmiles.trim().length > 0
                  ? payload.canonicalSmiles
                  : hydratedEntry.smiles
            };
          } catch {
            return {
              svg: "",
              smiles: entry.smiles
            };
          }
        })
      );

      const reactionPayloadPromise = Promise.all(
        reactions.map(async (entry) => {
          try {
            const hydratedEntry = await loadHydratedReactionEntry(entry, { documentId, sessionId });
            const { payload, errorMessage } = await requestRenderPayload(
              buildReactionRenderRequestPayload(hydratedEntry, renderOptions)
            );
            if (!payload && errorMessage) {
              return {
                svg: buildReactionRenderErrorMarkup(errorMessage),
                reactants: hydratedEntry.reactants,
                products: hydratedEntry.products,
                conditions: hydratedEntry.conditions
              };
            }
            if (!payload) {
              return {
                svg: "",
                reactants: hydratedEntry.reactants,
                products: hydratedEntry.products,
                conditions: hydratedEntry.conditions
              };
            }

            const svg =
              typeof payload?.svg === "string" && payload.svg.trim().length > 0
                ? payload.svg
                : errorMessage
                  ? buildReactionRenderErrorMarkup(errorMessage)
                  : "";
            return {
              svg,
              reactants: Array.isArray(payload?.reaction?.reactants)
                ? payload.reaction.reactants.filter(
                    (item): item is string => typeof item === "string" && item.trim().length > 0
                  )
                : hydratedEntry.reactants,
              products: Array.isArray(payload?.reaction?.products)
                ? payload.reaction.products.filter(
                    (item): item is string => typeof item === "string" && item.trim().length > 0
                  )
                : hydratedEntry.products,
              conditions: Array.isArray(payload?.reaction?.conditions)
                ? payload.reaction.conditions.filter(
                    (item): item is string => typeof item === "string" && item.trim().length > 0
                  )
                : hydratedEntry.conditions
            };
          } catch {
            return {
              svg: "",
              reactants: entry.reactants,
              products: entry.products,
              conditions: entry.conditions
            };
          }
        })
      );
      const [moleculePayloads, reactionPayloads] = await Promise.all([
        moleculePayloadPromise,
        reactionPayloadPromise
      ]);

      if (!active) {
        return;
      }

      const nextHtml = replaceReactionFieldValues(
        replaceReactionGraphics(
          replaceMoleculeFieldValues(
            replaceMoleculeGraphics(
              baseHtml,
              moleculePayloads.map((payload) => payload.svg)
            ),
            moleculePayloads.map((payload) => payload.smiles)
          ),
          reactionPayloads.map((payload) => payload.svg)
        ),
        reactionPayloads.map((payload) => ({
          reactants: payload.reactants,
          products: payload.products,
          conditions: payload.conditions
        }))
      );
      setHydratedHtml(nextHtml);
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [baseHtml, documentId, renderOptions, sessionId]);

  return {
    hydratedHtml:
      bridgeReady && previewBridgeToken
        ? `${hydratedHtml}${buildPreviewBridgeScript(previewBridgeToken, window.location.origin)}`
        : hydratedHtml,
    previewBridgeToken
  };
};

export {
  injectEditButtons,
  buildMoleculeRenderRequestPayload,
  buildReactionRenderRequestPayload,
  loadHydratedMoleculeEntry,
  loadHydratedReactionEntry,
  parseMoleculeEntries,
  parseReactionEntries,
  replaceMoleculeFieldValues,
  replaceMoleculeGraphics,
  replaceReactionFieldValues,
  replaceReactionGraphics
};

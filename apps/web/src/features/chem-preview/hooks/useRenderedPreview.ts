import { useEffect, useMemo, useState } from "react";
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

export const useRenderedPreview = (
  html: string,
  options: UseRenderedPreviewOptions = {}
): UseRenderedPreviewResult => {
  const { documentId, sessionId, renderOptions } = options;
  const baseHtml = useMemo(() => injectEditButtons(html), [html]);
  const previewBridgeToken = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const seed = JSON.stringify({
      htmlLength: baseHtml.length,
      documentId,
      sessionId,
      renderOptions
    });
    return `preview-${seed.length.toString(36)}-${createPreviewBridgeToken()}`;
  }, [baseHtml, documentId, renderOptions, sessionId]);
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

      const moleculePayloads = await Promise.all(
        molecules.map(async (entry) => {
          if (!entry.smiles) {
            return {
              svg: "",
              smiles: entry.smiles
            };
          }

          try {
            const hydratedEntry = await loadHydratedMoleculeEntry(entry, { documentId, sessionId });
            const response = await fetch("/api/chem/render", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(buildMoleculeRenderRequestPayload(hydratedEntry, renderOptions))
            });
            if (!response.ok) {
              return {
                svg: "",
                smiles: hydratedEntry.smiles
              };
            }
            const payload = (await response.json().catch(() => null)) as RenderPayload | null;
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

      const reactionPayloads = await Promise.all(
        reactions.map(async (entry) => {
          if (entry.reactants.length === 0 || entry.products.length === 0) {
            return {
              svg: "",
              reactants: entry.reactants,
              products: entry.products,
              conditions: entry.conditions
            };
          }

          try {
            const hydratedEntry = await loadHydratedReactionEntry(entry, { documentId, sessionId });
            const response = await fetch("/api/chem/reaction/render", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(
                buildReactionRenderRequestPayload(hydratedEntry, renderOptions)
              )
            });
            if (!response.ok) {
              return {
                svg: "",
                reactants: hydratedEntry.reactants,
                products: hydratedEntry.products,
                conditions: hydratedEntry.conditions
              };
            }
            const payload = (await response.json().catch(() => null)) as RenderPayload | null;
            return {
              svg: typeof payload?.svg === "string" ? payload.svg : "",
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
      typeof window === "undefined"
        ? hydratedHtml
        : `${hydratedHtml}${buildPreviewBridgeScript(previewBridgeToken, window.location.origin)}`,
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

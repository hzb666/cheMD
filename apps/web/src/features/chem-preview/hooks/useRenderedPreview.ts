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

interface MoleculeRenderResult {
  svg: string;
  smiles: string;
}

interface ReactionRenderResult {
  svg: string;
  reactants: string[];
  products: string[];
  conditions: string[];
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

export const buildMoleculeRenderErrorMarkup = (message: string): string => {
  const normalizedMessage = message.trim() || "Molecule render failed";
  return `<div class="chemd-render-error" role="alert" aria-live="polite">${escapeHtml(normalizedMessage)}</div>`;
};

export const selectRenderGraphicMarkup = (
  payload: RenderPayload | null,
  fallbackMarkup = ""
): string =>
  fallbackMarkup || (typeof payload?.svg === "string" && payload.svg.trim().length > 0 ? payload.svg : "");

const requestRenderPayload = async (
  payload: ReturnType<typeof buildMoleculeRenderRequestPayload> | ReturnType<typeof buildReactionRenderRequestPayload>
): Promise<RenderRequestResult> => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), RENDER_REQUEST_TIMEOUT_MS);
  const fallbackMessage = payload.type === "molecule" ? "Molecule render failed" : "Reaction render failed";

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
            : `${fallbackMessage} (${response.status})`
      };
    }

    return {
      payload: nextPayload
    };
  } catch {
    return {
      payload: null,
      errorMessage: fallbackMessage
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

const readReactionPayloadList = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;

const hydrateMoleculeRenderResult = async (
  entry: ReturnType<typeof parseMoleculeEntries>[number],
  options: UseRenderedPreviewOptions
): Promise<MoleculeRenderResult> => {
  if (!entry.smiles) {
    return {
      svg: "",
      smiles: entry.smiles
    };
  }

  try {
    const hydratedEntry = await loadHydratedMoleculeEntry(entry, options);
    const { payload, errorMessage } = await requestRenderPayload(
      buildMoleculeRenderRequestPayload(hydratedEntry, options.renderOptions)
    );
    const fallbackSvg = errorMessage ? buildMoleculeRenderErrorMarkup(errorMessage) : "";
    return {
      svg: selectRenderGraphicMarkup(payload, fallbackSvg),
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
};

const hydrateReactionRenderResult = async (
  entry: ReturnType<typeof parseReactionEntries>[number],
  options: UseRenderedPreviewOptions
): Promise<ReactionRenderResult> => {
  try {
    const hydratedEntry = await loadHydratedReactionEntry(entry, options);
    const { payload, errorMessage } = await requestRenderPayload(
      buildReactionRenderRequestPayload(hydratedEntry, options.renderOptions)
    );
    const fallbackSvg = errorMessage ? buildReactionRenderErrorMarkup(errorMessage) : "";
    return {
      svg: selectRenderGraphicMarkup(payload, fallbackSvg),
      reactants: readReactionPayloadList(payload?.reaction?.reactants, hydratedEntry.reactants),
      products: readReactionPayloadList(payload?.reaction?.products, hydratedEntry.products),
      conditions: readReactionPayloadList(payload?.reaction?.conditions, hydratedEntry.conditions)
    };
  } catch {
    return {
      svg: "",
      reactants: entry.reactants,
      products: entry.products,
      conditions: entry.conditions
    };
  }
};

const buildHydratedPreviewHtml = (
  baseHtml: string,
  moleculePayloads: MoleculeRenderResult[],
  reactionPayloads: ReactionRenderResult[]
): string =>
  replaceReactionFieldValues(
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

      const hydrationOptions = { documentId, sessionId, renderOptions };
      const moleculePayloadPromise = Promise.all(
        molecules.map((entry) => hydrateMoleculeRenderResult(entry, hydrationOptions))
      );
      const reactionPayloadPromise = Promise.all(
        reactions.map((entry) => hydrateReactionRenderResult(entry, hydrationOptions))
      );
      const [moleculePayloads, reactionPayloads] = await Promise.all([
        moleculePayloadPromise,
        reactionPayloadPromise
      ]);

      if (!active) {
        return;
      }

      setHydratedHtml(buildHydratedPreviewHtml(baseHtml, moleculePayloads, reactionPayloads));
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

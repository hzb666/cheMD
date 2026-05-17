import { useEffect, useMemo, useState } from "react";

import {
  buildMoleculeRenderRequestPayload,
  buildReactionRenderRequestPayload,
  parseMoleculeEntries,
  parseReactionEntries,
  replaceMoleculeFieldValues,
  replaceMoleculeGraphics,
  replaceReactionFieldValues,
  replaceReactionGraphics,
  type RenderPayload,
} from "../../../web/src/features/chem-preview/lib/preview-hydration";
import type { ChemPreviewRenderInput } from "../contracts";
import { invokeCommand } from "../utils";
import { measureDesktopPerformance, measureDesktopPerformanceAsync } from "../performance-marks";

type PreviewRenderOptions = Parameters<typeof buildMoleculeRenderRequestPayload>[1];
type PreviewRenderTask = () => Promise<RenderPayload | null>;

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (match) => HTML_ESCAPE_MAP[match] ?? match);

const buildRenderErrorMarkup = (message: string, fallback: string): string =>
  `<div class="chemd-render-error" role="alert" aria-live="polite">${escapeHtml(message.trim() || fallback)}</div>`;

const readReactionPayloadList = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;

const PREVIEW_RENDER_CONCURRENCY = 2;
const PREVIEW_RENDER_CACHE_LIMIT = 200;
const renderPayloadCache = new Map<string, Promise<RenderPayload | null>>();

const stableStringify = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value !== "object") return "null";
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
};

export const createPreviewRenderCacheKey = (input: ChemPreviewRenderInput): string =>
  stableStringify(input);

export const createPreviewRenderScheduler = (concurrency: number) => {
  const limit = Math.max(1, concurrency);
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const runNext = () => {
    if (activeCount >= limit) {
      return;
    }
    const next = queue.shift();
    if (!next) {
      return;
    }
    activeCount += 1;
    next();
  };

  return <Result,>(task: () => Promise<Result>): Promise<Result> =>
    new Promise((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            activeCount -= 1;
            runNext();
          });
      });
      runNext();
    });
};

const schedulePreviewRender = createPreviewRenderScheduler(PREVIEW_RENDER_CONCURRENCY);

const readCachedRenderPayload = (
  key: string,
  task: PreviewRenderTask
): Promise<RenderPayload | null> => {
  const cached = renderPayloadCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = schedulePreviewRender(task);
  renderPayloadCache.set(key, promise);
  if (renderPayloadCache.size > PREVIEW_RENDER_CACHE_LIMIT) {
    const oldestKey = renderPayloadCache.keys().next().value;
    if (oldestKey) {
      renderPayloadCache.delete(oldestKey);
    }
  }
  promise.catch(() => {
    renderPayloadCache.delete(key);
  });
  return promise;
};

const requestRenderPayload = async (
  input: ChemPreviewRenderInput
): Promise<RenderPayload | null> =>
  readCachedRenderPayload(
    createPreviewRenderCacheKey(input),
    () => measureDesktopPerformanceAsync(
      "preview.renderCommand",
      () => invokeCommand("render_chem_preview", { input }),
      { type: input.type }
    )
  );

const hydrateMoleculeEntry = async (
  entry: ReturnType<typeof parseMoleculeEntries>[number],
  renderOptions?: PreviewRenderOptions
) => {
  if (!entry.smiles) {
    return {
      svg: "",
      smiles: entry.smiles,
    };
  }

  try {
    const payload = await requestRenderPayload(
      buildMoleculeRenderRequestPayload(entry, renderOptions)
    );
    return {
      svg: typeof payload?.svg === "string" ? payload.svg : "",
      smiles:
        typeof payload?.canonicalSmiles === "string" && payload.canonicalSmiles.trim().length > 0
          ? payload.canonicalSmiles
          : entry.smiles,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Molecule render failed";
    return {
      svg: buildRenderErrorMarkup(message, "Molecule render failed"),
      smiles: entry.smiles,
    };
  }
};

const hydrateReactionEntry = async (
  entry: ReturnType<typeof parseReactionEntries>[number],
  renderOptions?: PreviewRenderOptions
) => {
  try {
    const payload = await requestRenderPayload(
      buildReactionRenderRequestPayload(entry, renderOptions)
    );
    return {
      svg: typeof payload?.svg === "string" ? payload.svg : "",
      reactants: readReactionPayloadList(payload?.reaction?.reactants, entry.reactants),
      products: readReactionPayloadList(payload?.reaction?.products, entry.products),
      conditions: readReactionPayloadList(payload?.reaction?.conditions, entry.conditions),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reaction render failed";
    return {
      svg: buildRenderErrorMarkup(message, "Reaction render failed"),
      reactants: entry.reactants,
      products: entry.products,
      conditions: entry.conditions,
    };
  }
};

const buildHydratedPreviewHtml = (
  baseHtml: string,
  moleculePayloads: Awaited<ReturnType<typeof hydrateMoleculeEntry>>[],
  reactionPayloads: Awaited<ReturnType<typeof hydrateReactionEntry>>[]
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
      conditions: payload.conditions,
    }))
  );

export const useRenderedPreview = (
  html: string,
  renderOptions?: PreviewRenderOptions
): string => {
  const baseHtml = useMemo(() => html, [html]);
  const [hydratedHtml, setHydratedHtml] = useState(baseHtml);

  useEffect(() => {
    let active = true;
    setHydratedHtml(baseHtml);

    const hydrate = async () => {
      const molecules = parseMoleculeEntries(baseHtml);
      const reactions = parseReactionEntries(baseHtml);
      if (molecules.length === 0 && reactions.length === 0) {
        return;
      }

      const [moleculePayloads, reactionPayloads] = await measureDesktopPerformanceAsync(
        "preview.hydration",
        () => Promise.all([
          Promise.all(molecules.map((entry) => hydrateMoleculeEntry(entry, renderOptions))),
          Promise.all(reactions.map((entry) => hydrateReactionEntry(entry, renderOptions))),
        ]),
        {
          moleculeCount: molecules.length,
          reactionCount: reactions.length,
        }
      );

      if (!active) {
        return;
      }

      setHydratedHtml(measureDesktopPerformance(
        "preview.htmlReplacement",
        () => buildHydratedPreviewHtml(baseHtml, moleculePayloads, reactionPayloads),
        {
          moleculeCount: moleculePayloads.length,
          reactionCount: reactionPayloads.length,
        }
      ));
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [baseHtml, renderOptions]);

  return hydratedHtml;
};

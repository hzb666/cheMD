"use client";

import { useEffect, useState } from "react";

import { buildRenderPayload } from "../lib/build-render-payload";
import { mapPreviewResponse } from "../lib/map-preview-response";
import type { RenderPreviewState } from "../types";

/**
 * Hook that fetches an SVG preview from `/api/chem/render` whenever `smiles`
 * or `molfile` changes.
 *
 * The request is debounced by 300 ms to avoid hammering the API while the
 * user is typing.
 */
export const useRenderedPreview = (smiles?: string, molfile?: string): RenderPreviewState => {
  const [state, setState] = useState<RenderPreviewState>({ phase: "idle" });

  useEffect(() => {
    if (!smiles && !molfile) {
      setState({ phase: "idle" });
      return;
    }

    setState((prev) => ({ ...prev, phase: "loading" }));

    const timer = setTimeout(async () => {
      try {
        const payload = buildRenderPayload(smiles, molfile);
        const response = await fetch("/api/chem/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(errorBody.message ?? `Render failed (${response.status})`);
        }

        const raw = (await response.json()) as { svg: string; warnings: string[] };
        const mapped = mapPreviewResponse(raw);
        setState({ phase: "success", svg: mapped.svg, warnings: mapped.warnings });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Render failed";
        setState({ phase: "error", errorMessage });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [smiles, molfile]);

  return state;
};

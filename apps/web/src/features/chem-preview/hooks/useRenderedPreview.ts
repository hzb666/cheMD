import { useEffect, useMemo, useState } from "react";

interface UseRenderedPreviewResult {
  hydratedHtml: string;
}

interface UseRenderedPreviewOptions {
  documentId?: string;
  sessionId?: string;
}

const MOLECULE_EDIT_BUTTON =
  '<button type="button" class="chemd-edit-structure" data-action="edit-structure">Edit structure</button>';

const REACTION_EDIT_BUTTON =
  '<button type="button" class="chemd-edit-reaction" data-action="edit-reaction">Edit reaction</button>';

const PREVIEW_BRIDGE_SCRIPT = `<script>
(() => {
  if (window.__chemdBridgeBound) return;
  window.__chemdBridgeBound = true;
  window.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const structureButton = target.closest("[data-action='edit-structure']");
    if (structureButton) {
      const block = structureButton.closest(".chemd-block--molecule");
      if (!(block instanceof HTMLElement)) return;

      const blockId = block.getAttribute("data-node-id") || "";
      const fields = Array.from(block.querySelectorAll(".chemd-field"));
      let smiles = "";
      for (const field of fields) {
        const dt = field.querySelector("dt");
        const dd = field.querySelector("dd");
        if (!dt || !dd) continue;
        if (String(dt.textContent || "").trim().toUpperCase() === "SMILES") {
          smiles = String(dd.textContent || "");
          break;
        }
      }

      window.parent.postMessage({ type: "chemd:edit-molecule", blockId, smiles }, "*");
      return;
    }

    const reactionButton = target.closest("[data-action='edit-reaction']");
    if (!reactionButton) return;
    const reactionBlock = reactionButton.closest(".chemd-block--reaction");
    if (!(reactionBlock instanceof HTMLElement)) return;

    const blockId = reactionBlock.getAttribute("data-node-id") || "";
    const fields = Array.from(reactionBlock.querySelectorAll(".chemd-field"));
    const readListField = (label) => {
      for (const field of fields) {
        const dt = field.querySelector("dt");
        const dd = field.querySelector("dd");
        if (!dt || !dd) continue;
        if (String(dt.textContent || "").trim().toUpperCase() !== label) continue;
        return String(dd.textContent || "").split("|").map((item) => item.trim()).filter(Boolean);
      }
      return [];
    };

    const reactants = readListField("REACTANTS");
    const products = readListField("PRODUCTS");
    const conditions = readListField("CONDITIONS");

    window.parent.postMessage({ type: "chemd:edit-reaction", blockId, reactants, products, conditions }, "*");
  });
})();
</script>`;

export const injectEditButtons = (html: string): string =>
  html
    .replace(/(<section class="chemd-block chemd-block--molecule"[^>]*>)/g, `$1${MOLECULE_EDIT_BUTTON}`)
    .replace(/(<section class="chemd-block chemd-block--reaction"[^>]*>)/g, `$1${REACTION_EDIT_BUTTON}`);

interface RenderPayload {
  svg?: string;
}

export const parseMoleculeEntries = (html: string): Array<{ blockId: string; smiles: string }> => {
  const entries: Array<{ blockId: string; smiles: string }> = [];
  const blockPattern =
    /<section class="chemd-block chemd-block--molecule"[^>]*data-node-id="([^"]*)"[^>]*>[\s\S]*?<dt>SMILES<\/dt><dd>([^<]*)<\/dd>/g;
  for (const match of html.matchAll(blockPattern)) {
    entries.push({
      blockId: (match[1] || "").trim(),
      smiles: (match[2] || "").trim()
    });
  }
  return entries;
};

interface HydratedMoleculeEntry {
  blockId: string;
  smiles: string;
}

interface LoadHydratedMoleculeEntryOptions extends UseRenderedPreviewOptions {
  fetchImpl?: typeof fetch;
}

export const loadHydratedMoleculeEntry = async (
  entry: HydratedMoleculeEntry,
  { documentId, sessionId, fetchImpl = fetch }: LoadHydratedMoleculeEntryOptions
): Promise<{ smiles: string; molfile?: string }> => {
  if (!documentId || !sessionId || !entry.blockId) {
    return { smiles: entry.smiles };
  }

  try {
    const params = new URLSearchParams({
      documentId,
      blockId: entry.blockId,
      sessionId
    });
    const response = await fetchImpl(`/api/chem/structure?${params.toString()}`);
    if (!response.ok) {
      return { smiles: entry.smiles };
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          found?: boolean;
          structure?: {
            smiles?: unknown;
            molfile?: unknown;
          };
        }
      | null;
    if (!payload?.found) {
      return { smiles: entry.smiles };
    }

    return {
      smiles:
        typeof payload.structure?.smiles === "string" && payload.structure.smiles.trim().length > 0
          ? payload.structure.smiles
          : entry.smiles,
      molfile:
        typeof payload.structure?.molfile === "string" && payload.structure.molfile.trim().length > 0
          ? payload.structure.molfile
          : undefined
    };
  } catch {
    return { smiles: entry.smiles };
  }
};

interface HydratedReactionEntry {
  blockId: string;
  reactants: string[];
  products: string[];
  conditions: string[];
}

interface LoadHydratedReactionEntryOptions extends UseRenderedPreviewOptions {
  fetchImpl?: typeof fetch;
}

const splitListText = (value: string): string[] =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const parseReactionEntries = (
  html: string
): Array<HydratedReactionEntry> => {
  const entries: Array<HydratedReactionEntry> = [];
  const blockPattern =
    /<section class="chemd-block chemd-block--reaction"[^>]*data-node-id="([^"]*)"[^>]*>[\s\S]*?<dt>Reactants<\/dt><dd>([^<]*)<\/dd>[\s\S]*?<dt>Products<\/dt><dd>([^<]*)<\/dd>(?:[\s\S]*?<dt>Conditions<\/dt><dd>([^<]*)<\/dd>)?/g;
  for (const match of html.matchAll(blockPattern)) {
    entries.push({
      blockId: (match[1] || "").trim(),
      reactants: splitListText(match[2] || ""),
      products: splitListText(match[3] || ""),
      conditions: splitListText(match[4] || "")
    });
  }
  return entries;
};

export const loadHydratedReactionEntry = async (
  entry: HydratedReactionEntry,
  { documentId, sessionId, fetchImpl = fetch }: LoadHydratedReactionEntryOptions
): Promise<{ reactants: string[]; products: string[]; conditions: string[] }> => {
  if (!documentId || !sessionId || !entry.blockId) {
    return {
      reactants: entry.reactants,
      products: entry.products,
      conditions: entry.conditions
    };
  }

  try {
    const params = new URLSearchParams({
      documentId,
      blockId: entry.blockId,
      sessionId
    });
    const response = await fetchImpl(`/api/chem/reaction/structure?${params.toString()}`);
    if (!response.ok) {
      return {
        reactants: entry.reactants,
        products: entry.products,
        conditions: entry.conditions
      };
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

    const reactants = Array.isArray(payload?.reaction?.reactants)
      ? payload?.reaction?.reactants.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];
    const products = Array.isArray(payload?.reaction?.products)
      ? payload?.reaction?.products.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];
    const conditions = Array.isArray(payload?.reaction?.conditions)
      ? payload?.reaction?.conditions.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      : [];

    if (!payload?.found || reactants.length === 0 || products.length === 0) {
      return {
        reactants: entry.reactants,
        products: entry.products,
        conditions: entry.conditions
      };
    }

    return {
      reactants,
      products,
      conditions
    };
  } catch {
    return {
      reactants: entry.reactants,
      products: entry.products,
      conditions: entry.conditions
    };
  }
};

export const replaceMoleculeGraphics = (html: string, svgs: string[]): string => {
  let index = 0;
  return html.replace(
    /(<section class="chemd-block chemd-block--molecule"[\s\S]*?<div class="chemd-graphic">)([\s\S]*?)(<\/div>)/g,
    (_, open, _oldGraphic, close) => {
      const nextSvg = svgs[index] || "";
      index += 1;
      if (!nextSvg) {
        return `${open}${_oldGraphic}${close}`;
      }
      return `${open}${nextSvg}${close}`;
    }
  );
};

export const replaceReactionGraphics = (html: string, svgs: string[]): string => {
  let index = 0;
  return html.replace(
    /(<section class="chemd-block chemd-block--reaction"[\s\S]*?<div class="chemd-graphic">)([\s\S]*?)(<\/div>)/g,
    (_, open, oldGraphic, close) => {
      const nextSvg = svgs[index] || "";
      index += 1;
      if (!nextSvg) {
        return `${open}${oldGraphic}${close}`;
      }
      return `${open}${nextSvg}${close}`;
    }
  );
};

export const useRenderedPreview = (
  html: string,
  options: UseRenderedPreviewOptions = {}
): UseRenderedPreviewResult => {
  const baseHtml = useMemo(() => injectEditButtons(html), [html]);
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

      const moleculeSvgs = await Promise.all(
        molecules.map(async (entry) => {
          if (!entry.smiles) {
            return "";
          }

          try {
            const hydratedEntry = await loadHydratedMoleculeEntry(entry, options);
            const response = await fetch("/api/chem/render", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                kind: "molecule",
                smiles: hydratedEntry.smiles,
                molfile: hydratedEntry.molfile
              })
            });
            if (!response.ok) {
              return "";
            }
            const payload = (await response.json().catch(() => null)) as RenderPayload | null;
            return typeof payload?.svg === "string" ? payload.svg : "";
          } catch {
            return "";
          }
        })
      );

      const reactionSvgs = await Promise.all(
        reactions.map(async (entry) => {
          if (entry.reactants.length === 0 || entry.products.length === 0) {
            return "";
          }

          try {
            const hydratedEntry = await loadHydratedReactionEntry(entry, options);
            const response = await fetch("/api/chem/reaction/render", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                reactants: hydratedEntry.reactants,
                products: hydratedEntry.products,
                conditions: hydratedEntry.conditions
              })
            });
            if (!response.ok) {
              return "";
            }
            const payload = (await response.json().catch(() => null)) as RenderPayload | null;
            return typeof payload?.svg === "string" ? payload.svg : "";
          } catch {
            return "";
          }
        })
      );

      if (!active) {
        return;
      }

      const nextHtml = replaceReactionGraphics(
        replaceMoleculeGraphics(baseHtml, moleculeSvgs),
        reactionSvgs
      );
      setHydratedHtml(nextHtml);
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [baseHtml, options.documentId, options.sessionId]);

  return {
    hydratedHtml: `${hydratedHtml}${PREVIEW_BRIDGE_SCRIPT}`
  };
};

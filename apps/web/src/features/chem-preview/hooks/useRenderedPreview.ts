import { useEffect, useMemo, useState } from "react";

interface UseRenderedPreviewResult {
  hydratedHtml: string;
}

const EDIT_BUTTON =
  '<button type="button" class="chemd-edit-structure" data-action="edit-structure">Edit structure</button>';

const PREVIEW_BRIDGE_SCRIPT = `<script>
(() => {
  if (window.__chemdBridgeBound) return;
  window.__chemdBridgeBound = true;
  window.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-action='edit-structure']");
    if (!button) return;
    const block = button.closest(".chemd-block--molecule");
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
  });
})();
</script>`;

const injectEditButtons = (html: string): string =>
  html.replace(/(<section class="chemd-block chemd-block--molecule"[^>]*>)/g, `$1${EDIT_BUTTON}`);

interface RenderPayload {
  svg?: string;
}

const parseMoleculeEntries = (html: string): Array<{ smiles: string }> => {
  const entries: Array<{ smiles: string }> = [];
  const blockPattern =
    /<section class="chemd-block chemd-block--molecule"[^>]*>[\s\S]*?<dt>SMILES<\/dt><dd>([^<]*)<\/dd>/g;
  for (const match of html.matchAll(blockPattern)) {
    entries.push({
      smiles: (match[1] || "").trim()
    });
  }
  return entries;
};

const replaceMoleculeGraphics = (html: string, svgs: string[]): string => {
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

export const useRenderedPreview = (html: string): UseRenderedPreviewResult => {
  const baseHtml = useMemo(() => injectEditButtons(html), [html]);
  const [hydratedHtml, setHydratedHtml] = useState(baseHtml);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      const molecules = parseMoleculeEntries(baseHtml);
      if (molecules.length === 0) {
        setHydratedHtml(baseHtml);
        return;
      }

      const svgs = await Promise.all(
        molecules.map(async (entry) => {
          if (!entry.smiles) {
            return "";
          }

          try {
            const response = await fetch("/api/chem/render", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                kind: "molecule",
                smiles: entry.smiles
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

      setHydratedHtml(replaceMoleculeGraphics(baseHtml, svgs));
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, [baseHtml]);

  return {
    hydratedHtml: `${hydratedHtml}${PREVIEW_BRIDGE_SCRIPT}`
  };
};

import { createScopedToken } from "../../../lib/random-token";

const MOLECULE_EDIT_BUTTON =
  '<button type="button" class="chemd-edit-structure" data-action="edit-structure">Edit structure</button>';

const REACTION_EDIT_BUTTON =
  '<button type="button" class="chemd-edit-reaction" data-action="edit-reaction">Edit reaction</button>';

export const createPreviewBridgeToken = (): string => createScopedToken("preview");

export const injectEditButtons = (html: string): string =>
  html
    .replace(/(<section class="chemd-block chemd-block--molecule"[^>]*>)/g, `$1${MOLECULE_EDIT_BUTTON}`)
    .replace(/(<section class="chemd-block chemd-block--reaction"[^>]*>)/g, `$1${REACTION_EDIT_BUTTON}`);

export const buildPreviewBridgeScript = (
  previewBridgeToken: string,
  parentOrigin: string
): string => `<script>
(() => {
  if (window.__chemdBridgeBound) return;
  window.__chemdBridgeBound = true;
  const previewToken = ${JSON.stringify(previewBridgeToken)};
  const targetOrigin = ${JSON.stringify(parentOrigin)};
  const resolveBlockId = (block, selector, prefix) => {
    const explicitId = String(block.getAttribute("data-node-id") || "").trim();
    if (explicitId) return explicitId;
    const blocks = Array.from(document.querySelectorAll(selector));
    const ordinal = blocks.indexOf(block) + 1;
    return ordinal > 0 ? prefix + "-missing-id-" + ordinal : "";
  };
  window.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const structureButton = target.closest("[data-action='edit-structure']");
    if (structureButton) {
      const block = structureButton.closest(".chemd-block--molecule");
      if (!(block instanceof HTMLElement)) return;
      const blockId = resolveBlockId(block, ".chemd-block--molecule", "mol");
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

      window.parent.postMessage({ type: "chemd:edit-molecule", blockId, smiles, previewToken }, targetOrigin);
      return;
    }

    const reactionButton = target.closest("[data-action='edit-reaction']");
    if (!reactionButton) return;
    const reactionBlock = reactionButton.closest(".chemd-block--reaction");
    if (!(reactionBlock instanceof HTMLElement)) return;
    const blockId = resolveBlockId(reactionBlock, ".chemd-block--reaction", "rxn");
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

    window.parent.postMessage(
      { type: "chemd:edit-reaction", blockId, reactants, products, conditions, previewToken },
      targetOrigin
    );
  });
})();
</script>`;

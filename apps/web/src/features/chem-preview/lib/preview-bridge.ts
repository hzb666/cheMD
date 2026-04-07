import { createScopedToken } from "../../../lib/random-token";

const CHEMD_EDIT_BUTTON =
  '<button type="button" class="chemd-edit-chem" data-action="edit-chem">Edit chemistry</button>';

export const createPreviewBridgeToken = (): string => createScopedToken("preview");

export const injectEditButtons = (html: string): string =>
  html
    .replace(/(<section class="chemd-block chemd-block--molecule"[^>]*>)/g, `$1${CHEMD_EDIT_BUTTON}`)
    .replace(/(<section class="chemd-block chemd-block--reaction"[^>]*>)/g, `$1${CHEMD_EDIT_BUTTON}`);

export const buildPreviewBridgeScript = (
  previewBridgeToken: string,
  parentOrigin: string
): string => `<script>
(() => {
  if (window.__chemdBridgeBound) return;
  window.__chemdBridgeBound = true;
  const previewToken = ${JSON.stringify(previewBridgeToken)};
  const targetOrigin = ${JSON.stringify(parentOrigin)};
  const chemicalBlockSelector = ".chemd-block--molecule, .chemd-block--reaction";
  const resolveBlockId = (block, prefix) => {
    const explicitId = String(block.getAttribute("data-node-id") || "").trim();
    if (explicitId) return explicitId;
    const blocks = Array.from(document.querySelectorAll(chemicalBlockSelector));
    const ordinal = blocks.indexOf(block) + 1;
    return ordinal > 0 ? prefix + "-missing-id-" + ordinal : "";
  };
  window.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editButton = target.closest("[data-action='edit-chem']");
    if (!editButton) return;

    const moleculeBlock = editButton.closest(".chemd-block--molecule");
    if (moleculeBlock) {
      const block = moleculeBlock;
      if (!(block instanceof HTMLElement)) return;
      const blockId = resolveBlockId(block, "chem");
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

      window.parent.postMessage(
        { type: "chemd:edit", draftType: "molecule", blockId, smiles, previewToken },
        targetOrigin
      );
      return;
    }

    const reactionBlock = editButton.closest(".chemd-block--reaction");
    if (!(reactionBlock instanceof HTMLElement)) return;
    const blockId = resolveBlockId(reactionBlock, "chem");
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
      { type: "chemd:edit", draftType: "reaction", blockId, reactants, products, conditions, previewToken },
      targetOrigin
    );
  });
})();
</script>`;

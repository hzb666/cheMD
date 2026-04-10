import { createScopedToken } from "../../../lib/random-token";

const CHEMD_EDIT_BUTTON =
  '<button type="button" class="chemd-edit-chem" data-action="edit-chem" aria-label="Edit chemistry" title="Edit chemistry"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';

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
  const inventoryPopoverClassName = "chemd-inventory-popover";
  const hoverDelayMs = 360;
  const inventoryStateByBlockId = new Map();
  let activeHoverBlock = null;
  let hoverTimeoutId = 0;
  const resolveBlockId = (block, prefix) => {
    const explicitId = String(block.getAttribute("data-node-id") || "").trim();
    if (explicitId) return explicitId;
    const blocks = Array.from(document.querySelectorAll(chemicalBlockSelector));
    const ordinal = blocks.indexOf(block) + 1;
    return ordinal > 0 ? prefix + "-missing-id-" + ordinal : "";
  };
  const decodeHtmlEntities = (value) => value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const parseJsonArrayAttribute = (block, attributeName) => {
    const raw = String(block.getAttribute(attributeName) || "").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(decodeHtmlEntities(raw));
      return Array.isArray(parsed)
        ? parsed
            .filter((item) => typeof item === "string" && item.trim())
            .map((item) => item.trim())
        : [];
    } catch {
      return [];
    }
  };
  const resolveChemicalBlocks = () =>
    Array.from(document.querySelectorAll(chemicalBlockSelector)).filter((block) => block instanceof HTMLElement);
  const resolveBlockById = (blockId) => {
    const blocks = resolveChemicalBlocks();
    for (const block of blocks) {
      if (resolveBlockId(block, "chem") === blockId) {
        return block;
      }
    }
    return null;
  };
  const createTextElement = (tagName, className, text) => {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
  };
  const formatNumber = (value) =>
    typeof value === "number" && Number.isFinite(value)
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
      : null;
  const pickInventoryUnit = (inventory) => {
    if (!inventory || !Array.isArray(inventory.items)) {
      return "";
    }
    for (const item of inventory.items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const unit = typeof item.unit === "string" ? item.unit.trim() : "";
      if (unit) {
        return unit;
      }
    }
    return "";
  };
  const formatQuantity = (value, unit) => {
    const formattedValue = formatNumber(value);
    if (!formattedValue) {
      return null;
    }
    return unit ? formattedValue + " " + unit : formattedValue;
  };
  const describeInventorySummary = (entry) => {
    if (typeof entry?.error === "string" && entry.error.trim()) {
      return entry.error.trim();
    }
    if (!entry || typeof entry !== "object") {
      return "库存查询失败";
    }
    const inventory = entry.inventory;
    if (!inventory || typeof inventory !== "object") {
      return entry.casNumber ? "未查到库存记录" : "未解析到 CAS";
    }
    if (inventory.exists_in_inventory !== true) {
      return "库存中暂无记录";
    }
    const metrics = [];
    if (typeof inventory.in_stock_count === "number" && inventory.in_stock_count > 0) {
      metrics.push("在库 " + inventory.in_stock_count + " 瓶");
    }
    const totalRemaining = formatQuantity(inventory.total_remaining, pickInventoryUnit(inventory));
    if (totalRemaining) {
      metrics.push("余量 " + totalRemaining);
    }
    if (typeof inventory.borrowed_count === "number" && inventory.borrowed_count > 0) {
      metrics.push("借出 " + inventory.borrowed_count + " 瓶");
    }
    return metrics.length > 0 ? metrics.join(" · ") : "已登记，无在库记录";
  };
  const ensureInventoryPopover = (block) => {
    const existing = block.querySelector("." + inventoryPopoverClassName);
    if (existing instanceof HTMLElement) {
      return existing;
    }
    const popover = document.createElement("div");
    popover.className = inventoryPopoverClassName;
    popover.dataset.state = "hidden";
    popover.dataset.visible = "false";
    popover.setAttribute("aria-hidden", "true");
    block.appendChild(popover);
    return popover;
  };
  const hideInventoryPopover = (block) => {
    if (!(block instanceof HTMLElement)) {
      return;
    }
    const popover = block.querySelector("." + inventoryPopoverClassName);
    if (!(popover instanceof HTMLElement)) {
      return;
    }
    popover.dataset.visible = "false";
    popover.setAttribute("aria-hidden", "true");
  };
  const renderMoleculeInventory = (popover, entry) => {
    const name = typeof entry?.displayName === "string" && entry.displayName.trim()
      ? entry.displayName.trim()
      : typeof entry?.notation === "string" && entry.notation.trim()
        ? entry.notation.trim()
        : typeof entry?.smiles === "string" && entry.smiles.trim()
          ? entry.smiles.trim()
          : "Molecule";
    popover.appendChild(createTextElement("div", "chemd-inventory-popover__title", "库存"));
    popover.appendChild(createTextElement("div", "chemd-inventory-popover__name", name));
    if (typeof entry?.casNumber === "string" && entry.casNumber.trim()) {
      popover.appendChild(createTextElement("div", "chemd-inventory-popover__meta", "CAS " + entry.casNumber.trim()));
    }
    popover.appendChild(
      createTextElement("div", "chemd-inventory-popover__summary", describeInventorySummary(entry))
    );
  };
  const renderReactionInventory = (popover, items) => {
    popover.appendChild(createTextElement("div", "chemd-inventory-popover__title", "Reactants 库存"));
    if (!Array.isArray(items) || items.length === 0) {
      popover.appendChild(createTextElement("div", "chemd-inventory-popover__empty", "未提供 reactants"));
      return;
    }
    for (const entry of items) {
      const row = document.createElement("div");
      row.className = "chemd-inventory-popover__row";
      const name =
        typeof entry?.displayName === "string" && entry.displayName.trim()
          ? entry.displayName.trim()
          : typeof entry?.reactant === "string" && entry.reactant.trim()
            ? entry.reactant.trim()
            : typeof entry?.notation === "string" && entry.notation.trim()
              ? entry.notation.trim()
              : "Reactant";
      row.appendChild(createTextElement("div", "chemd-inventory-popover__name", name));
      if (typeof entry?.casNumber === "string" && entry.casNumber.trim()) {
        row.appendChild(
          createTextElement("div", "chemd-inventory-popover__meta", "CAS " + entry.casNumber.trim())
        );
      }
      row.appendChild(
        createTextElement("div", "chemd-inventory-popover__summary", describeInventorySummary(entry))
      );
      popover.appendChild(row);
    }
  };
  const renderInventoryPopover = (block, visible) => {
    if (!(block instanceof HTMLElement)) {
      return;
    }
    const blockId = resolveBlockId(block, "chem");
    const nextState = inventoryStateByBlockId.get(blockId);
    if (!visible || !nextState) {
      hideInventoryPopover(block);
      return;
    }
    const popover = ensureInventoryPopover(block);
    popover.replaceChildren();
    popover.dataset.state = nextState.state;
    popover.dataset.visible = "true";
    popover.setAttribute("aria-hidden", "false");

    if (nextState.state === "loading") {
      popover.appendChild(createTextElement("div", "chemd-inventory-popover__title", "库存"));
      popover.appendChild(
        createTextElement("div", "chemd-inventory-popover__summary", "查询库存中...")
      );
      return;
    }

    if (nextState.state === "error") {
      popover.appendChild(createTextElement("div", "chemd-inventory-popover__title", "库存"));
      popover.appendChild(
        createTextElement(
          "div",
          "chemd-inventory-popover__summary",
          typeof nextState.message === "string" && nextState.message.trim()
            ? nextState.message.trim()
            : "库存查询失败"
        )
      );
      return;
    }

    if (nextState.draftType === "reaction") {
      renderReactionInventory(popover, nextState.items);
      return;
    }

    renderMoleculeInventory(popover, nextState.item);
  };
  const postInventoryHover = (block) => {
    if (!(block instanceof HTMLElement)) {
      return;
    }
    const blockId = resolveBlockId(block, "chem");
    if (!blockId) {
      return;
    }
    if (block.matches(".chemd-block--molecule")) {
      const smiles = decodeHtmlEntities(String(block.getAttribute("data-smiles") || "")).trim();
      if (!smiles) {
        return;
      }
      window.parent.postMessage(
        { type: "chemd:inventory-hover", draftType: "molecule", blockId, smiles, previewToken },
        targetOrigin
      );
      return;
    }
    if (!block.matches(".chemd-block--reaction")) {
      return;
    }
    const reactants = parseJsonArrayAttribute(block, "data-reactants");
    if (reactants.length === 0) {
      return;
    }
    window.parent.postMessage(
      { type: "chemd:inventory-hover", draftType: "reaction", blockId, reactants, previewToken },
      targetOrigin
    );
  };
  const scheduleInventoryHover = (block) => {
    if (!(block instanceof HTMLElement)) {
      return;
    }
    window.clearTimeout(hoverTimeoutId);
    if (activeHoverBlock && activeHoverBlock !== block) {
      hideInventoryPopover(activeHoverBlock);
    }
    activeHoverBlock = block;
    renderInventoryPopover(block, true);
    hoverTimeoutId = window.setTimeout(() => {
      if (activeHoverBlock !== block) {
        return;
      }
      postInventoryHover(block);
    }, hoverDelayMs);
  };
  const clearInventoryHover = (block) => {
    window.clearTimeout(hoverTimeoutId);
    if (activeHoverBlock === block) {
      activeHoverBlock = null;
    }
    hideInventoryPopover(block);
  };
  for (const block of resolveChemicalBlocks()) {
    block.addEventListener("mouseenter", () => {
      scheduleInventoryHover(block);
    });
    block.addEventListener("mouseleave", () => {
      clearInventoryHover(block);
    });
  }
  window.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const editButton = target.closest("[data-action='edit-chem']");
    if (!(editButton instanceof HTMLElement)) return;

    const moleculeBlock = editButton.closest(".chemd-block--molecule");
    if (moleculeBlock) {
      const block = moleculeBlock;
      if (!(block instanceof HTMLElement)) return;
      const blockId = resolveBlockId(block, "chem");
      const smiles = decodeHtmlEntities(String(block.getAttribute("data-smiles") || ""));

      window.parent.postMessage(
        { type: "chemd:edit", draftType: "molecule", blockId, smiles, previewToken },
        targetOrigin
      );
      return;
    }

    const reactionBlock = editButton.closest(".chemd-block--reaction");
    if (!(reactionBlock instanceof HTMLElement)) return;
    const blockId = resolveBlockId(reactionBlock, "chem");
    const reactants = parseJsonArrayAttribute(reactionBlock, "data-reactants");
    const products = parseJsonArrayAttribute(reactionBlock, "data-products");
    const conditions = parseJsonArrayAttribute(reactionBlock, "data-conditions");

    window.parent.postMessage(
      { type: "chemd:edit", draftType: "reaction", blockId, reactants, products, conditions, previewToken },
      targetOrigin
    );
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== targetOrigin) {
      return;
    }
    const payload = event.data;
    if (!payload || typeof payload !== "object") {
      return;
    }
    if (payload.type !== "chemd:inventory-state") {
      return;
    }
    if (typeof payload.previewToken !== "string" || payload.previewToken !== previewToken) {
      return;
    }
    if (typeof payload.blockId !== "string" || !payload.blockId) {
      return;
    }
    if (payload.state !== "loading" && payload.state !== "ready" && payload.state !== "error") {
      return;
    }
    const block = resolveBlockById(payload.blockId);
    if (!(block instanceof HTMLElement)) {
      return;
    }
    inventoryStateByBlockId.set(payload.blockId, payload);
    renderInventoryPopover(block, activeHoverBlock === block);
  });
})();
</script>`;

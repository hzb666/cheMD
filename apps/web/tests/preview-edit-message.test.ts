import { describe, expect, it } from "vitest";

import { buildPreviewBridgeScript } from "../src/features/chem-preview/lib/preview-bridge";
import {
  readPreviewEditMessage,
  readPreviewInventoryHoverMessage
} from "../src/features/preview/lib/read-preview-edit-message";
import { createScopedToken } from "../src/lib/random-token";

describe("readPreviewEditMessage", () => {
  const previewToken = "preview-token";

  it("accepts messages only from the active preview iframe", () => {
    const previewWindow = {} as Window;
    const otherWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: otherWindow,
          data: {
            type: "chemd:edit",
            draftType: "molecule",
            blockId: "mol-1",
            smiles: "CCO",
            previewToken
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toBeNull();

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:edit",
            draftType: "molecule",
            blockId: "mol-1",
            smiles: "CCO",
            previewToken
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toEqual({
      type: "molecule",
      blockId: "mol-1",
      smiles: "CCO"
    });
  });

  it("sanitizes malformed payloads", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "https://example.com",
          source: previewWindow,
          data: {
            type: "chemd:edit",
            draftType: "molecule",
            blockId: "mol-1",
            smiles: "CCO",
            previewToken
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toBeNull();

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:edit",
            draftType: "molecule",
            blockId: "mol-1",
            smiles: 123,
            previewToken
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toEqual({
      type: "molecule",
      blockId: "mol-1",
      smiles: ""
    });
  });

  it("accepts reaction edit messages from the active preview iframe", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:edit",
            draftType: "reaction",
            blockId: "rxn-1",
            reactants: ["CCO"],
            products: ["CC(=O)O"],
            conditions: ["air"],
            previewToken
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toEqual({
      type: "reaction",
      blockId: "rxn-1",
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air"]
    });
  });

  it("rejects edit messages while preview is stale", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:edit",
            draftType: "molecule",
            blockId: "mol-1",
            smiles: "CCO",
            previewToken
          }
        },
        previewWindow,
        false,
        previewToken
      )
    ).toBeNull();
  });

  it("rejects messages with a mismatched preview token", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:edit",
            draftType: "molecule",
            blockId: "mol-1",
            smiles: "CCO",
            previewToken: "other-token"
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toBeNull();
  });

  it("accepts molecule inventory hover messages from the active preview iframe", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewInventoryHoverMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:inventory-hover",
            draftType: "molecule",
            blockId: "mol-1",
            smiles: "CCO",
            previewToken
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toEqual({
      type: "molecule",
      blockId: "mol-1",
      smiles: "CCO"
    });
  });

  it("accepts reaction inventory hover messages from the active preview iframe", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewInventoryHoverMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:inventory-hover",
            draftType: "reaction",
            blockId: "rxn-1",
            reactants: ["CCO", "O=O", ""],
            previewToken
          }
        },
        previewWindow,
        true,
        previewToken
      )
    ).toEqual({
      type: "reaction",
      blockId: "rxn-1",
      reactants: ["CCO", "O=O"]
    });
  });

  it("builds preview bridge script without wildcard postMessage origin", () => {
    const script = buildPreviewBridgeScript(previewToken, "http://localhost:2436");

    expect(script).toContain('const targetOrigin = "http://localhost:2436";');
    expect(script).not.toContain('"*"');
  });

  it("uses only chemical preview blocks for synthetic preview block ids", () => {
    const script = buildPreviewBridgeScript(previewToken, "http://localhost:2436");

    expect(script).toContain('const chemicalBlockSelector = ".chemd-block--molecule, .chemd-block--reaction";');
    expect(script).toContain("document.querySelectorAll(chemicalBlockSelector)");
  });

  it("accepts svg click targets inside the edit button", () => {
    const script = buildPreviewBridgeScript(previewToken, "http://localhost:2436");

    expect(script).toContain("if (!(target instanceof Element)) return;");
    expect(script).not.toContain("if (!(target instanceof HTMLElement)) return;");
  });

  it("wires inventory hover bridge and iframe popover state handling", () => {
    const script = buildPreviewBridgeScript(previewToken, "http://localhost:2436");

    expect(script).toContain('const inventoryPopoverClassName = "chemd-inventory-popover";');
    expect(script).toContain('const hoverDelayMs = 360;');
    expect(script).toContain('typeof entry?.displayName === "string" && entry.displayName.trim()');
    expect(script).toContain('type: "chemd:inventory-hover"');
    expect(script).toContain('payload.type !== "chemd:inventory-state"');
    expect(script).toContain("window.parent.postMessage(");
  });

  it("creates scoped fallback token when crypto UUID API is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    const getRandomValues = (array: Uint8Array): Uint8Array => {
      array.fill(0xab);
      return array;
    };

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: () => "",
        getRandomValues
      }
    });

    try {
      expect(createScopedToken("scope")).toBe(`scope-${"ab".repeat(16)}`);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto
      });
    }
  });

  it("throws when no secure crypto source is available", () => {
    const originalCrypto = globalThis.crypto;

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined
    });

    try {
      expect(() => createScopedToken("scope")).toThrow(
        "secure random token generation is unavailable; crypto.randomUUID/getRandomValues is not supported in this runtime"
      );
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto
      });
    }
  });
});

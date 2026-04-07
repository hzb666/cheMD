import { describe, expect, it } from "vitest";

import { buildPreviewBridgeScript } from "../src/features/chem-preview/lib/preview-bridge";
import { readPreviewEditMessage } from "../src/features/preview/lib/read-preview-edit-message";
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
            type: "chemd:edit-molecule",
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
            type: "chemd:edit-molecule",
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
      kind: "molecule",
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
            type: "chemd:edit-molecule",
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
            type: "chemd:edit-molecule",
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
      kind: "molecule",
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
            type: "chemd:edit-reaction",
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
      kind: "reaction",
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
            type: "chemd:edit-molecule",
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
            type: "chemd:edit-molecule",
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

  it("builds preview bridge script without wildcard postMessage origin", () => {
    const script = buildPreviewBridgeScript(previewToken, "http://localhost:2436");

    expect(script).toContain('const targetOrigin = "http://localhost:2436";');
    expect(script).not.toContain('"*"');
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

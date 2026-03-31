import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";
import {
  mapRenderOptionsToAdapterPayload,
  resolveRenderProfile
} from "@chemd/render-profile";

import { renderJson } from "../src";

describe("renderJson", () => {
  it("serializes document, diagnostics, render options, and adapter payload", () => {
    const document = createDocument(
      { id: "exp-json", title: "JSON Test", date: "2026-03-30" },
      {
        children: [createMarkdownNode("Formula: :chem[H2O]", [], [{ type: "inline_chem", raw: ":chem[H2O]", value: "H2O" }])],
        diagnostics: [{ code: "W_TEST", severity: "warning", message: "example warning" }],
        renderSelection: { profileId: "publication-acs" }
      }
    );

    const options = resolveRenderProfile({ profileId: "publication-acs" });
    const adapterPayload = mapRenderOptionsToAdapterPayload(options);
    const json = renderJson(document, options, adapterPayload);
    const payload = JSON.parse(json) as {
      document: { meta: { title: string } };
      diagnostics: Array<{ code: string }>;
      render: {
        profileId: string;
        adapter?: {
          rdkit: { fixedBondLength: number };
        };
      };
    };

    expect(payload.document.meta.title).toBe("JSON Test");
    expect(payload.diagnostics[0]?.code).toBe("W_TEST");
    expect(payload.render.profileId).toBe("publication-acs");
    expect(payload.render.adapter?.rdkit.fixedBondLength).toBe(options.structure.bondLength);
  });
});

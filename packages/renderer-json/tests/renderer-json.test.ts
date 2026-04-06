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

  it("adds normalized reaction condition fields to JSON output", () => {
    const document = createDocument(
      { id: "exp-rxn-json", title: "Reaction JSON Test", date: "2026-04-05" },
      {
        children: [
          {
            type: "reaction",
            id: "rxn-main",
            reactants: ["CCO", "O=O"],
            products: ["CC(=O)O"],
            conditions: ["Cu catalyst", "EtOH", "80 C", "4 h", "N2", "Na2CO3"],
            solvent: "EtOH"
          }
        ]
      }
    );

    const options = resolveRenderProfile({ profileId: "publication-acs" });
    const json = renderJson(document, options);
    const payload = JSON.parse(json) as {
      document: {
        children: Array<{
          type: string;
          normalized_conditions?: {
            solvent?: { raw: string; normalized: string };
            catalyst?: { raw: string; normalized: string };
            reagents?: { raw: string; normalized: string[] };
            atmosphere?: { raw: string; normalized: string };
            temperature?: { raw: string; value: number; unit: string };
            time?: { raw: string; value: number; unit: string };
          };
        }>;
      };
    };

    expect(payload.document.children[0]).toMatchObject({
      type: "reaction",
      normalized_conditions: {
        solvent: {
          raw: "EtOH",
          normalized: "ethanol"
        },
        catalyst: {
          raw: "Cu catalyst",
          normalized: "Cu catalyst"
        },
        reagents: {
          raw: "Na2CO3",
          normalized: ["Na2CO3"]
        },
        atmosphere: {
          raw: "N2",
          normalized: "nitrogen"
        },
        temperature: {
          raw: "80 C",
          value: 80,
          unit: "C"
        },
        time: {
          raw: "4 h",
          value: 4,
          unit: "h"
        }
      }
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  buildReactionRenderErrorMarkup,
  injectEditButtons,
  loadHydratedMoleculeEntry,
  loadHydratedReactionEntry,
  parseMoleculeEntries,
  parseReactionEntries,
  replaceMoleculeFieldValues,
  replaceMoleculeGraphics,
  replaceReactionFieldValues,
  replaceReactionGraphics
} from "../src/features/chem-preview/hooks/useRenderedPreview";

describe("useRenderedPreview helpers", () => {
  it("parses molecule block ids and smiles for backend hydration", () => {
    const html = `<section class="chemd-block chemd-block--molecule" data-node-id="mol-1" data-smiles="CCO">
      <div class="chemd-graphic"><svg>fallback</svg></div>
    </section>`;

    expect(parseMoleculeEntries(html)).toEqual([
      {
        blockId: "mol-1",
        smiles: "CCO"
      }
    ]);
  });

  it("injects edit buttons into reaction blocks", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1"><h2>Reaction</h2></section>`;

    const next = injectEditButtons(html);

    expect(next).toContain('data-action="edit-chem"');
    expect(next).toContain('aria-label="Edit chemistry"');
    expect(next).toContain("<svg");
  });

  it("parses reaction fields needed for backend hydration", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1" data-reactants="[&quot;CCO&quot;,&quot;O=O&quot;]" data-products="[&quot;CC(=O)O&quot;]" data-conditions="[&quot;air&quot;,&quot;80 C&quot;]">
      <div class="chemd-graphic"><svg>fallback</svg></div>
    </section>`;

    expect(parseReactionEntries(html)).toEqual([
      {
        blockId: "rxn-1",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        conditions: ["air", "80 C"]
      }
    ]);
  });

  it("parses reaction entries even when one side is omitted", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-open" data-products="[&quot;CC(=O)O&quot;]" data-conditions="[&quot;air&quot;]">
      <div class="chemd-graphic"><svg>fallback</svg></div>
    </section>`;

    expect(parseReactionEntries(html)).toEqual([
      {
        blockId: "rxn-open",
        reactants: [],
        products: ["CC(=O)O"],
        conditions: ["air"]
      }
    ]);
  });

  it("hydrates molecule render payload from cached structure drafts when available", async () => {
    const fetchMock = async () =>
      ({
        ok: true,
        json: async () => ({
          found: true,
          draft: {
            type: "molecule",
            smiles: "CCO",
            molfile: "normalized-molfile"
          }
        })
      }) as Response;

    await expect(
      loadHydratedMoleculeEntry(
        {
          blockId: "mol-1",
          smiles: "CCO"
        },
        {
          documentId: "doc-1",
          sessionId: "session-1",
          fetchImpl: fetchMock as typeof fetch
        }
      )
    ).resolves.toEqual({
      smiles: "CCO",
      molfile: "normalized-molfile"
    });
  });

  it("hydrates reaction render payload from cached reaction drafts when available", async () => {
    const fetchMock = async () =>
      ({
        ok: true,
        json: async () => ({
          found: true,
          draft: {
            type: "reaction",
            reactants: ["N2", "H2"],
            products: ["NH3"],
            conditions: ["Fe", "300 C"]
          }
        })
      }) as Response;

    await expect(
      loadHydratedReactionEntry(
        {
          blockId: "rxn-1",
          reactants: ["CCO"],
          products: ["CC(=O)O"],
          conditions: ["air"]
        },
        {
          documentId: "doc-1",
          sessionId: "session-1",
          fetchImpl: fetchMock as typeof fetch
        }
      )
    ).resolves.toEqual({
      reactants: ["N2", "H2"],
      products: ["NH3"],
      conditions: ["Fe", "300 C"]
    });
  });

  it("falls back to the preview reaction when the cached draft is not a reaction", async () => {
    const fetchMock = async () =>
      ({
        ok: true,
        json: async () => ({
          found: true,
          draft: {
            type: "molecule",
            smiles: "CCO"
          }
        })
      }) as Response;

    await expect(
      loadHydratedReactionEntry(
        {
          blockId: "rxn-1",
          reactants: ["CCO"],
          products: ["CC(=O)O"],
          conditions: ["air"]
        },
        {
          documentId: "doc-1",
          sessionId: "session-1",
          fetchImpl: fetchMock as typeof fetch
        }
      )
    ).resolves.toEqual({
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air"]
    });
  });

  it("replaces reaction graphics with backend svg output", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1">
      <div class="chemd-graphic"><svg>fallback</svg></div>
    </section>`;

    const next = replaceReactionGraphics(html, ["<svg>backend</svg>"]);

    expect(next).toContain("<svg>backend</svg>");
    expect(next).not.toContain("<svg>fallback</svg>");
  });

  it("replaces molecule graphics when loading placeholders include data attributes", () => {
    const html = `<section class="chemd-block chemd-block--molecule" data-node-id="mol-1">
      <div class="chemd-graphic" data-chem-render-state="loading" data-chem-kind="molecule"><svg>fallback</svg></div>
    </section>`;

    const next = replaceMoleculeGraphics(html, ["<svg>backend-molecule</svg>"]);

    expect(next).toContain("<svg>backend-molecule</svg>");
    expect(next).not.toContain("<svg>fallback</svg>");
  });

  it("replaces reaction graphics when loading placeholders include data attributes", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1">
      <div class="chemd-graphic" data-chem-render-state="loading" data-chem-kind="reaction"><svg>fallback</svg></div>
    </section>`;

    const next = replaceReactionGraphics(html, ["<svg>backend-reaction</svg>"]);

    expect(next).toContain("<svg>backend-reaction</svg>");
    expect(next).not.toContain("<svg>fallback</svg>");
  });

  it("builds escaped reaction render error markup for preview replacement", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1">
      <div class="chemd-graphic" data-chem-render-state="loading" data-chem-kind="reaction"><svg>fallback</svg></div>
    </section>`;

    const next = replaceReactionGraphics(
      html,
      [buildReactionRenderErrorMarkup(`Reaction render failed: <bad "input">`)]
    );

    expect(next).toContain('class="chemd-render-error"');
    expect(next).toContain("Reaction render failed: &lt;bad &quot;input&quot;&gt;");
    expect(next).not.toContain("<svg>fallback</svg>");
  });

  it("replaces molecule field text with hydrated SMILES", () => {
    const html = `<section class="chemd-block chemd-block--molecule" data-node-id="mol-1" data-smiles="64-17-5">
      <div class="chemd-graphic"><svg>fallback</svg></div>
    </section>`;

    const next = replaceMoleculeFieldValues(
      replaceMoleculeGraphics(html, ["<svg>backend</svg>"]),
      ["CCO"]
    );

    expect(next).toContain('data-smiles="CCO"');
    expect(next).not.toContain('data-smiles="64-17-5"');
  });

  it("replaces reaction field text with hydrated participant SMILES", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1" data-reactants="[&quot;64-17-5&quot;,&quot;O=O&quot;]" data-products="[&quot;67-56-1&quot;]" data-conditions="[&quot;air&quot;]">
      <div class="chemd-graphic"><svg>fallback</svg></div>
    </section>`;

    const next = replaceReactionFieldValues(
      replaceReactionGraphics(html, ["<svg>backend</svg>"]),
      [
        {
          reactants: ["CCO", "O=O"],
          products: ["CO"],
          conditions: ["air"]
        }
      ]
    );

    expect(next).toContain('data-reactants="[&quot;CCO&quot;,&quot;O=O&quot;]"');
    expect(next).toContain('data-products="[&quot;CO&quot;]"');
    expect(next).toContain('data-conditions="[&quot;air&quot;]"');
    expect(next).not.toContain('data-reactants="[&quot;64-17-5&quot;,&quot;O=O&quot;]"');
    expect(next).not.toContain('data-products="[&quot;67-56-1&quot;]"');
  });
});

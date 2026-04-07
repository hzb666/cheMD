import { describe, expect, it } from "vitest";

import {
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
    const html = `<section class="chemd-block chemd-block--molecule" data-node-id="mol-1">
      <div class="chemd-graphic"><svg>fallback</svg></div>
      <dl>
        <div class="chemd-field"><dt>SMILES</dt><dd>CCO</dd></div>
      </dl>
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
    expect(next).toContain("Edit chemistry");
  });

  it("parses reaction fields needed for backend hydration", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1">
      <div class="chemd-graphic"><svg>fallback</svg></div>
      <dl>
        <div class="chemd-field"><dt>Reactants</dt><dd>CCO | O=O</dd></div>
        <div class="chemd-field"><dt>Products</dt><dd>CC(=O)O</dd></div>
        <div class="chemd-field"><dt>Conditions</dt><dd>air | 80 C</dd></div>
      </dl>
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
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-open">
      <div class="chemd-graphic"><svg>fallback</svg></div>
      <dl>
        <div class="chemd-field"><dt>Products</dt><dd>CC(=O)O</dd></div>
        <div class="chemd-field"><dt>Conditions</dt><dd>air</dd></div>
      </dl>
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

  it("replaces molecule field text with hydrated SMILES", () => {
    const html = `<section class="chemd-block chemd-block--molecule" data-node-id="mol-1">
      <div class="chemd-graphic"><svg>fallback</svg></div>
      <dl>
        <div class="chemd-field"><dt>SMILES</dt><dd>64-17-5</dd></div>
      </dl>
    </section>`;

    const next = replaceMoleculeFieldValues(
      replaceMoleculeGraphics(html, ["<svg>backend</svg>"]),
      ["CCO"]
    );

    expect(next).toContain("<dd>CCO</dd>");
    expect(next).not.toContain("<dd>64-17-5</dd>");
  });

  it("replaces reaction field text with hydrated participant SMILES", () => {
    const html = `<section class="chemd-block chemd-block--reaction" data-node-id="rxn-1">
      <div class="chemd-graphic"><svg>fallback</svg></div>
      <dl>
        <div class="chemd-field"><dt>Reactants</dt><dd>64-17-5 | O=O</dd></div>
        <div class="chemd-field"><dt>Products</dt><dd>67-56-1</dd></div>
        <div class="chemd-field"><dt>Conditions</dt><dd>air</dd></div>
      </dl>
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

    expect(next).toContain("<dd>CCO | O=O</dd>");
    expect(next).toContain("<dd>CO</dd>");
    expect(next).not.toContain("<dd>64-17-5 | O=O</dd>");
    expect(next).not.toContain("<dd>67-56-1</dd>");
  });
});

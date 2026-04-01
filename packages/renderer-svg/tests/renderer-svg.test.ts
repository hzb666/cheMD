import { describe, expect, it } from "vitest";

import {
  mapRenderOptionsToAdapterPayload,
  resolveRenderProfile
} from "@chemd/render-profile";

import { renderMoleculeSvg, renderReactionSvg } from "../src";

describe("renderMoleculeSvg", () => {
  it("renders molecule placeholder svg with structure metadata", () => {
    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-ethanol",
        name: "Ethanol",
        smiles: "CCO",
        formula: "C2H6O"
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("<svg");
    expect(svg).toContain("chemd-svg chemd-svg--molecule");
    expect(svg).toContain("Ethanol");
    expect(svg).toContain("CCO");
    expect(svg).toContain("viewBox=");
  });

  it("uses adapter payload values when provided", () => {
    const options = resolveRenderProfile({ profileId: "eln-default" });
    const adapterPayload = mapRenderOptionsToAdapterPayload(resolveRenderProfile({ profileId: "slides-large" }));
    adapterPayload.rdkit.transparentBackground = true;

    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-acetone",
        name: "Acetone",
        smiles: "CC(=O)C"
      },
      options,
      adapterPayload
    );

    expect(svg).toContain('font-size="17"');
    expect(svg).not.toContain('<rect width="320" height="160"');
  });

  it("renders linear smiles as sketch segments for simple molecules", () => {
    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-acetic-acid",
        smiles: "CC=O"
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-molecule-sketch");
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("renders branch and ring smiles with sketch edges", () => {
    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-branch-ring",
        smiles: "C(C)O1CC1"
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-molecule-sketch");
    expect(svg.match(/stroke-linecap="round"/g)?.length ?? 0).toBeGreaterThan(2);
  });

  it("preserves aromatic lowercase atom semantics instead of uppercasing", () => {
    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-aromatic",
        smiles: "c1ccccc1"
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain(">c<");
    expect(svg).not.toContain(">C<");
  });

  it("supports multi-digit ring closure notation with percent syntax", () => {
    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-ring-percent",
        smiles: "C%12CCCCC%12"
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-molecule-sketch");
    expect(svg).not.toContain("chemd-molecule-placeholder");
  });

  it("sanitizes untrusted adapter payload fields", () => {
    const options = resolveRenderProfile({ profileId: "eln-default" });
    const unsafePayload = {
      rdkit: {
        fixedBondLength: 1,
        bondLineWidth: Number.NaN,
        multipleBondOffset: -1,
        hashSpacing: 99,
        fixedFontSize: Number.POSITIVE_INFINITY,
        atomLabelPadding: 999,
        monochrome: "yes",
        backgroundColor: "\"/><script>alert(1)</script>",
        reactionArrowLength: 9999,
        reactionComponentGap: 12,
        reactionPlusGap: 200,
        showConditionsBelowArrow: "no",
        imageFormat: "gif",
        margin: -100,
        dpi: 1,
        transparentBackground: "true"
      }
    } as unknown as ReturnType<typeof mapRenderOptionsToAdapterPayload>;

    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-unsafe",
        smiles: "CCO"
      },
      options,
      unsafePayload
    );

    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain("<script>");
    expect(svg).toContain('font-size="14"');
  });

  it("uses explanatory fallback text for unsupported smiles syntax", () => {
    const svg = renderMoleculeSvg(
      {
        type: "molecule",
        id: "mol-unsupported",
        smiles: "C[C@H](N)C(=O)O"
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-molecule-fallback");
    expect(svg).toContain("SMILES fallback:");
    expect(svg).toContain("Unsupported token in SMILES subset");
  });
});

describe("renderReactionSvg", () => {
  it("renders reaction placeholder svg with arrow and conditions", () => {
    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-main",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        temperature: "200 °C",
        time: "4 h",
        solvent: "EtOH"
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("<svg");
    expect(svg).toContain("chemd-svg chemd-svg--reaction");
    expect(svg).toContain("CCO");
    expect(svg).toContain("CC(=O)O");
    expect(svg).toContain("200 °C");
    expect(svg).toContain("marker-end=");
  });

  it("falls back to readable placeholders when reactants or products are empty arrays", () => {
    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-empty",
        reactants: [],
        products: []
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("No reactants");
    expect(svg).toContain("No products");
  });

  it("applies adapter arrow and spacing values", () => {
    const options = resolveRenderProfile({ profileId: "eln-default" });
    const adapterPayload = mapRenderOptionsToAdapterPayload(resolveRenderProfile({ profileId: "slides-large" }));

    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-adapter",
        reactants: ["A"],
        products: ["B"]
      },
      options,
      adapterPayload
    );

    expect(svg).toContain('x2="324"');
    expect(svg).toContain('x="344" y="86"');
  });

  it("clamps adapter arrow length to render-profile max range", () => {
    const options = resolveRenderProfile({ profileId: "eln-default" });
    const adapterPayload = mapRenderOptionsToAdapterPayload(options);
    adapterPayload.rdkit.reactionArrowLength = 240;

    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-arrow-clamped",
        reactants: ["A"],
        products: ["B"]
      },
      options,
      adapterPayload
    );

    expect(svg).toContain('x2="440"');
  });

  it("renders reaction side fragments with plus separators for multiple species", () => {
    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-fragments",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"]
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-reaction-side--reactants");
    expect(svg).toContain("chemd-reaction-side__plus");
    expect(svg).toContain("chemd-reaction-side-label--products");
  });

  it("renders branch fragments on reaction sides when smiles are sketchable", () => {
    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-branch",
        reactants: ["C(C)O", "O=O"],
        products: ["CC(=O)O"]
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-reaction-fragment--sketch");
    expect(svg).toContain("chemd-reaction-side--reactants");
  });

  it("keeps aromatic fragments as lowercase labels in reaction sketches", () => {
    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-aromatic",
        reactants: ["c1ccccc1", "O=O"],
        products: ["c1ccccc1O"]
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-reaction-fragment--sketch");
    expect(svg).toContain(">c<");
  });

  it("keeps unsupported reaction fragments readable with diagnostic title", () => {
    const svg = renderReactionSvg(
      {
        type: "reaction",
        id: "rxn-unsupported-fragment",
        reactants: ["C[C@H](N)C(=O)O"],
        products: ["CC(=O)O"]
      },
      resolveRenderProfile({ profileId: "eln-default" })
    );

    expect(svg).toContain("chemd-reaction-fragment--text");
    expect(svg).toContain("<title>Unsupported token in SMILES subset</title>");
  });
});

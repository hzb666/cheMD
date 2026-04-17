import { describe, expect, it } from "vitest";

import { replaceChemBlock } from "../src/features/chem-editor/lib/replace-chem-block";

describe("replaceChemBlock", () => {
  it("replaces a reaction block with a molecule block when the saved result downgrades", () => {
    const source = [
      ":::chemd #rxn-main",
      "reac: CCO | O=O",
      "prod: CC(=O)O",
      "conditions: air | 80 C",
      ":::"
    ].join("\n");

    expect(
      replaceChemBlock(source, "rxn-main", {
        kind: "molecule",
        smiles: "CCO",
        molfile: "mock-molfile"
      })
    ).toBe([
      ":::chemd #rxn-main",
      "smiles: CCO",
      ":::"
    ].join("\n"));
  });

  it("replaces a molecule block with a reaction block when the saved result upgrades", () => {
    const source = [
      ":::chemd #mol-main",
      "smiles: CCO",
      ":::"
    ].join("\n");

    expect(
      replaceChemBlock(source, "mol-main", {
        kind: "reaction",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        conditions: ["air", "80 C"]
      })
    ).toBe([
      ":::chemd #mol-main",
      "reac: CCO | O=O",
      "prod: CC(=O)O",
      "conditions: air | 80 C",
      ":::"
    ].join("\n"));
  });

  it("only replaces the matching block id and leaves other blocks unchanged", () => {
    const source = [
      ":::chemd #mol-a",
      "smiles: CCO",
      ":::",
      "",
      ":::chemd #rxn-main",
      "reac: N2",
      "prod: NH3",
      ":::"
    ].join("\n");

    expect(
      replaceChemBlock(source, "rxn-main", {
        kind: "molecule",
        smiles: "NH3"
      })
    ).toBe([
      ":::chemd #mol-a",
      "smiles: CCO",
      ":::",
      "",
      ":::chemd #rxn-main",
      "smiles: NH3",
      ":::"
    ].join("\n"));
  });
});

describe("replaceChemBlock metadata preservation", () => {
  it("preserves supported molecule metadata when saving a molecule block", () => {
    const source = [
      ":::chemd #mol-main",
      "name: Ethanol",
      "formula: C2H6O",
      "caption: Solvent",
      "smiles: CCO",
      ":::"
    ].join("\n");

    expect(
      replaceChemBlock(source, "mol-main", {
        kind: "molecule",
        smiles: "CCN"
      })
    ).toBe([
      ":::chemd #mol-main",
      "smiles: CCN",
      "name: Ethanol",
      "formula: C2H6O",
      "caption: Solvent",
      ":::"
    ].join("\n"));
  });

  it("preserves supported reaction metadata when saving a reaction block", () => {
    const source = [
      ":::chemd #rxn-main",
      "name: Haber",
      "temperature: 450 C",
      "pressure: 200 atm",
      "reac: N2",
      "prod: NH3",
      ":::"
    ].join("\n");

    expect(
      replaceChemBlock(source, "rxn-main", {
        kind: "reaction",
        reactants: ["N2", "H2"],
        products: ["NH3"],
        conditions: ["Fe"]
      })
    ).toBe([
      ":::chemd #rxn-main",
      "reac: N2 | H2",
      "prod: NH3",
      "conditions: Fe",
      "name: Haber",
      "temperature: 450 C",
      "pressure: 200 atm",
      ":::"
    ].join("\n"));
  });
});

describe("replaceChemBlock missing or unterminated targets", () => {
  it("returns null when the target block no longer exists", () => {
    const source = [
      ":::chemd #mol-a",
      "smiles: CCO",
      ":::"
    ].join("\n");

    expect(
      replaceChemBlock(source, "missing-block", {
        kind: "molecule",
        smiles: "CCN"
      })
    ).toBeNull();
  });

  it("replaces an unterminated target block through the end of the document", () => {
    const source = [
      ":::chemd #mol-a",
      "smiles: CCO",
      "caption: stale"
    ].join("\n");

    expect(
      replaceChemBlock(source, "mol-a", {
        kind: "molecule",
        smiles: "CCN"
      })
    ).toBe([
      ":::chemd #mol-a",
      "smiles: CCN",
      "caption: stale",
      ":::"
    ].join("\n"));
  });
});

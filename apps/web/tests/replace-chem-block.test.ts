import { describe, expect, it } from "vitest";

import { replaceChemBlock } from "../src/features/chem-editor/lib/replace-chem-block";

describe("replaceChemBlock", () => {
  it("replaces a reaction declaration with a molecule declaration when the saved result downgrades", () => {
    const source = [
      "reaction rxn-main {",
      '  reactants: ["CCO", "O=O"]',
      '  products: ["CC(=O)O"]',
      '  conditions: ["air", "80 C"]',
      "}"
    ].join("\n");

    expect(
      replaceChemBlock(source, "rxn-main", {
        kind: "molecule",
        smiles: "CCO",
        molfile: "mock-molfile"
      })
    ).toBe([
      "molecule rxn-main {",
      '  smiles: "CCO"',
      "}"
    ].join("\n"));
  });

  it("replaces a molecule declaration with a reaction declaration when the saved result upgrades", () => {
    const source = [
      "molecule mol-main {",
      '  smiles: "CCO"',
      "}"
    ].join("\n");

    expect(
      replaceChemBlock(source, "mol-main", {
        kind: "reaction",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        conditions: ["air", "80 C"]
      })
    ).toBe([
      "reaction mol-main {",
      '  reactants: ["CCO", "O=O"]',
      '  products: ["CC(=O)O"]',
      '  conditions: ["air", "80 C"]',
      "}"
    ].join("\n"));
  });

  it("only replaces the matching declaration id and leaves other declarations unchanged", () => {
    const source = [
      "molecule mol-a {",
      '  smiles: "CCO"',
      "}",
      "",
      "reaction rxn-main {",
      '  reactants: ["N2"]',
      '  products: ["NH3"]',
      "}"
    ].join("\n");

    expect(
      replaceChemBlock(source, "rxn-main", {
        kind: "molecule",
        smiles: "NH3"
      })
    ).toBe([
      "molecule mol-a {",
      '  smiles: "CCO"',
      "}",
      "",
      "molecule rxn-main {",
      '  smiles: "NH3"',
      "}"
    ].join("\n"));
  });
});

describe("replaceChemBlock metadata preservation", () => {
  it("preserves supported molecule metadata when saving a molecule declaration", () => {
    const source = [
      "molecule mol-main {",
      '  name: "Ethanol"',
      '  formula: "C2H6O"',
      '  caption: "Solvent"',
      '  smiles: "CCO"',
      "}"
    ].join("\n");

    expect(
      replaceChemBlock(source, "mol-main", {
        kind: "molecule",
        smiles: "CCN"
      })
    ).toBe([
      "molecule mol-main {",
      '  smiles: "CCN"',
      '  name: "Ethanol"',
      '  formula: "C2H6O"',
      '  caption: "Solvent"',
      "}"
    ].join("\n"));
  });

  it("preserves supported reaction metadata when saving a reaction declaration", () => {
    const source = [
      "reaction rxn-main {",
      '  name: "Haber"',
      '  temperature: "450 C"',
      '  pressure: "200 atm"',
      '  reactants: ["N2"]',
      '  products: ["NH3"]',
      "}"
    ].join("\n");

    expect(
      replaceChemBlock(source, "rxn-main", {
        kind: "reaction",
        reactants: ["N2", "H2"],
        products: ["NH3"],
        conditions: ["Fe"]
      })
    ).toBe([
      "reaction rxn-main {",
      '  reactants: ["N2", "H2"]',
      '  products: ["NH3"]',
      '  conditions: ["Fe"]',
      '  name: "Haber"',
      '  temperature: "450 C"',
      '  pressure: "200 atm"',
      "}"
    ].join("\n"));
  });
});

describe("replaceChemBlock missing or unterminated targets", () => {
  it("returns null when the target declaration no longer exists", () => {
    const source = [
      "molecule mol-a {",
      '  smiles: "CCO"',
      "}"
    ].join("\n");

    expect(
      replaceChemBlock(source, "missing-block", {
        kind: "molecule",
        smiles: "CCN"
      })
    ).toBeNull();
  });

  it("replaces an unterminated target declaration through the end of the document", () => {
    const source = [
      "molecule mol-a {",
      '  smiles: "CCO"',
      '  caption: "stale"'
    ].join("\n");

    expect(
      replaceChemBlock(source, "mol-a", {
        kind: "molecule",
        smiles: "CCN"
      })
    ).toBe([
      "molecule mol-a {",
      '  smiles: "CCN"',
      '  caption: "stale"',
      "}"
    ].join("\n"));
  });
});

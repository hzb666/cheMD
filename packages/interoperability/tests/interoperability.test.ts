import { describe, expect, it } from "vitest";

import {
  createAnimlPlaceholderMapping,
  exportMoleculeIdentity,
  exportReactionStructure,
  validateInChIKey
} from "../src/index";

describe("interoperability contract", () => {
  it("validates InChIKey surface format", () => {
    expect(validateInChIKey("LFQSCWFLJHTTHZ-UHFFFAOYSA-N")).toEqual([]);
    expect(validateInChIKey("bad-key")).toEqual([
      expect.objectContaining({
        code: "E_INTEROP_INCHIKEY_FORMAT",
        severity: "error"
      })
    ]);
  });

  it("marks multi-field molecule identity as unverified without a verifier", () => {
    const result = exportMoleculeIdentity({
      smiles: "CCO",
      inchi: "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3",
      inchikey: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N"
    });

    expect(result.verified).toBe(false);
    expect(result.value?.standard_fields).toEqual(["smiles", "inchi", "inchikey"]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "W_INTEROP_UNVERIFIED_IDENTITY" })
    ]));
  });

  it("validates RXN SMILES shape", () => {
    expect(exportReactionStructure({ rxn_smiles: "CCO.O=O>>CC=O.O" }).diagnostics).toEqual([]);
    expect(exportReactionStructure({ rxn_smiles: "CCO" }).diagnostics).toEqual([
      expect.objectContaining({ code: "E_INTEROP_RXN_SMILES_PARSE" })
    ]);
  });

  it("keeps AnIML export as an explicit non-compliant placeholder", () => {
    const result = createAnimlPlaceholderMapping({
      analysis_type: "hplc",
      artifact_refs: ["art-hplc"]
    });

    expect(result.value).toMatchObject({
      profile: "animl-like-placeholder",
      compliant: false
    });
    expect(result.verified).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "W_INTEROP_PLACEHOLDER_NOT_COMPLIANT" })
    ]));
  });
});

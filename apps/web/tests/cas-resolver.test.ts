import { describe, expect, it, vi } from "vitest";

import {
  CasResolutionError,
  classifyCasNumber,
  lookupPubChemSmilesByCas,
  resolveChemicalNotation,
  resolveChemicalNotationList
} from "../src/server/chem/cas-resolver";

describe("cas-resolver", () => {
  it("classifies a valid CAS number", () => {
    expect(classifyCasNumber(" 64-17-5 ")).toEqual({
      kind: "cas",
      cas: "64-17-5"
    });
  });

  it("rejects CAS-like values with an invalid checksum", () => {
    expect(classifyCasNumber("64-17-6")).toEqual({
      kind: "invalid",
      message: 'CAS "64-17-6" has an invalid checksum.'
    });
  });

  it("leaves non-CAS chemistry text untouched", async () => {
    const fetchMock = vi.fn();

    await expect(
      resolveChemicalNotation("CCO", { fetchImpl: fetchMock as unknown as typeof fetch })
    ).resolves.toBe("CCO");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks up SMILES from PubChem for valid CAS numbers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        PropertyTable: {
          Properties: [
            {
              CID: 702,
              SMILES: "CCO"
            }
          ]
        }
      })
    });

    await expect(
      lookupPubChemSmilesByCas("64-17-5", { fetchImpl: fetchMock as unknown as typeof fetch })
    ).resolves.toBe("CCO");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/compound/xref/RN/64-17-5/property/SMILES/JSON");
  });

  it("raises a validation error before calling PubChem for invalid CAS input", async () => {
    const fetchMock = vi.fn();

    await expect(
      resolveChemicalNotation("64-17-6", { fetchImpl: fetchMock as unknown as typeof fetch })
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CAS"
    } satisfies Partial<CasResolutionError>);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves CAS entries inside reaction participant lists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        PropertyTable: {
          Properties: [
            {
              CID: 702,
              SMILES: "CCO"
            }
          ]
        }
      })
    });

    await expect(
      resolveChemicalNotationList(["64-17-5", "O=O"], {
        fetchImpl: fetchMock as unknown as typeof fetch
      })
    ).resolves.toEqual(["CCO", "O=O"]);
  });
});

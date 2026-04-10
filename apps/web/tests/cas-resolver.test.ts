import { describe, expect, it, vi } from "vitest";

import {
  CasResolutionError,
  classifyCasNumber,
  lookupPubChemCasByNotation,
  lookupPubChemNotationMetadata,
  lookupPubChemPreferredNameByNotation,
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

  it("looks up CAS directly from PubChem smiles synonyms for complex structures", async () => {
    const smiles = "CC1=CC=C(C=C1)S(=O)(=O)OS(=O)(=O)C2=CC=C(C=C2)C";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        InformationList: {
          Information: [
            {
              CID: 77773,
              Synonym: ["p-Toluenesulfonic anhydride", "4124-41-8"]
            }
          ]
        }
      })
    });

    await expect(
      lookupPubChemCasByNotation(smiles, { fetchImpl: fetchMock as unknown as typeof fetch })
    ).resolves.toBe("4124-41-8");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/compound/smiles/");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/synonyms/JSON");
  });

  it("reads CAS and preferred name from a single PubChem synonyms response", async () => {
    const smiles = "mock-single-fetch-smiles";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        InformationList: {
          Information: [
            {
              CID: 77773,
              Synonym: ["p-Toluenesulfonic anhydride", "4124-41-8"]
            }
          ]
        }
      })
    });

    await expect(
      lookupPubChemNotationMetadata(smiles, { fetchImpl: fetchMock as unknown as typeof fetch })
    ).resolves.toEqual({
      casNumber: "4124-41-8",
      preferredName: "p-Toluenesulfonic anhydride"
    });

    await expect(
      lookupPubChemPreferredNameByNotation(smiles, { fetchImpl: fetchMock as unknown as typeof fetch })
    ).resolves.toBe("p-Toluenesulfonic anhydride");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not permanently cache null CAS misses", async () => {
    const notation = "mock-complex-smiles-retry";
    const missFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => null
    });
    const hitFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        InformationList: {
          Information: [
            {
              CID: 77773,
              Synonym: ["p-Toluenesulfonic anhydride", "4124-41-8"]
            }
          ]
        }
      })
    });

    await expect(
      lookupPubChemCasByNotation(notation, { fetchImpl: missFetchMock as unknown as typeof fetch })
    ).resolves.toBeNull();

    await expect(
      lookupPubChemCasByNotation(notation, { fetchImpl: hitFetchMock as unknown as typeof fetch })
    ).resolves.toBe("4124-41-8");

    expect(hitFetchMock).toHaveBeenCalled();
  });
});

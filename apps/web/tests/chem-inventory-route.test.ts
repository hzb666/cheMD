import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupPubChemNotationMetadataMock = vi.fn();
const fetchLabStorageInventoryByCasMock = vi.fn();

vi.mock("../src/server/chem/cas-resolver", () => ({
  lookupPubChemNotationMetadata: (...args: unknown[]) => lookupPubChemNotationMetadataMock(...args)
}));

vi.mock("../src/server/chem/lab-storage-client", () => ({
  fetchLabStorageInventoryByCas: (...args: unknown[]) => fetchLabStorageInventoryByCasMock(...args)
}));

beforeEach(() => {
  lookupPubChemNotationMetadataMock.mockReset();
  fetchLabStorageInventoryByCasMock.mockReset();
  vi.resetModules();
});

describe("POST /api/chem/inventory molecule lookups", () => {
  it("looks up molecule inventory through PubChem CAS resolution", async () => {
    lookupPubChemNotationMetadataMock.mockResolvedValueOnce({
      casNumber: "64-17-5",
      preferredName: "ethanol"
    });
    fetchLabStorageInventoryByCasMock.mockResolvedValueOnce({
      cas_number: "64-17-5",
      exists_in_inventory: true,
      total_remaining: 100,
      in_stock_count: 1,
      borrowed_count: 0,
      items: [
        {
          id: 1,
          name: "Ethanol",
          storage_location: "Shelf A",
          remaining_quantity: 100,
          unit: "mL",
          status: "available",
          borrower_id: null
        }
      ]
    });

    const { POST } = await import("../src/app/api/chem/inventory/route");
    const response = await POST(
      new Request("http://localhost/api/chem/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "molecule",
          smiles: "CCO"
        })
      })
    );
    const payload = (await response.json()) as {
      type?: string;
      item?: {
        notation?: string;
        displayName?: string;
        casNumber?: string | null;
        inventory?: {
          cas_number?: string;
          total_remaining?: number;
          in_stock_count?: number;
        } | null;
      };
    };

    expect(response.status).toBe(200);
    expect(lookupPubChemNotationMetadataMock).toHaveBeenCalledWith("CCO");
    expect(fetchLabStorageInventoryByCasMock).toHaveBeenCalledWith("64-17-5");
    expect(payload).toEqual({
      type: "molecule",
      item: {
        notation: "CCO",
        displayName: "Ethanol",
        casNumber: "64-17-5",
        inventory: {
          cas_number: "64-17-5",
          exists_in_inventory: true,
          total_remaining: 100,
          in_stock_count: 1,
          borrowed_count: 0,
          items: [
            {
              id: 1,
              name: "Ethanol",
              storage_location: "Shelf A",
              remaining_quantity: 100,
              unit: "mL",
              status: "available",
              borrower_id: null
            }
          ]
        }
      }
    });
  });

  it("falls back to PubChem preferred name when inventory item has no local name", async () => {
    lookupPubChemNotationMetadataMock.mockResolvedValueOnce({
      casNumber: "7732-18-5",
      preferredName: "Water"
    });
    fetchLabStorageInventoryByCasMock.mockResolvedValueOnce({
      cas_number: "7732-18-5",
      exists_in_inventory: true,
      total_remaining: 500,
      in_stock_count: 2,
      borrowed_count: 0,
      items: [
        {
          id: 1,
          name: "",
          storage_location: "Shelf B",
          remaining_quantity: 500,
          unit: "mL",
          status: "available",
          borrower_id: null
        }
      ]
    });

    const { POST } = await import("../src/app/api/chem/inventory/route");
    const response = await POST(
      new Request("http://localhost/api/chem/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "molecule",
          smiles: "O"
        })
      })
    );
    const payload = (await response.json()) as {
      item?: {
        displayName?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.item?.displayName).toBe("Water");
  });
});

describe("POST /api/chem/inventory reaction lookups", () => {
  it("deduplicates repeated reaction reactants before hitting upstream lookups", async () => {
    lookupPubChemNotationMetadataMock.mockImplementation(async (notation: string) => {
      if (notation === "CCO") {
        return {
          casNumber: "64-17-5",
          preferredName: "ethanol"
        };
      }
      if (notation === "O=O") {
        return {
          casNumber: "7782-44-7",
          preferredName: "oxygen"
        };
      }
      return {
        casNumber: null,
        preferredName: null
      };
    });
    fetchLabStorageInventoryByCasMock.mockImplementation(async (casNumber: string) => ({
      cas_number: casNumber,
      exists_in_inventory: casNumber === "64-17-5",
      total_remaining: casNumber === "64-17-5" ? 250 : 0,
      in_stock_count: casNumber === "64-17-5" ? 2 : 0,
      borrowed_count: 0,
      items: []
    }));

    const { POST } = await import("../src/app/api/chem/inventory/route");
    const response = await POST(
      new Request("http://localhost/api/chem/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "reaction",
          reactants: ["CCO", "CCO", "O=O"]
        })
      })
    );
    const payload = (await response.json()) as {
      type?: string;
      items?: Array<{
        reactant?: string;
        displayName?: string;
        casNumber?: string | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.type).toBe("reaction");
    expect(payload.items).toEqual([
      {
        reactant: "CCO",
        notation: "CCO",
        displayName: "ethanol",
        casNumber: "64-17-5",
        inventory: {
          cas_number: "64-17-5",
          exists_in_inventory: true,
          total_remaining: 250,
          in_stock_count: 2,
          borrowed_count: 0,
          items: []
        }
      },
      {
        reactant: "CCO",
        notation: "CCO",
        displayName: "ethanol",
        casNumber: "64-17-5",
        inventory: {
          cas_number: "64-17-5",
          exists_in_inventory: true,
          total_remaining: 250,
          in_stock_count: 2,
          borrowed_count: 0,
          items: []
        }
      },
      {
        reactant: "O=O",
        notation: "O=O",
        displayName: "oxygen",
        casNumber: "7782-44-7",
        inventory: {
          cas_number: "7782-44-7",
          exists_in_inventory: false,
          total_remaining: 0,
          in_stock_count: 0,
          borrowed_count: 0,
          items: []
        }
      }
    ]);
    expect(lookupPubChemNotationMetadataMock).toHaveBeenCalledTimes(2);
    expect(fetchLabStorageInventoryByCasMock).toHaveBeenCalledTimes(2);
  });
});

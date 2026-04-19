import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("lab-storage-client", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.LAB_STORAGE_USERNAME = "public";
    process.env.LAB_STORAGE_PASSWORD = "jiaogroup";
    process.env.LAB_STORAGE_BASE_URL = "https://lab.example/api";
    process.env.LAB_STORAGE_DEVICE_ID = "chemd-test";
    process.env.LAB_STORAGE_DEVICE_NAME = "chemd test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("falls back to inventory-only endpoints when /inventory/cas returns 500", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "set-cookie" ? "access_token=test-token; Max-Age=3600; Path=/" : null
        }
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 9084,
              name: "4-甲苯磺酸酐",
              storage_location: null,
              remaining_quantity: 25,
              unit: "g",
              status: "borrowed",
              borrower_id: 1
            },
            {
              id: 1615,
              name: "4-甲苯磺酸酐",
              storage_location: "1-6-2-2",
              remaining_quantity: null,
              unit: null,
              status: "in_stock",
              borrower_id: null
            }
          ],
          total: 2
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          cas_number: "4124-41-8",
          total_remaining: 25
        })
      });

    const { fetchLabStorageInventoryByCas } = await import("../src/server/chem/lab-storage-client");
    const payload = await fetchLabStorageInventoryByCas("4124-41-8", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/inventory/cas/4124-41-8");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/inventory?cas_filter=4124-41-8&limit=100");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("/inventory/cas/4124-41-8/total");
    expect(payload).toEqual({
      cas_number: "4124-41-8",
      exists_in_inventory: true,
      total_remaining: 25,
      in_stock_count: 1,
      borrowed_count: 1,
      items: [
        {
          id: 9084,
          name: "4-甲苯磺酸酐",
          storage_location: null,
          remaining_quantity: 25,
          unit: "g",
          status: "borrowed",
          borrower_id: 1
        },
        {
          id: 1615,
          name: "4-甲苯磺酸酐",
          storage_location: "1-6-2-2",
          remaining_quantity: null,
          unit: null,
          status: "in_stock",
          borrower_id: null
        }
      ]
    });
  });

  it("reports ready when login succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "set-cookie" ? "access_token=test-token; Max-Age=3600; Path=/" : null
      }
    });

    const { readLabStorageConnectionStatus } = await import("../src/server/chem/lab-storage-client");
    const status = await readLabStorageConnectionStatus({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(status).toEqual({ status: "ready" });
  });

  it("reports disconnect when credentials are missing", async () => {
    delete process.env.LAB_STORAGE_USERNAME;
    delete process.env.LAB_STORAGE_PASSWORD;

    const { readLabStorageConnectionStatus } = await import("../src/server/chem/lab-storage-client");
    const status = await readLabStorageConnectionStatus({
      fetchImpl: vi.fn() as unknown as typeof fetch
    });

    expect(status).toEqual({ status: "disconnect" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const readLabStorageConnectionStatusMock = vi.fn();

vi.mock("../src/server/chem/lab-storage-client", () => ({
  readLabStorageConnectionStatus: () => readLabStorageConnectionStatusMock()
}));

beforeEach(() => {
  readLabStorageConnectionStatusMock.mockReset();
  vi.resetModules();
});

describe("GET /api/chem/inventory/status", () => {
  it("returns the LabStorageManager connection status", async () => {
    readLabStorageConnectionStatusMock.mockResolvedValueOnce({ status: "ready" });

    const { GET } = await import("../src/app/api/chem/inventory/status/route");
    const response = await GET();
    const payload = (await response.json()) as { status?: string };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ status: "ready" });
  });
});

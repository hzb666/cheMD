import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMoleculeNotationMock = vi.fn();
const renderReactionNotationMock = vi.fn();

vi.mock("../src/server/chem/render-save-service", () => ({
  renderMoleculeNotation: (...args: unknown[]) => renderMoleculeNotationMock(...args),
  renderReactionNotation: (...args: unknown[]) => renderReactionNotationMock(...args)
}));

describe("POST /api/chem/render", () => {
  beforeEach(() => {
    renderMoleculeNotationMock.mockReset();
    renderReactionNotationMock.mockReset();
    vi.resetModules();
  });

  it("accepts intentionally empty reaction sides for placeholder rendering", async () => {
    renderReactionNotationMock.mockResolvedValueOnce({
      body: {
        type: "reaction",
        reaction: {
          reactants: [],
          products: ["CO"],
          conditions: []
        }
      }
    });

    const { POST } = await import("../src/app/api/chem/render/route");
    const response = await POST(new Request("http://localhost/api/chem/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "reaction",
        reactants: [],
        products: ["CO"],
        conditions: []
      })
    }));

    expect(response.status).toBe(200);
    expect(renderReactionNotationMock).toHaveBeenCalledWith({
      type: "reaction",
      reactants: [],
      products: ["CO"],
      conditions: [],
      renderOptions: undefined
    });
  });
});

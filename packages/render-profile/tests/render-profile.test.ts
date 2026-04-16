import { describe, expect, it } from "vitest";

import { resolveRenderProfileWithDiagnostics } from "../src/index";

describe("render profile resolution", () => {
  it("resolves built-in profiles and clamps invalid overrides", () => {
    const result = resolveRenderProfileWithDiagnostics({
      profileId: "publication-acs",
      overrides: {
        "export.dpi": 1
      }
    });

    expect(result.options.profileId).toBe("publication-acs");
    expect(result.options.export.dpi).toBe(72);
    expect(result.diagnostics[0]?.code).toBe("E_INVALID_RENDER_PROFILE_VALUE");
  });
});

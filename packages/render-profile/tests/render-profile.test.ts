import { describe, expect, it } from "vitest";

import { RENDER_OVERRIDE_FIELD_ALLOWLIST } from "@chemd/core";

import {
  BUILTIN_RENDER_PROFILES,
  mapRenderOptionsToAdapterPayload,
  RENDER_PROFILE_NUMERIC_SCHEMA,
  resolveRenderProfile,
  resolveRenderProfileWithDiagnostics
} from "../src";

describe("resolveRenderProfile", () => {
  it("returns the default profile when no selection is provided", () => {
    const profile = resolveRenderProfile();

    expect(profile.profileId).toBe("eln-default");
    expect(profile.structure.bondLength).toBe(28);
  });

  it("resolves a named profile through the built-in registry", () => {
    const profile = resolveRenderProfile({ profileId: "publication-acs" });

    expect(profile.profileId).toBe("publication-acs");
    expect(profile.structure.monochrome).toBe(true);
    expect(profile.export.dpi).toBe(600);
  });

  it("applies validated render overrides after profile resolution", () => {
    const resolution = resolveRenderProfileWithDiagnostics({
      profileId: "publication-acs",
      overrides: {
        "structure.bondLineWidth": 2.1,
        "reaction.showConditionsBelowArrow": false,
        "export.margin": 16
      }
    });

    expect(resolution.options.profileId).toBe("publication-acs");
    expect(resolution.options.structure.bondLineWidth).toBe(2.1);
    expect(resolution.options.reaction.showConditionsBelowArrow).toBe(false);
    expect(resolution.options.export.margin).toBe(16);
    expect(resolution.diagnostics).toEqual([]);
  });

  it("reports invalid and unknown render overrides without breaking resolution", () => {
    const resolution = resolveRenderProfileWithDiagnostics({
      profileId: "publication-acs",
      overrides: {
        "structure.bondLineWidth": -1,
        "export.imageFormat": "jpg",
        "structure.unknownField": 1,
        invalidPath: true
      }
    });

    expect(resolution.options.profileId).toBe("publication-acs");
    expect(resolution.options.structure.bondLineWidth).toBe(1.4);
    expect(resolution.options.export.imageFormat).toBe("svg");
    expect(resolution.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          severity: "error",
          message: expect.stringContaining("structure.bondLineWidth")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          severity: "error",
          message: expect.stringContaining("export.imageFormat")
        }),
        expect.objectContaining({
          code: "W_UNKNOWN_RENDER_PROFILE_FIELD",
          severity: "warning",
          message: expect.stringContaining("structure.unknownField")
        }),
        expect.objectContaining({
          code: "W_UNKNOWN_RENDER_PROFILE_FIELD",
          severity: "warning",
          message: expect.stringContaining("invalidPath")
        })
      ])
    );
  });

  it("falls back to the default profile and reports an unknown profile warning", () => {
    const resolution = resolveRenderProfileWithDiagnostics({ profileId: "unknown-profile" });

    expect(resolution.options.profileId).toBe("eln-default");
    expect(resolution.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_UNKNOWN_RENDER_PROFILE",
        severity: "warning"
      })
    );
  });

  it("falls back to the default profile and reports inheritance cycles", () => {
    const resolution = resolveRenderProfileWithDiagnostics(
      { profileId: "publication-acs" },
      {
        ...BUILTIN_RENDER_PROFILES,
        base: {
          ...BUILTIN_RENDER_PROFILES.base,
          extends: "publication-acs"
        }
      }
    );

    expect(resolution.options.profileId).toBe("eln-default");
    expect(resolution.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PROFILE_CYCLE",
        severity: "error"
      })
    );
  });

  it("warns on unknown render profile fields and keeps valid values", () => {
    const resolution = resolveRenderProfileWithDiagnostics(
      { profileId: "custom-profile" },
      {
        ...BUILTIN_RENDER_PROFILES,
        "custom-profile": {
          extends: "eln-default",
          structure: {
            ...BUILTIN_RENDER_PROFILES["eln-default"].structure,
            bondLength: 30,
            strangeField: 123
          },
          reaction: BUILTIN_RENDER_PROFILES["eln-default"].reaction,
          export: BUILTIN_RENDER_PROFILES["eln-default"].export,
          extraSection: true
        } as unknown as (typeof BUILTIN_RENDER_PROFILES)[string]
      }
    );

    expect(resolution.options.profileId).toBe("custom-profile");
    expect(resolution.options.structure.bondLength).toBe(30);
    expect(resolution.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_UNKNOWN_RENDER_PROFILE_FIELD",
        severity: "warning",
        message: expect.stringContaining("strangeField")
      })
    );
    expect(resolution.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_UNKNOWN_RENDER_PROFILE_FIELD",
        severity: "warning",
        message: expect.stringContaining("extraSection")
      })
    );
  });

  it("reports invalid render profile values and falls back to inherited values", () => {
    const resolution = resolveRenderProfileWithDiagnostics(
      { profileId: "custom-profile" },
      {
        ...BUILTIN_RENDER_PROFILES,
        "custom-profile": {
          extends: "eln-default",
          structure: {
            ...BUILTIN_RENDER_PROFILES["eln-default"].structure,
            bondLength: -1,
            backgroundColor: "white"
          },
          reaction: {
            ...BUILTIN_RENDER_PROFILES["eln-default"].reaction,
            arrowLength: 0
          },
          export: {
            ...BUILTIN_RENDER_PROFILES["eln-default"].export,
            imageFormat: "jpg",
            dpi: -300
          }
        } as unknown as (typeof BUILTIN_RENDER_PROFILES)[string]
      }
    );

    expect(resolution.options.profileId).toBe("custom-profile");
    expect(resolution.options.structure.bondLength).toBe(28);
    expect(resolution.options.structure.backgroundColor).toBe("#ffffff");
    expect(resolution.options.reaction.arrowLength).toBe(48);
    expect(resolution.options.export.imageFormat).toBe("svg");
    expect(resolution.options.export.dpi).toBe(300);
    expect(resolution.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          severity: "error",
          message: expect.stringContaining("structure.bondLength")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          severity: "error",
          message: expect.stringContaining("structure.backgroundColor")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          severity: "error",
          message: expect.stringContaining("reaction.arrowLength")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          severity: "error",
          message: expect.stringContaining("export.imageFormat")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          severity: "error",
          message: expect.stringContaining("export.dpi")
        })
      ])
    );
  });
  it("resolves the built-in slides-large profile", () => {
    const profile = resolveRenderProfile({ profileId: "slides-large" });

    expect(profile.profileId).toBe("slides-large");
    expect(profile.structure.fontSize).toBe(14);
    expect(profile.reaction.arrowLength).toBe(64);
    expect(profile.export.margin).toBe(10);
  });

  it("reports invalid profile metadata types and keeps valid values", () => {
    const resolution = resolveRenderProfileWithDiagnostics(
      { profileId: "custom-profile" },
      {
        ...BUILTIN_RENDER_PROFILES,
        "custom-profile": {
          extends: "eln-default",
          description: 123,
          structure: {
            bondLength: 30
          }
        } as unknown as (typeof BUILTIN_RENDER_PROFILES)[string]
      }
    );

    expect(resolution.options.profileId).toBe("custom-profile");
    expect(resolution.options.structure.bondLength).toBe(30);
    expect(resolution.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_INVALID_RENDER_PROFILE_VALUE",
        severity: "error",
        message: expect.stringContaining("custom-profile.description")
      })
    );
  });

  it("maps generic render options to rdkit adapter payload", () => {
    const options = resolveRenderProfile({
      profileId: "publication-acs",
      overrides: {
        "structure.bondLength": 36,
        "reaction.componentGap": 24,
        "export.transparentBackground": true
      }
    });

    const payload = mapRenderOptionsToAdapterPayload(options);

    expect(payload.rdkit.fixedBondLength).toBe(36);
    expect(payload.rdkit.bondLineWidth).toBe(options.structure.bondLineWidth);
    expect(payload.rdkit.reactionComponentGap).toBe(24);
    expect(payload.rdkit.transparentBackground).toBe(true);
  });
  it("clamps out-of-range numeric values and reports diagnostics", () => {
    const resolution = resolveRenderProfileWithDiagnostics({
      profileId: "eln-default",
      overrides: {
        "structure.bondLength": 120,
        "structure.hashSpacing": 0.1,
        "export.dpi": 10000
      }
    });

    expect(resolution.options.structure.bondLength).toBe(80);
    expect(resolution.options.structure.hashSpacing).toBe(0.5);
    expect(resolution.options.export.dpi).toBe(2400);
    expect(resolution.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          message: expect.stringContaining("structure.bondLength")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          message: expect.stringContaining("structure.hashSpacing")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          message: expect.stringContaining("export.dpi")
        })
      ])
    );
  });

  it("enforces cross-field constraints after overrides", () => {
    const resolution = resolveRenderProfileWithDiagnostics({
      profileId: "eln-default",
      overrides: {
        "structure.bondLength": 4,
        "structure.bondLineWidth": 5,
        "reaction.componentGap": 8,
        "reaction.plusGap": 20
      }
    });

    expect(resolution.options.structure.bondLength).toBe(4);
    expect(resolution.options.structure.bondLineWidth).toBe(1);
    expect(resolution.options.reaction.componentGap).toBe(8);
    expect(resolution.options.reaction.plusGap).toBe(8);
    expect(resolution.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          message: expect.stringContaining("structure.bondLineWidth")
        }),
        expect.objectContaining({
          code: "E_INVALID_RENDER_PROFILE_VALUE",
          message: expect.stringContaining("reaction.plusGap")
        })
      ])
    );
  });
  it("enforces png dpi minimum for adapter compatibility", () => {
    const resolution = resolveRenderProfileWithDiagnostics({
      profileId: "eln-default",
      overrides: {
        "export.imageFormat": "png",
        "export.dpi": 72
      }
    });

    expect(resolution.options.export.imageFormat).toBe("png");
    expect(resolution.options.export.dpi).toBe(150);
    expect(resolution.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_INVALID_RENDER_PROFILE_VALUE",
        message: expect.stringContaining("PNG export requires dpi >= 150")
      })
    );
  });

  it("enforces atom label padding relative to font size", () => {
    const resolution = resolveRenderProfileWithDiagnostics({
      profileId: "eln-default",
      overrides: {
        "structure.fontSize": 6,
        "structure.atomLabelPadding": 4
      }
    });

    expect(resolution.options.structure.fontSize).toBe(6);
    expect(resolution.options.structure.atomLabelPadding).toBe(3);
    expect(resolution.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_INVALID_RENDER_PROFILE_VALUE",
        message: expect.stringContaining("structure.atomLabelPadding")
      })
    );
  });

  it("exposes numeric schema with explicit units and ranges", () => {
    expect(RENDER_PROFILE_NUMERIC_SCHEMA["structure.bondLength"]).toEqual({
      min: 4,
      max: 80,
      unit: "px"
    });
    expect(RENDER_PROFILE_NUMERIC_SCHEMA["structure.multipleBondOffset"]).toEqual({
      min: 0,
      max: 0.5,
      unit: "ratio"
    });
    expect(RENDER_PROFILE_NUMERIC_SCHEMA["export.dpi"]).toEqual({
      min: 72,
      max: 2400,
      unit: "dpi"
    });
  });
  it("keeps override allowlist synced with render option fields", () => {
    const profile = BUILTIN_RENDER_PROFILES["eln-default"];

    expect([...RENDER_OVERRIDE_FIELD_ALLOWLIST.structure].sort()).toEqual(
      Object.keys(profile.structure).sort()
    );
    expect([...RENDER_OVERRIDE_FIELD_ALLOWLIST.reaction].sort()).toEqual(
      Object.keys(profile.reaction).sort()
    );
    expect([...RENDER_OVERRIDE_FIELD_ALLOWLIST.export].sort()).toEqual(
      Object.keys(profile.export).sort()
    );
  });
});







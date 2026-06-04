import { describe, expect, it } from "vitest";

import { STEP_FAMILY_SCHEMAS } from "../src/index";

describe("step family schemas", () => {
  it("declares standard effects for every step family", () => {
    expect(STEP_FAMILY_SCHEMAS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "charge", effects: expect.arrayContaining(["creates_mixture"]) }),
        expect.objectContaining({ family: "heat", effects: expect.arrayContaining(["changes_temperature"]) }),
        expect.objectContaining({ family: "quench", effects: expect.arrayContaining(["quenches_reaction"]) }),
        expect.objectContaining({ family: "extract", effects: expect.arrayContaining(["creates_biphasic_system"]) }),
        expect.objectContaining({ family: "analyze", effects: expect.arrayContaining(["produces_analysis"]) })
      ])
    );
    expect(STEP_FAMILY_SCHEMAS.every((schema) => schema.effects && schema.effects.length > 0)).toBe(true);
  });
});

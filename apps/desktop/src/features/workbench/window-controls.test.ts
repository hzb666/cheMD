import { describe, expect, it } from "vitest";

import { buildReferenceSnapLayoutAnchor } from "./window-controls";

describe("buildReferenceSnapLayoutAnchor", () => {
  it("anchors the maximize overlay to the viewport right edge", () => {
    const anchor = buildReferenceSnapLayoutAnchor(
      { top: 6, right: 1412, width: 40, height: 34 },
      1440,
      1.25,
    );

    expect(anchor).toEqual({
      top: 6,
      right: 28,
      width: 40,
      height: 34,
      scaleFactor: 1.25,
    });
  });

  it("clamps right offset when a transient layout reports beyond the viewport", () => {
    const anchor = buildReferenceSnapLayoutAnchor(
      { top: 0, right: 1210, width: 40, height: 34 },
      1200,
      1,
    );

    expect(anchor.right).toBe(0);
  });
});

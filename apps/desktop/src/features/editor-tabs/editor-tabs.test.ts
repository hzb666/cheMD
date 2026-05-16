import { describe, expect, it } from "vitest";

import { buildTabDragPreviewOrder, clampTabDragDelta } from "./editor-tabs.drag";

const rects = {
  a: { left: 0, right: 100, width: 100, center: 50 },
  b: { left: 108, right: 208, width: 100, center: 158 },
  c: { left: 216, right: 316, width: 100, center: 266 },
  d: { left: 324, right: 424, width: 100, center: 374 },
};
const slotWidth = 108;

describe("buildTabDragPreviewOrder", () => {
  it("moves a dragged tab after its neighbor after half a slot of rightward drag", () => {
    expect(buildTabDragPreviewOrder(["a", "b", "c", "d"], "a", slotWidth / 2, slotWidth))
      .toEqual(["b", "a", "c", "d"]);
  });

  it("moves a dragged tab two slots after one and a half slots of rightward drag", () => {
    expect(buildTabDragPreviewOrder(["a", "b", "c", "d"], "a", slotWidth * 1.5, slotWidth))
      .toEqual(["b", "c", "a", "d"]);
  });

  it("moves a dragged tab before its neighbor after half a slot of leftward drag", () => {
    expect(buildTabDragPreviewOrder(["a", "b", "c", "d"], "b", -slotWidth / 2, slotWidth))
      .toEqual(["b", "a", "c", "d"]);
  });

  it("moves a dragged tab two slots after one and a half slots of leftward drag", () => {
    expect(buildTabDragPreviewOrder(["a", "b", "c", "d"], "d", -slotWidth * 1.5, slotWidth))
      .toEqual(["a", "d", "b", "c"]);
  });

  it("does not reorder before half a slot of drag", () => {
    expect(buildTabDragPreviewOrder(["a", "b", "c", "d"], "b", slotWidth / 2 - 1, slotWidth))
      .toEqual(["a", "b", "c", "d"]);
  });

  it("clamps reorder at the ends of the strip", () => {
    expect(buildTabDragPreviewOrder(["a", "b", "c", "d"], "b", slotWidth * 8, slotWidth))
      .toEqual(["a", "c", "d", "b"]);
    expect(buildTabDragPreviewOrder(["a", "b", "c", "d"], "c", -slotWidth * 8, slotWidth))
      .toEqual(["c", "a", "b", "d"]);
  });
});

describe("clampTabDragDelta", () => {
  it("keeps the dragged tab inside the tab bar drag bounds", () => {
    expect(clampTabDragDelta(-180, rects.b, { minLeft: rects.a.left, maxRight: 360 }))
      .toBe(-108);
    expect(clampTabDragDelta(240, rects.c, { minLeft: rects.a.left, maxRight: 360 }))
      .toBe(44);
  });
});

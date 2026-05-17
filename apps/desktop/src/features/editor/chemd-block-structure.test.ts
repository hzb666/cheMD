import { describe, expect, it } from "vitest";

import {
  findChemdBlockPathAtLine,
  flattenChemdBlockStructure,
  parseChemdBlockStructure,
} from "./chemd-block-structure";

const nestedSource = `---
id: exp-sticky
---

:::procedure #proc-main
ref: rxn-main
:::step s-heat
family: heat
duration: 4 h
:::
:::

:::observation #obs-main
:::event e-color
type: color_change
:::
:::
`;

const inlineSource = `:::procedure #proc-main
ref: rxn-main
step: charge | id=s-charge
temperature: 20 C
step: heat | id=s-heat
duration: 4 h
:::

:::observation #obs-main
event: color_change | id=e-color
color: yellow
:::
`;

describe("Chemd editor block structure", () => {
  it("builds nested block ranges from Chemd fence declarations", () => {
    const roots = parseChemdBlockStructure(nestedSource);

    expect(roots).toMatchObject([
      {
        blockType: "procedure",
        label: "procedure proc-main",
        startLine: 5,
        endLine: 11,
        children: [{
          blockType: "step",
          label: "step s-heat",
          startLine: 7,
          endLine: 10
        }]
      },
      {
        blockType: "observation",
        label: "observation obs-main",
        startLine: 13,
        endLine: 17,
        children: [{
          blockType: "event",
          label: "event e-color",
          startLine: 14,
          endLine: 16
        }]
      }
    ]);
  });

  it("finds the parent and child breadcrumb path for the cursor line", () => {
    const path = findChemdBlockPathAtLine(parseChemdBlockStructure(nestedSource), 8)
      .map((node) => node.label);

    expect(path).toEqual(["procedure proc-main", "step s-heat"]);
  });

  it("flattens nested blocks in source order for folding ranges", () => {
    const ranges = flattenChemdBlockStructure(parseChemdBlockStructure(nestedSource))
      .map((node) => [node.label, node.startLine, node.endLine]);

    expect(ranges).toEqual([
      ["procedure proc-main", 5, 11],
      ["step s-heat", 7, 10],
      ["observation obs-main", 13, 17],
      ["event e-color", 14, 16],
    ]);
  });

  it("treats line-style step and event declarations as nested children", () => {
    const roots = parseChemdBlockStructure(inlineSource);

    expect(roots).toMatchObject([
      {
        label: "procedure proc-main",
        children: [
          { label: "step s-charge", startLine: 3, endLine: 4 },
          { label: "step s-heat", startLine: 5, endLine: 6 },
        ],
      },
      {
        label: "observation obs-main",
        children: [
          { label: "event e-color", startLine: 10, endLine: 11 },
        ],
      },
    ]);
    expect(findChemdBlockPathAtLine(roots, 6).map((node) => node.label))
      .toEqual(["procedure proc-main", "step s-heat"]);
  });
});

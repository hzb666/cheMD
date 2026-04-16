import { describe, expect, it } from "vitest";

import { parseChemd } from "../src/index";

describe("parseChemd", () => {
  it("parses frontmatter and surface-preserving structured blocks", () => {
    const document = parseChemd(`---
id: exp-parser
title: Parser test
date: 2026-04-17
---

:::chemd #rxn-main
reactants: a | b
products: c
:::

:::procedure #proc-main
1. 冷却至 0 °C。
:::
`);

    expect(document.meta.id).toBe("exp-parser");
    expect(document.children.some((node) => node.type === "reaction")).toBe(true);
    expect(document.children.some((node) => node.type === "procedure")).toBe(true);
  });
});

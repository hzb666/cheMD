import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";

import { resolveChemd } from "../src/index";

describe("resolveChemd", () => {
  it("resolves object references without dropping author text", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-resolver
title: Resolver test
date: 2026-04-17
primary_result: res-main
---

Yield: @res-main.yield

:::result #res-main
status: partial
yield: 42 %
:::
`));
    const markdown = document.children.find((node) => node.type === "markdown");

    expect(document.diagnostics).toEqual([]);
    expect(markdown?.type === "markdown" ? markdown.references[0]?.resolution?.value : undefined).toBe("42 %");
  });
});

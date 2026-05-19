import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

interface FixtureCase {
  file: string;
  expectedNodeTypes: string[];
}

const fixtureCases: FixtureCase[] = [
  {
    file: "block-chemd.chemd",
    expectedNodeTypes: ["molecule", "reaction", "result", "analysis"]
  },
  {
    file: "block-result-analysis.chemd",
    expectedNodeTypes: ["result", "analysis"]
  },
  {
    file: "block-procedure-observation.chemd",
    expectedNodeTypes: ["procedure", "step", "observation", "event"]
  },
  {
    file: "block-sample-artifact.chemd",
    expectedNodeTypes: ["sample", "artifact"]
  },
  {
    file: "block-condition-varies.chemd",
    expectedNodeTypes: ["condition_varies"]
  },
  {
    file: "template-and-use.chemd",
    expectedNodeTypes: ["template", "markdown"]
  },
  {
    file: "layout-col.chemd",
    expectedNodeTypes: ["col", "analysis"]
  }
];

const readFixture = (file: string): string =>
  readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8");

const collectNodeTypes = (nodes: ReturnType<typeof compileChemd>["document"]["children"]): string[] =>
  nodes.flatMap((node) => {
    if (node.type === "col") {
      return [node.type, ...collectNodeTypes(node.children)];
    }

    if (node.type === "template") {
      return [node.type, ...collectNodeTypes(node.body)];
    }

    if (node.type === "procedure") {
      return [node.type, ...(node.steps ?? []).map((step) => step.type)];
    }

    if (node.type === "observation") {
      return [node.type, ...(node.events ?? []).map((event) => event.type)];
    }

    return [node.type];
  });

describe("language fixture matrix", () => {
  it.each(fixtureCases)("$file compiles without diagnostics", ({ file, expectedNodeTypes }) => {
    const result = compileChemd(readFixture(file), { strictChemdKind: true });
    const nodeTypes = collectNodeTypes(result.document.children);

    expect(result.diagnostics, file).toEqual([]);
    for (const type of expectedNodeTypes) {
      expect(nodeTypes, file).toContain(type);
    }
  });
});

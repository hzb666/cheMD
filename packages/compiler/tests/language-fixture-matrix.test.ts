import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

interface FixtureCase {
  file: string;
  expectedDeclarationKinds: string[];
}

const fixtureCases: FixtureCase[] = [
  {
    file: "program-golden-suzuki-screen.chemd",
    expectedDeclarationKinds: ["molecule", "reaction", "result", "procedure"]
  },
  {
    file: "program-route.chemd",
    expectedDeclarationKinds: ["reaction"]
  },
  {
    file: "program-doc-comments.chemd",
    expectedDeclarationKinds: ["molecule", "reaction", "analysis"]
  },
  {
    file: "program-agent-audit.chemd",
    expectedDeclarationKinds: ["reaction", "result", "agent_run"]
  }
];

const readFixture = (file: string): string =>
  readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8");

describe("program fixture matrix", () => {
  it.each(fixtureCases)("$file compiles without error diagnostics", ({ file, expectedDeclarationKinds }) => {
    const result = compileChemd(readFixture(file));
    const declarationKinds = result.program.declarations.map((node) => node.kind);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), file).toEqual([]);
    for (const kind of expectedDeclarationKinds) {
      expect(declarationKinds, file).toContain(kind);
    }
  });
});

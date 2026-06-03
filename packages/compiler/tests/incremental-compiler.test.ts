import { describe, expect, it } from "vitest";

import { createChemdIncrementalCompiler } from "../src/index";

const baseSource = `module exp_incremental

meta {
  id: "exp-incremental"
  title: "Incremental"
  date: "2026-06-04"
}

reaction rxn_1 {
  name: "first"
}
`;

describe("createChemdIncrementalCompiler", () => {
  it("reuses core compile results when source and options are unchanged", () => {
    const compiler = createChemdIncrementalCompiler();
    const first = compiler.compile(baseSource);
    const second = compiler.compile(baseSource);

    expect(first.cache.status).toBe("cold");
    expect(second.cache.status).toBe("hit");
    expect(second.result).toBe(first.result);
    expect(second.cache.revision).toBe(first.cache.revision);
    expect(second.cache.sourceHash).toBe(first.cache.sourceHash);
    expect(second.cache.optionsHash).toBe(first.cache.optionsHash);
  });

  it("recompiles when source content changes", () => {
    const compiler = createChemdIncrementalCompiler();
    const first = compiler.compile(baseSource);
    const changed = compiler.compile(baseSource.replace("first", "second"));

    expect(changed.cache.status).toBe("changed");
    expect(changed.result).not.toBe(first.result);
    expect(changed.cache.revision).toBe(first.cache.revision + 1);
    expect(changed.cache.sourceHash).not.toBe(first.cache.sourceHash);
  });

  it("recompiles when compile options change", () => {
    const compiler = createChemdIncrementalCompiler();
    const first = compiler.compile(baseSource);
    const changed = compiler.compile(baseSource, { procedureMode: "explicit" });

    expect(changed.cache.status).toBe("changed");
    expect(changed.result).not.toBe(first.result);
    expect(changed.cache.revision).toBe(first.cache.revision + 1);
    expect(changed.cache.optionsHash).not.toBe(first.cache.optionsHash);
  });
});

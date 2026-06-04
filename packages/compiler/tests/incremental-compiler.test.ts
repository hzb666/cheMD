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
  it("reuses cached compile metadata when source and options are unchanged", () => {
    const compiler = createChemdIncrementalCompiler();
    const first = compiler.compile(baseSource);
    const second = compiler.compile(baseSource);

    expect(first.cache.status).toBe("cold");
    expect(second.cache.status).toBe("hit");
    expect(second.result).not.toBe(first.result);
    expect(second.result.program.meta.id).toBe(first.result.program.meta.id);
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

  it("protects stored cache metadata from returned object mutation", () => {
    const compiler = createChemdIncrementalCompiler();
    const first = compiler.compile(baseSource);
    first.cache.revision = 999;
    compiler.snapshot().entries[0]!.revision = 777;

    const second = compiler.compile(baseSource);

    expect(second.cache.status).toBe("hit");
    expect(second.cache.revision).toBe(1);
    expect(compiler.snapshot().entries[0]!.revision).toBe(1);
  });

  it("protects cached compile results from returned object mutation", () => {
    const compiler = createChemdIncrementalCompiler();
    const first = compiler.compile(baseSource);
    first.result.diagnostics.push({
      code: "E_TEST_CACHE_POISON",
      severity: "error",
      message: "mutated cached result"
    });
    first.result.program.meta.title = "mutated";

    const second = compiler.compile(baseSource);

    expect(second.cache.status).toBe("hit");
    expect(second.result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "E_TEST_CACHE_POISON"
    }));
    expect(second.result.program.meta.title).toBe("Incremental");
  });
});

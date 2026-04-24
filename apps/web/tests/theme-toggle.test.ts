import { describe, expect, it } from "vitest";

import { resolveNextTheme } from "../src/components/theme-toggle";

describe("resolveNextTheme", () => {
  it("toggles to dark unless the resolved theme is already dark", () => {
    expect(resolveNextTheme("light")).toBe("dark");
    expect(resolveNextTheme("system")).toBe("dark");
    expect(resolveNextTheme(undefined)).toBe("dark");
    expect(resolveNextTheme("dark")).toBe("light");
  });
});

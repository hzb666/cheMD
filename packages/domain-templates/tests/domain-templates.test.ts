import { describe, expect, it } from "vitest";

import { compileChemd } from "@chemd/compiler";

import {
  getDomainTemplate,
  listDomainTemplates,
  renderDomainTemplate
} from "../src/index";

describe("domain template catalog", () => {
  it("lists stable template summaries", () => {
    expect(listDomainTemplates()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "organic-synthesis/suzuki-screen",
        category: "organic-synthesis"
      }),
      expect.objectContaining({
        id: "analytical/hplc-purity",
        category: "analytical"
      })
    ]));
  });

  it("renders template source by id", () => {
    expect(renderDomainTemplate("organic-synthesis/suzuki-screen")).toContain(":::condition-varies");
    expect(getDomainTemplate("missing/template")).toBeUndefined();
  });

  it("keeps every catalog template valid under the current language contract", () => {
    for (const template of listDomainTemplates()) {
      const result = compileChemd(renderDomainTemplate(template.id));

      expect(
        result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
        template.id
      ).toEqual([]);
    }
  });
});

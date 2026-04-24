import { describe, expect, it } from "vitest";

import {
  buildReactionEntityIdFromReference,
  buildScopedReferenceId,
  createDocument,
  createMarkdownNode,
  parseReferenceId
} from "../src/index";

describe("core AST helpers", () => {
  it("creates a document with stable metadata and children", () => {
    const document = createDocument(
      { id: "exp-core", title: "Core test", date: "2026-04-17" },
      { children: [createMarkdownNode("hello")] }
    );

    expect(document.meta.id).toBe("exp-core");
    expect(document.children[0]).toMatchObject({
      type: "markdown",
      value: "hello"
    });
  });

  it("parses scoped references and derives stable reaction entity ids", () => {
    expect(parseReferenceId("@route-doc#rxn-step-07")).toEqual({
      lookupKey: "route-doc#rxn-step-07",
      documentId: "route-doc",
      objectId: "rxn-step-07",
      baseObjectLookupKey: "route-doc#rxn-step-07"
    });
    expect(parseReferenceId("@route-doc#cv-main.var1")).toEqual({
      lookupKey: "route-doc#cv-main.var1",
      documentId: "route-doc",
      objectId: "cv-main",
      childId: "var1",
      baseObjectLookupKey: "route-doc#cv-main"
    });
    expect(buildScopedReferenceId("route-doc", "rxn-step-07")).toBe("route-doc#rxn-step-07");
    expect(buildReactionEntityIdFromReference("route-doc#rxn-step-07")).toBe("rxn::route-doc::rxn-step-07");
  });
});

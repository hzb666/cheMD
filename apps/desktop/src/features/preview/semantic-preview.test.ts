import { describe, expect, it } from "vitest";

import {
  compileChemdForEditor,
  type ChemdLanguageCompileOutput
} from "@chemd/language-service";

import { buildSemanticPreview } from "./semantic-preview";

const source = `---
id: exp-semantic-preview
title: Semantic Preview
date: 2026-05-13
---

:::chemd #mol-a
kind: molecule
name: Ethanol
smiles: CCO
:::

:::result #res-a
status: success
yield: 82%
:::
`;

const compileOk = (): ChemdLanguageCompileOutput =>
  compileChemdForEditor({
    source,
    documentUri: "file:///D:/labs/alpha/semantic-preview.chemd.md",
    options: { strictChemdKind: true }
  });

describe("buildSemanticPreview", () => {
  it("builds typed semantic preview HTML for successful compile output", () => {
    const preview = buildSemanticPreview(compileOk());

    expect(preview.state).toBe("ready");
    expect(preview.reason).toBeNull();
    expect(preview.tree?.schemaVersion).toBe("chemd.renderable-node.v1");
    expect(preview.tree?.root.label).toBe("Semantic Preview");
    expect(preview.html).toContain("chemd-renderable-tree");
    expect(preview.html).toContain('data-chemd-node-kind="molecule"');
    expect(preview.html).toContain('data-chemd-render-state="ready"');
  });

  it("returns fallback preview for failed compile output", () => {
    const failedOutput = compileChemdForEditor(
      { source: "not used" },
      {
        compileChemd: () => {
          throw new Error("compiler exploded");
        },
        now: () => new Date("2026-05-13T10:00:00.000Z")
      }
    );

    const preview = buildSemanticPreview(failedOutput);

    expect(preview.state).toBe("fallback");
    expect(preview.reason).toBe("compile_failed");
    expect(preview.html).toBe("");
    expect(preview.tree).toBeNull();
    expect(preview.message).toContain("compiler exploded");
    expect(preview.diagnostics).toHaveLength(1);
    expect(preview.diagnostics[0]?.message).toContain("compiler exploded");
  });

  it("returns fallback preview when compile success has no document", () => {
    const output = compileOk();
    expect(output.status).toBe("ok");
    const missingDocumentOutput = {
      ...output,
      result: {
        ...(output.status === "ok" ? output.result : {}),
        document: undefined
      }
    } as unknown as ChemdLanguageCompileOutput;

    const preview = buildSemanticPreview(missingDocumentOutput);

    expect(preview.state).toBe("fallback");
    expect(preview.reason).toBe("missing_document");
    expect(preview.html).toBe("");
    expect(preview.tree).toBeNull();
    expect(preview.message).toContain("document");
    expect(preview.diagnostics).toEqual(output.diagnostics);
  });

  it("keeps diagnostics and stable message on ready preview", () => {
    const output = compileOk();
    const preview = buildSemanticPreview(output);

    expect(preview.message).toBe("Semantic preview is ready.");
    expect(preview.diagnostics).toEqual(output.diagnostics);
    expect(preview.compiledAt).toBe(output.compiledAt);
    expect(preview.documentUri).toBe(output.documentUri);
  });
});

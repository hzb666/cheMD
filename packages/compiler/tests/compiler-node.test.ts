import { describe, expect, it } from "vitest";

import { compileChemdToDocx, createPandocDocxArgs, exportMarkdownToDocx } from "../src/node";

describe("compiler node docx export", () => {
  it("builds pandoc args for markdown to docx conversion", () => {
    const args = createPandocDocxArgs("C:\\tmp\\input.md", "C:\\tmp\\out.docx", {
      referenceDocPath: "C:\\tmp\\template.docx",
      extraArgs: ["--standalone"]
    });

    expect(args).toEqual([
      "C:\\tmp\\input.md",
      "--from",
      "gfm",
      "--to",
      "docx",
      "--output",
      "C:\\tmp\\out.docx",
      "--reference-doc",
      "C:\\tmp\\template.docx",
      "--standalone"
    ]);
  });

  it("exports markdown to docx via injected pandoc runner", async () => {
    let observedCommand = "";
    let observedArgs: string[] = [];
    let observedCwd: string | undefined;

    const result = await exportMarkdownToDocx("# Hello", {
      outputPath: "D:\\Code\\chemd\\tmp\\test-export.docx",
      workingDirectory: "D:\\Code\\chemd",
      verifyOutputExists: false,
      runner: async ({ command, args, cwd }) => {
        observedCommand = command;
        observedArgs = args;
        observedCwd = cwd;
      },
      tempDirectory: "D:\\Code\\chemd\\tmp"
    });

    expect(result.outputPath).toBe("D:\\Code\\chemd\\tmp\\test-export.docx");
    expect(observedCommand).toBe("pandoc");
    expect(observedCwd).toBe("D:\\Code\\chemd");
    expect(observedArgs).toContain("--to");
    expect(observedArgs).toContain("docx");
  });

  it("compiles source and produces markdown/docx handoff result", async () => {
    const source = `---
id: exp-node-docx
title: Node DOCX
date: 2026-03-31
---

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: air | 80 C
:::`;

    const result = await compileChemdToDocx(source, {
      outputPath: "D:\\Code\\chemd\\tmp\\node-docx.docx",
      verifyOutputExists: false,
      runner: async () => {},
      tempDirectory: "D:\\Code\\chemd\\tmp"
    });

    expect(result.compileResult.document.meta.id).toBe("exp-node-docx");
    expect(result.markdown).toContain("# Node DOCX");
    expect(result.markdown).toContain("### Reaction `rxn-main`");
    expect(result.markdown).toContain("- Conditions: air | 80 C");
    expect(result.outputPath).toContain(".docx");
  });

  it("throws clear error when pandoc binary is missing", async () => {
    await expect(
      exportMarkdownToDocx("# Hello", {
        outputPath: "D:\\Code\\chemd\\tmp\\missing-pandoc.docx",
        pandocPath: "D:\\non-existent\\pandoc.exe",
        tempDirectory: "D:\\Code\\chemd\\tmp"
      })
    ).rejects.toThrow("Pandoc binary not found");
  });

  it("times out slow pandoc executions", async () => {
    await expect(
      exportMarkdownToDocx("# Hello", {
        outputPath: "D:\\Code\\chemd\\tmp\\slow-pandoc.docx",
        tempDirectory: "D:\\Code\\chemd\\tmp",
        executionTimeoutMs: 25,
        runner: async () => {
          await new Promise(() => undefined);
        }
      })
    ).rejects.toThrow("Pandoc execution timed out after 25ms");
  }, 1000);
});



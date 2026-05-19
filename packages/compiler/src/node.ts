import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";

import { renderDocxMarkdown } from "@chemd/renderer-docx";

import { compileChemd, type CompileResult, type CompileOptions } from "./index";

export interface PandocRunnerContext {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
}

export type PandocRunner = (context: PandocRunnerContext) => Promise<void>;

export interface ExportDocxOptions {
  outputPath: string;
  pandocPath?: string;
  workingDirectory?: string;
  referenceDocPath?: string;
  extraArgs?: string[];
  tempDirectory?: string;
  verifyOutputExists?: boolean;
  executionTimeoutMs?: number;
  runner?: PandocRunner;
}

export interface CompileChemdToDocxOptions extends ExportDocxOptions {
  compileOptions?: CompileOptions;
}

export interface CompileChemdToDocxResult {
  compileResult: CompileResult;
  markdown: string;
  outputPath: string;
  command: string;
  args: string[];
}

const assertDocxPath = (outputPath: string): void => {
  if (!outputPath || extname(outputPath).toLowerCase() !== ".docx") {
    throw new Error(`DOCX output path must end with ".docx", got: ${outputPath || "(empty)"}`);
  }
};

export const createPandocDocxArgs = (
  markdownInputPath: string,
  outputPath: string,
  options: Pick<ExportDocxOptions, "referenceDocPath" | "extraArgs">
): string[] => [
  markdownInputPath,
  "--from",
  "gfm",
  "--to",
  "docx",
  "--output",
  outputPath,
  ...(options.referenceDocPath ? ["--reference-doc", options.referenceDocPath] : []),
  ...(options.extraArgs ?? [])
];

const defaultPandocRunner: PandocRunner = async ({ command, args, cwd, timeoutMs }) =>
  await new Promise<void>((resolve, reject) => {
    const process = spawn(command, args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      callback();
    };
    const timer =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            try {
              process.kill();
            } catch {
              // Ignore process termination failures; the timeout error is what matters.
            }
            finish(() => reject(new Error(`Pandoc execution timed out after ${timeoutMs}ms`)));
          }, timeoutMs)
        : undefined;

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", (error) => {
      finish(() => {
        if ("code" in error && error.code === "ENOENT") {
          reject(new Error(`Pandoc binary not found: ${command}`));
          return;
        }

        reject(error);
      });
    });
    process.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `Pandoc exited with code ${code}${stderr.trim().length > 0 ? `: ${stderr.trim()}` : ""}`
          )
        );
      });
    });
  });

const runPandocWithTimeout = async (
  runner: PandocRunner,
  context: PandocRunnerContext
): Promise<void> => {
  if (typeof context.timeoutMs !== "number" || context.timeoutMs <= 0) {
    await runner(context);
    return;
  }

  await Promise.race([
    runner(context),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Pandoc execution timed out after ${context.timeoutMs}ms`));
      }, context.timeoutMs);
    })
  ]);
};

export const exportMarkdownToDocx = async (
  markdown: string,
  options: ExportDocxOptions
): Promise<{ outputPath: string; command: string; args: string[] }> => {
  assertDocxPath(options.outputPath);

  const command = options.pandocPath ?? "pandoc";
  const runner = options.runner ?? defaultPandocRunner;
  const tempPath = join(options.tempDirectory ?? tmpdir(), `chemd-docx-${randomUUID()}.md`);
  const args = createPandocDocxArgs(tempPath, options.outputPath, options);

  await fs.mkdir(dirname(options.outputPath), { recursive: true });
  await fs.mkdir(dirname(tempPath), { recursive: true });
  await fs.writeFile(tempPath, markdown, "utf8");

  try {
    await runPandocWithTimeout(runner, {
      command,
      args,
      cwd: options.workingDirectory,
      timeoutMs: options.executionTimeoutMs
    });
    if (options.verifyOutputExists ?? true) {
      try {
        await fs.access(options.outputPath);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          throw new Error(`Pandoc finished but DOCX output was not created: ${options.outputPath}`, {
            cause: error
          });
        }

        throw error;
      }
    }
  } finally {
    await fs.rm(tempPath, { force: true });
  }

  return { outputPath: options.outputPath, command, args };
};

export const compileChemdToDocx = async (
  source: string,
  options: CompileChemdToDocxOptions
): Promise<CompileChemdToDocxResult> => {
  const compileResult = compileChemd(source, options.compileOptions);
  const markdown = renderDocxMarkdown(compileResult.document);
  const exportResult = await exportMarkdownToDocx(markdown, options);

  return {
    compileResult,
    markdown,
    outputPath: exportResult.outputPath,
    command: exportResult.command,
    args: exportResult.args
  };
};

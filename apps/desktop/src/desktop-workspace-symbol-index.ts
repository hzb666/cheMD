import {
  buildChemdWorkspaceSymbolIndex,
  compileChemdForEditor,
  type ChemdLanguageCompileOutput,
  type ChemdLanguageServiceDependencies,
  type ChemdWorkspaceSymbolDocumentEntry,
  type ChemdWorkspaceSymbolIndex
} from "@chemd/language-service";

import type { WorkspaceFileEntry, WorkspaceHandle } from "./desktop-contracts";

type MaybePromise<T> = T | Promise<T>;

export type DesktopWorkspaceSymbolIndexErrorStage = "read" | "compile";
export type DesktopWorkspaceSymbolIndexSkipReason =
  | "directory"
  | "non_chemd_markdown"
  | "unsupported_file";

export interface DesktopWorkspaceSymbolIndexError {
  documentPath: string;
  stage: DesktopWorkspaceSymbolIndexErrorStage;
  message: string;
}

export interface DesktopWorkspaceSymbolIndexSkippedFile {
  documentPath: string;
  reason: DesktopWorkspaceSymbolIndexSkipReason;
}

export interface DesktopWorkspaceSymbolIndexSummary {
  workspaceId: string;
  totalFiles: number;
  scannedFiles: number;
  indexedFiles: number;
  failedFiles: number;
  skippedFiles: number;
  errors: DesktopWorkspaceSymbolIndexError[];
  skipped: DesktopWorkspaceSymbolIndexSkippedFile[];
}

export interface DesktopWorkspaceSymbolCompileInput {
  workspace: WorkspaceHandle;
  file: WorkspaceFileEntry;
  source: string;
  documentUri: string;
}

export interface BuildDesktopWorkspaceSymbolIndexInput {
  workspace: WorkspaceHandle;
  files: readonly WorkspaceFileEntry[];
  readFile: (file: WorkspaceFileEntry) => MaybePromise<string>;
  compile?: (
    input: DesktopWorkspaceSymbolCompileInput
  ) => MaybePromise<ChemdLanguageCompileOutput>;
  createDocumentUri?: (
    file: WorkspaceFileEntry,
    workspace: WorkspaceHandle
  ) => string;
  languageServiceDependencies?: ChemdLanguageServiceDependencies;
}

export interface BuildDesktopWorkspaceSymbolIndexResult {
  index: ChemdWorkspaceSymbolIndex;
  summary: DesktopWorkspaceSymbolIndexSummary;
}

const isMarkdownFile = (file: WorkspaceFileEntry): boolean =>
  file.kind === "file" && file.path.toLowerCase().endsWith(".md");

const isChemdMarkdownFile = (file: WorkspaceFileEntry): boolean =>
  isMarkdownFile(file)
  && (
    file.path.toLowerCase().endsWith(".chemd.md")
    || file.chemdKind === "document"
  );

const getSkipReason = (
  file: WorkspaceFileEntry
): DesktopWorkspaceSymbolIndexSkipReason | null => {
  if (file.kind === "directory") return "directory";
  if (isMarkdownFile(file)) return "non_chemd_markdown";
  return "unsupported_file";
};

const encodePath = (path: string): string =>
  path
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

const defaultCreateDocumentUri = (
  file: WorkspaceFileEntry,
  workspace: WorkspaceHandle
): string =>
  `workspace://${encodeURIComponent(workspace.workspaceId)}/${encodePath(file.path)}`;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const createFailedCompileOutput = (
  input: DesktopWorkspaceSymbolCompileInput,
  message: string,
  dependencies: ChemdLanguageServiceDependencies
): ChemdLanguageCompileOutput =>
  compileChemdForEditor(
    {
      source: input.source,
      documentUri: input.documentUri
    },
    {
      ...dependencies,
      compileChemd: () => {
        throw new Error(message);
      }
    }
  );

const defaultCompile = (
  input: DesktopWorkspaceSymbolCompileInput,
  dependencies: ChemdLanguageServiceDependencies
): ChemdLanguageCompileOutput =>
  compileChemdForEditor(
    {
      source: input.source,
      documentUri: input.documentUri
    },
    dependencies
  );

export const buildDesktopWorkspaceSymbolIndex = async (
  input: BuildDesktopWorkspaceSymbolIndexInput
): Promise<BuildDesktopWorkspaceSymbolIndexResult> => {
  const entries: ChemdWorkspaceSymbolDocumentEntry[] = [];
  const skipped: DesktopWorkspaceSymbolIndexSkippedFile[] = [];
  const errors: DesktopWorkspaceSymbolIndexError[] = [];
  const createDocumentUri = input.createDocumentUri ?? defaultCreateDocumentUri;
  const dependencies = input.languageServiceDependencies ?? {};

  for (const file of input.files) {
    if (!isChemdMarkdownFile(file)) {
      const reason = getSkipReason(file);
      if (reason) skipped.push({ documentPath: file.path, reason });
      continue;
    }

    const documentUri = createDocumentUri(file, input.workspace);
    let source = "";
    try {
      source = await input.readFile(file);
    } catch (error) {
      errors.push({
        documentPath: file.path,
        stage: "read",
        message: getErrorMessage(error)
      });
      continue;
    }

    const compileInput = { workspace: input.workspace, file, source, documentUri };
    let compileOutput: ChemdLanguageCompileOutput;
    let compileErrorRecorded = false;
    try {
      compileOutput = input.compile
        ? await input.compile(compileInput)
        : defaultCompile(compileInput, dependencies);
    } catch (error) {
      const message = getErrorMessage(error);
      errors.push({ documentPath: file.path, stage: "compile", message });
      compileErrorRecorded = true;
      compileOutput = createFailedCompileOutput(compileInput, message, dependencies);
    }

    if (compileOutput.status === "failed" && !compileErrorRecorded) {
      errors.push({
        documentPath: file.path,
        stage: "compile",
        message: compileOutput.error.message
      });
    }
    entries.push({ documentUri, source, compileOutput });
  }

  const index = buildChemdWorkspaceSymbolIndex(entries);
  return {
    index,
    summary: {
      workspaceId: input.workspace.workspaceId,
      totalFiles: input.files.length,
      scannedFiles: entries.length,
      indexedFiles: index.diagnosticsSummary.okDocuments,
      failedFiles: index.diagnosticsSummary.failedDocuments + errors
        .filter((error) => error.stage === "read").length,
      skippedFiles: skipped.length,
      errors,
      skipped
    }
  };
};

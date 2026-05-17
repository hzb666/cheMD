import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkspaceDocumentQueryResult, WorkspaceFileEntry, WorkspaceHandle } from "../contracts";
import {
  buildWorkspaceIndexViewModel,
  isChemdDocumentPath,
  type WorkspaceDocumentSource,
  type WorkspaceIndexViewModel
} from "./workspace-index";
import { measureDesktopPerformance, measureDesktopPerformanceAsync } from "../performance-marks";

export type WorkspaceIndexLoadState = "idle" | "loading" | "ready" | "error";

export type WorkspaceIndexReadFile = (
  file: WorkspaceFileEntry
) => Promise<{ content: string; modifiedAtMs?: number | null }>;

export type WorkspaceIndexQueryDocuments = (
  input: {
    workspaceId?: string;
    query?: string;
    excludePath?: string;
    cursor?: number;
    limit?: number;
  }
) => Promise<WorkspaceDocumentQueryResult>;

export interface UseWorkspaceIndexInput {
  mode: "sample" | "workspace";
  workspaceState: "empty" | "opening" | "open" | "error";
  workspace: WorkspaceHandle;
  files: readonly WorkspaceFileEntry[];
  documentFiles?: readonly WorkspaceFileEntry[];
  selectedFile: WorkspaceFileEntry;
  source: string;
  readFile: WorkspaceIndexReadFile;
  queryDocuments?: WorkspaceIndexQueryDocuments;
}

export interface WorkspaceIndexController {
  loadState: WorkspaceIndexLoadState;
  error: string | null;
  documentCount: number;
  viewModel: WorkspaceIndexViewModel;
  refresh: () => void;
}

const toDocumentSource = (
  file: WorkspaceFileEntry,
  content: string,
  modifiedAtMs?: number | null
): WorkspaceDocumentSource => ({
  path: file.path,
  source: content,
  modifiedAtMs: modifiedAtMs ?? null
});

const visibleChemdFiles = (
  files: readonly WorkspaceFileEntry[]
): WorkspaceFileEntry[] =>
  files.filter((file) =>
    file.kind === "file" && isChemdDocumentPath(file.path)
  );

const replaceCurrentDocument = (
  documents: readonly WorkspaceDocumentSource[],
  current: WorkspaceDocumentSource
): WorkspaceDocumentSource[] => {
  const withoutCurrent = documents.filter((document) => document.path !== current.path);
  return [...withoutCurrent, current];
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const DEFAULT_WORKSPACE_INDEX_DOCUMENT_LIMIT = 200;
const MAX_WORKSPACE_INDEX_READ_CONCURRENCY = 4;

const mapWithConcurrency = async <Input, Output>(
  items: readonly Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<Output>,
): Promise<Output[]> => {
  const results: Output[] = [];
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    const index = cursor;
    cursor += 1;
    const item = items[index];
    if (item === undefined) return;
    results[index] = await mapper(item);
    await runNext();
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext(),
  ));
  return results;
};

export const useWorkspaceIndexController = ({
  mode,
  workspaceState,
  workspace,
  files,
  documentFiles,
  selectedFile,
  source,
  readFile,
  queryDocuments
}: UseWorkspaceIndexInput): WorkspaceIndexController => {
  const [loadedDocuments, setLoadedDocuments] = useState<WorkspaceDocumentSource[]>([]);
  const [loadState, setLoadState] = useState<WorkspaceIndexLoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const currentDocument = useMemo(() =>
    selectedFile.kind === "file" && isChemdDocumentPath(selectedFile.path)
      ? toDocumentSource(selectedFile, source)
      : undefined,
  [selectedFile, source]);
  const currentDocumentPath = currentDocument?.path;
  const hasCurrentDocument = currentDocument !== undefined;

  useEffect(() => {
    let cancelled = false;

    const loadDocuments = async (): Promise<WorkspaceDocumentSource[]> => {
      if (mode !== "workspace" || workspaceState !== "open") {
        return [];
      }
      const filesToRead = documentFiles
        ? documentFiles.filter((file) => file.path !== currentDocumentPath)
        : queryDocuments
        ? (await queryDocuments({
          workspaceId: workspace.workspaceId,
          excludePath: currentDocumentPath,
          limit: DEFAULT_WORKSPACE_INDEX_DOCUMENT_LIMIT
        })).files
        : visibleChemdFiles(files).filter((file) => file.path !== currentDocumentPath);
      return measureDesktopPerformanceAsync(
        "workspaceIndex.loadDocuments",
        () => mapWithConcurrency(filesToRead, MAX_WORKSPACE_INDEX_READ_CONCURRENCY, async (file) => {
          const result = await readFile(file);
          return toDocumentSource(file, result.content, result.modifiedAtMs);
        }),
        {
          fileCount: filesToRead.length,
          workspaceId: workspace.workspaceId,
        }
      );
    };

    setLoadState(hasCurrentDocument ? "loading" : "idle");
    setError(null);
    void loadDocuments()
      .then((documents) => {
        if (cancelled) {
          return;
        }
        setLoadedDocuments(documents);
        setLoadState(documents.length > 0 || hasCurrentDocument ? "ready" : "idle");
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(loadError));
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentDocumentPath,
    documentFiles,
    files,
    hasCurrentDocument,
    mode,
    queryDocuments,
    readFile,
    refreshToken,
    workspace.workspaceId,
    workspaceState
  ]);

  const documents = currentDocument
    ? replaceCurrentDocument(loadedDocuments, currentDocument)
    : loadedDocuments;
  const viewModel = useMemo(() => measureDesktopPerformance(
    "workspaceIndex.viewModel",
    () => buildWorkspaceIndexViewModel({
      workspaceId: workspace.workspaceId,
      files,
      currentDocument,
      documents
    }),
    {
      documentCount: documents.length,
      fileCount: files.length,
      workspaceId: workspace.workspaceId,
    }
  ), [currentDocument, documents, files, workspace.workspaceId]);
  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  return {
    loadState,
    error,
    documentCount: documents.length,
    viewModel,
    refresh
  };
};

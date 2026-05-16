import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkspaceFileEntry, WorkspaceHandle } from "../contracts";
import {
  buildWorkspaceIndexViewModel,
  isChemdDocumentPath,
  type WorkspaceDocumentSource,
  type WorkspaceIndexViewModel
} from "./workspace-index";

export type WorkspaceIndexLoadState = "idle" | "loading" | "ready" | "error";

export type WorkspaceIndexReadFile = (
  file: WorkspaceFileEntry
) => Promise<{ content: string; modifiedAtMs?: number | null }>;

export interface UseWorkspaceIndexInput {
  mode: "sample" | "workspace";
  workspaceState: "empty" | "opening" | "open" | "error";
  workspace: WorkspaceHandle;
  files: readonly WorkspaceFileEntry[];
  selectedFile: WorkspaceFileEntry;
  source: string;
  readFile: WorkspaceIndexReadFile;
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

export const useWorkspaceIndexController = ({
  mode,
  workspaceState,
  workspace,
  files,
  selectedFile,
  source,
  readFile
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

  useEffect(() => {
    let cancelled = false;
    const filesToRead = mode === "workspace" && workspaceState === "open"
      ? visibleChemdFiles(files).filter((file) => file.path !== currentDocument?.path)
      : [];

    if (filesToRead.length === 0) {
      setLoadedDocuments([]);
      setLoadState(currentDocument ? "ready" : "idle");
      setError(null);
      return;
    }

    setLoadState("loading");
    setError(null);
    void Promise.all(filesToRead.map(async (file) => {
      const result = await readFile(file);
      return toDocumentSource(file, result.content, result.modifiedAtMs);
    }))
      .then((documents) => {
        if (cancelled) {
          return;
        }
        setLoadedDocuments(documents);
        setLoadState("ready");
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
  }, [currentDocument?.path, files, mode, readFile, refreshToken, workspaceState]);

  const documents = currentDocument
    ? replaceCurrentDocument(loadedDocuments, currentDocument)
    : loadedDocuments;
  const viewModel = useMemo(() => buildWorkspaceIndexViewModel({
    workspaceId: workspace.workspaceId,
    files,
    currentDocument,
    documents
  }), [currentDocument, documents, files, workspace.workspaceId]);
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

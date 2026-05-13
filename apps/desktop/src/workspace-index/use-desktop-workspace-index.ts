import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkspaceFileEntry, WorkspaceHandle } from "../desktop-contracts";
import {
  buildDesktopWorkspaceIndexViewModel,
  isDesktopChemdDocumentPath,
  type DesktopWorkspaceDocumentSource,
  type DesktopWorkspaceIndexViewModel
} from "./desktop-workspace-index";

export type DesktopWorkspaceIndexLoadState = "idle" | "loading" | "ready" | "error";

export type DesktopWorkspaceIndexReadFile = (
  file: WorkspaceFileEntry
) => Promise<{ content: string; modifiedAtMs?: number | null }>;

export interface UseDesktopWorkspaceIndexInput {
  mode: "sample" | "workspace";
  workspaceState: "empty" | "opening" | "open" | "error";
  workspace: WorkspaceHandle;
  files: readonly WorkspaceFileEntry[];
  selectedFile: WorkspaceFileEntry;
  source: string;
  readFile: DesktopWorkspaceIndexReadFile;
}

export interface DesktopWorkspaceIndexController {
  loadState: DesktopWorkspaceIndexLoadState;
  error: string | null;
  documentCount: number;
  viewModel: DesktopWorkspaceIndexViewModel;
  refresh: () => void;
}

const toDocumentSource = (
  file: WorkspaceFileEntry,
  content: string,
  modifiedAtMs?: number | null
): DesktopWorkspaceDocumentSource => ({
  path: file.path,
  source: content,
  modifiedAtMs: modifiedAtMs ?? null
});

const visibleChemdFiles = (
  files: readonly WorkspaceFileEntry[]
): WorkspaceFileEntry[] =>
  files.filter((file) =>
    file.kind === "file" && isDesktopChemdDocumentPath(file.path)
  );

const replaceCurrentDocument = (
  documents: readonly DesktopWorkspaceDocumentSource[],
  current: DesktopWorkspaceDocumentSource
): DesktopWorkspaceDocumentSource[] => {
  const withoutCurrent = documents.filter((document) => document.path !== current.path);
  return [...withoutCurrent, current];
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const useDesktopWorkspaceIndexController = ({
  mode,
  workspaceState,
  workspace,
  files,
  selectedFile,
  source,
  readFile
}: UseDesktopWorkspaceIndexInput): DesktopWorkspaceIndexController => {
  const [loadedDocuments, setLoadedDocuments] = useState<DesktopWorkspaceDocumentSource[]>([]);
  const [loadState, setLoadState] = useState<DesktopWorkspaceIndexLoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const currentDocument = useMemo(() =>
    selectedFile.kind === "file" && isDesktopChemdDocumentPath(selectedFile.path)
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
  const viewModel = useMemo(() => buildDesktopWorkspaceIndexViewModel({
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

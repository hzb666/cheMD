import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CommandMap,
  WorkspaceFileEntry,
  WorkspaceHandle,
  WorkspaceIndexQueryResult,
  WorkspaceIndexRow,
  WorkspaceIndexSummary,
} from "../contracts";
import { createEditorSourceHash } from "../utils";
import { isChemdDocumentPath } from "../workspace-index/workspace-index";

export type WorkspaceDataGatewayState =
  | "idle"
  | "loading"
  | "partial"
  | "ready"
  | "degraded"
  | "stale";

export type WorkspaceDataGatewayReadFile = (
  file: WorkspaceFileEntry
) => Promise<{ content: string; modifiedAtMs?: number | null; contentHash?: string | null }>;

export type WorkspaceDataGatewayQueryIndex = (
  input: CommandMap["query_workspace_index"]["input"]
) => Promise<WorkspaceIndexQueryResult>;

export interface WorkspaceSourceRevision {
  workspaceId: string;
  path: string;
  sourceHash: string;
  sourceRevision: string;
  manifestRevisionKey: string | null;
  modifiedAtMs: number | null;
}

export interface WorkspaceDocumentOverlay {
  path: string;
  source: string;
  revision: WorkspaceSourceRevision;
}

export interface UseWorkspaceDataGatewayInput {
  mode: "sample" | "workspace";
  workspaceState: "empty" | "opening" | "open" | "error";
  workspace: WorkspaceHandle;
  selectedFile: WorkspaceFileEntry;
  source: string;
  readFile: WorkspaceDataGatewayReadFile;
  queryIndex: WorkspaceDataGatewayQueryIndex;
}

export interface WorkspaceDataGateway {
  state: WorkspaceDataGatewayState;
  error: string | null;
  manifestRows: WorkspaceIndexRow[];
  manifestSummary: WorkspaceIndexSummary | null;
  documentFiles: WorkspaceFileEntry[];
  currentDocument: WorkspaceDocumentOverlay | null;
  currentRevision: WorkspaceSourceRevision | null;
  readFile: WorkspaceDataGatewayReadFile;
  refresh: () => void;
}

const DEFAULT_WORKSPACE_INDEX_MANIFEST_LIMIT = 200;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const workspaceIndexRowsToFiles = (
  rows: readonly WorkspaceIndexRow[]
): WorkspaceFileEntry[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    kind: row.kind,
    chemdKind: row.chemdKind,
  }));

export const deriveWorkspaceDataGatewayState = (
  result: Pick<WorkspaceIndexQueryResult, "rows" | "summary" | "nextCursor">
): WorkspaceDataGatewayState =>
  result.nextCursor !== null || result.summary.returnedCount < result.summary.totalCount
    ? "partial"
    : result.rows.length > 0
      ? "ready"
      : "idle";

export const canUseGatewayForCompleteWorkspaceSemantics = (
  state: WorkspaceDataGatewayState
): boolean => state === "ready";

export const createWorkspaceSourceRevision = ({
  workspaceId,
  path,
  source,
  modifiedAtMs,
  manifestRevisionKey,
}: {
  workspaceId: string;
  path: string;
  source: string;
  modifiedAtMs?: number | null;
  manifestRevisionKey?: string | null;
}): WorkspaceSourceRevision => {
  const sourceHash = createEditorSourceHash(source);
  return {
    workspaceId,
    path,
    sourceHash,
    sourceRevision: `${workspaceId}:${path}:${sourceHash}`,
    manifestRevisionKey: manifestRevisionKey ?? null,
    modifiedAtMs: modifiedAtMs ?? null,
  };
};

export const useWorkspaceDataGateway = ({
  mode,
  workspaceState,
  workspace,
  selectedFile,
  source,
  readFile,
  queryIndex,
}: UseWorkspaceDataGatewayInput): WorkspaceDataGateway => {
  const [state, setState] = useState<WorkspaceDataGatewayState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [manifestRows, setManifestRows] = useState<WorkspaceIndexRow[]>([]);
  const [manifestSummary, setManifestSummary] = useState<WorkspaceIndexSummary | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestIdRef = useRef(0);
  const contentCacheRef = useRef(
    new Map<string, Awaited<ReturnType<WorkspaceDataGatewayReadFile>>>()
  );
  const manifestRevisionByPath = useMemo(
    () => new Map(manifestRows.map((row) => [row.path, row.revisionKey])),
    [manifestRows],
  );
  const selectedManifestRow = useMemo(
    () => manifestRows.find((row) => row.path === selectedFile.path) ?? null,
    [manifestRows, selectedFile.path],
  );
  const currentRevision = useMemo(() => {
    if (selectedFile.kind !== "file" || !isChemdDocumentPath(selectedFile.path)) {
      return null;
    }
    return createWorkspaceSourceRevision({
      workspaceId: workspace.workspaceId,
      path: selectedFile.path,
      source,
      modifiedAtMs: selectedManifestRow?.modifiedAtMs,
      manifestRevisionKey: selectedManifestRow?.revisionKey,
    });
  }, [
    selectedFile.kind,
    selectedFile.path,
    selectedManifestRow?.modifiedAtMs,
    selectedManifestRow?.revisionKey,
    source,
    workspace.workspaceId,
  ]);
  const currentDocument = useMemo<WorkspaceDocumentOverlay | null>(
    () => currentRevision ? { path: selectedFile.path, source, revision: currentRevision } : null,
    [currentRevision, selectedFile.path, source],
  );
  const documentFiles = useMemo(() => workspaceIndexRowsToFiles(manifestRows), [manifestRows]);

  useEffect(() => {
    contentCacheRef.current.clear();
  }, [refreshToken, workspace.workspaceId]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (mode !== "workspace" || workspaceState !== "open") {
      setState("idle");
      setError(null);
      setManifestRows([]);
      setManifestSummary(null);
      return;
    }

    setState((current) => current === "ready" || current === "partial" ? "stale" : "loading");
    setError(null);
    void queryIndex({
      workspaceId: workspace.workspaceId,
      kind: "document",
      limit: DEFAULT_WORKSPACE_INDEX_MANIFEST_LIMIT,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setManifestRows(result.rows);
        setManifestSummary(result.summary);
        setState(deriveWorkspaceDataGatewayState(result));
      })
      .catch((loadError) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setError(errorMessage(loadError));
        setState("degraded");
      });
  }, [
    mode,
    queryIndex,
    refreshToken,
    workspace.workspaceId,
    workspaceState,
  ]);

  const cachedReadFile = useCallback<WorkspaceDataGatewayReadFile>(
    async (file) => {
      const revisionKey = manifestRevisionByPath.get(file.path) ?? "unknown";
      const cacheKey = `${workspace.workspaceId}:${file.path}:${revisionKey}`;
      const cached = contentCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
      const result = await readFile(file);
      contentCacheRef.current.set(cacheKey, result);
      return result;
    },
    [manifestRevisionByPath, readFile, workspace.workspaceId],
  );

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  return {
    state,
    error,
    manifestRows,
    manifestSummary,
    documentFiles,
    currentDocument,
    currentRevision,
    readFile: cachedReadFile,
    refresh,
  };
};

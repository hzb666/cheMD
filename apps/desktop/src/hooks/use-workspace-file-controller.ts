import type { DocumentMode, WorkspaceConflictState, WorkspaceState } from "../types";
import type { WorkspaceFileEntry, WorkspaceHandle } from "../contracts";
import type { AppSettings } from "../features/settings/settings";
import { shellFiles, shellWorkspace } from "../contracts";
import {
  DEFAULT_SAMPLE_SOURCE_NAME,
  getCommandErrorCode,
  getDisplayableError,
  getSampleSource,
  invokeCommand,
  sampleSources,
} from "../utils";
import {
  isScratchFile,
} from "../features/workspace/scratch-file";
import {
  buildWorkspaceFileSaveRequest,
  createDirtyWorkspaceFileSignature,
  createWorkspaceSaveSingleFlight,
} from "./workspace-save";
import {
  closeAllEditorSessionTabs,
  closeEditorSessionTab,
  createEditorSession,
  getDirtyEditorSessionFileIds,
  getDirtyWorkspaceEditorSessionFileIds,
  getSelectedEditorSessionFile,
  markEditorSessionFileSaved,
  openScratchEditorSessionTab,
  replaceEditorSessionFileContent,
  reorderEditorSessionTabs,
  selectEditorSessionFile,
  updateEditorSessionSource,
} from "./editor-session";
import { useCallback, useMemo, useRef, useState } from "react";

const getFileSelectedMessage = (file: WorkspaceFileEntry, mode: DocumentMode): string => {
  if (isScratchFile(file)) return `${file.name} selected.`;
  if (mode === "sample") return "Sample document selected from bundled fallback.";
  return `Read ${file.path} from the local workspace.`;
};

type InitialWorkspaceFileSource = {
  source: string;
  contentHash: string | null;
  readFailed: boolean;
};

const WORKSPACE_CHILDREN_LAYER_DEPTH = 1;
const WORKSPACE_CHILDREN_HYDRATION_DEPTH = 2;

const workspacePathDepth = (path: string): number =>
  path.replace(/\\/g, "/").split("/").filter(Boolean).length;

const isWorkspaceDescendant = (parentPath: string, path: string): boolean => {
  if (!parentPath) return path.length > 0;
  return path.startsWith(`${parentPath}/`);
};

const relativeWorkspacePathDepth = (parentPath: string, path: string): number => {
  if (!parentPath) return workspacePathDepth(path);
  if (path === parentPath) return 0;
  if (!isWorkspaceDescendant(parentPath, path)) return Number.POSITIVE_INFINITY;
  return workspacePathDepth(path.slice(parentPath.length + 1));
};

export const resolveInitialWorkspaceFileSource = async (
  file: WorkspaceFileEntry,
  readFile: (path: string) => Promise<{ content: string; contentHash: string }>,
): Promise<InitialWorkspaceFileSource> => {
  const shouldReadInitialFile = file.kind === "file" && file.chemdKind !== "asset";
  if (!shouldReadInitialFile) {
    return {
      source: getSampleSource(file),
      contentHash: null,
      readFailed: false,
    };
  }

  try {
    const content = await readFile(file.path);
    return {
      source: content.content,
      contentHash: content.contentHash,
      readFailed: false,
    };
  } catch {
    return {
      source: getSampleSource(file),
      contentHash: null,
      readFailed: true,
    };
  }
};

export const mergeWorkspaceChildren = (
  currentFiles: readonly WorkspaceFileEntry[],
  directoryPath: string,
  children: readonly WorkspaceFileEntry[],
  replaceDepth?: number,
): WorkspaceFileEntry[] => {
  const preservedDescendantPaths = replaceDepth === undefined
    ? []
    : currentFiles
      .filter((file) => (
        isWorkspaceDescendant(directoryPath, file.path)
        && relativeWorkspacePathDepth(directoryPath, file.path) > replaceDepth
      ))
      .map((file) => file.path);
  const base = currentFiles.filter((file) => (
    file.path === directoryPath
    || !isWorkspaceDescendant(directoryPath, file.path)
    || (
      replaceDepth !== undefined
      && relativeWorkspacePathDepth(directoryPath, file.path) > replaceDepth
    )
    || (
      file.kind === "directory"
      && preservedDescendantPaths.some((path) => isWorkspaceDescendant(file.path, path))
    )
  ));
  const merged = new Map<string, WorkspaceFileEntry>();
  [...base, ...children].forEach((file) => merged.set(file.path, file));
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
};

export const getLoadedDirectoryPathsForRequest = (
  directoryPath: string,
  depth: number,
  children: readonly WorkspaceFileEntry[],
): string[] => [
  directoryPath,
  ...children
    .filter((file) => (
      file.kind === "directory"
      && relativeWorkspacePathDepth(directoryPath, file.path) < depth
    ))
    .map((file) => file.path),
];

// ─── Hook ───────────────────────────────────────────────────────────────

export const useWorkspaceFileController = ({
  workspaceIgnoreNames,
}: {
  workspaceIgnoreNames: AppSettings["workspaceIgnoreNames"];
}) => {
  const initialSource = sampleSources[DEFAULT_SAMPLE_SOURCE_NAME];
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("empty");
  const [workspace, setWorkspace] = useState<WorkspaceHandle>(shellWorkspace);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(shellFiles);
  const [session, setSession] = useState(() =>
    createEditorSession(shellFiles[0], { source: initialSource }));
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceConflictState | null>(null);
  const [loadedDirectoryPaths, setLoadedDirectoryPaths] = useState<Set<string>>(() => new Set());
  const [loadingDirectoryPaths, setLoadingDirectoryPaths] = useState<Set<string>>(() => new Set());
  const [failedDirectoryMessages, setFailedDirectoryMessages] = useState<Map<string, string>>(() => new Map());
  const loadedDirectoryPathsRef = useRef(new Set<string>());
  const loadingDirectoryPathsRef = useRef(new Set<string>());
  const failedDirectoryMessagesRef = useRef(new Map<string, string>());
  const hydratedDirectoryPathsRef = useRef(new Set<string>());
  const [mode, setMode] = useState<DocumentMode>("sample");
  const [rootPath, setRootPath] = useState("");
  const [message, setMessage] = useState("No workspace is open. Editing bundled sample content.");
  const selectedFileIdRef = useRef(session.selectedFileId);
  const selectFileRequestRef = useRef(0);
  const saveSingleFlightRef = useRef<ReturnType<typeof createWorkspaceSaveSingleFlight> | null>(null);
  if (!saveSingleFlightRef.current) {
    saveSingleFlightRef.current = createWorkspaceSaveSingleFlight();
  }
  const {
    selectedFileId,
    openedTabs,
    source,
    savedSource,
    savedAt,
    openBuffers,
  } = session;
  selectedFileIdRef.current = selectedFileId;
  const selectedFile = getSelectedEditorSessionFile(session, files, shellFiles[0]);
  const selectedBuffer = openBuffers[selectedFileId];
  const dirtyFileIds = useMemo(
    () => getDirtyEditorSessionFileIds(session),
    [session],
  );
  const dirtyWorkspaceFileIds = useMemo(
    () => mode === "workspace"
      ? getDirtyWorkspaceEditorSessionFileIds(session, files, workspace.writable)
      : [],
    [files, mode, session, workspace.writable],
  );
  const dirtyWorkspaceFileSignature = useMemo(
    () => createDirtyWorkspaceFileSignature(dirtyWorkspaceFileIds, openBuffers),
    [dirtyWorkspaceFileIds, openBuffers],
  );
  const canSave = mode === "workspace"
    && selectedFile.kind === "file"
    && !isScratchFile(selectedFile)
    && workspace.writable
    && Boolean(selectedBuffer && selectedBuffer.source !== selectedBuffer.savedSource);

  const selectInitialWorkspaceFile = (nextFiles: WorkspaceFileEntry[]) =>
    nextFiles.find((file) => file.kind === "file" && file.chemdKind !== "asset")
    ?? nextFiles.find((file) => file.kind === "file")
    ?? nextFiles[0];

  const listWorkspaceChildren = async (
    workspaceId: string,
    path: string,
    depth: number,
  ) => invokeCommand("list_workspace_children", {
    workspaceId,
    path: path || undefined,
    depth,
    ignoreNames: workspaceIgnoreNames,
  });

  const replaceLoadedDirectoryPaths = (paths: Iterable<string>) => {
    const next = new Set(paths);
    loadedDirectoryPathsRef.current = next;
    setLoadedDirectoryPaths(new Set(next));
  };

  const addLoadedDirectoryPath = (path: string) => {
    const next = new Set(loadedDirectoryPathsRef.current).add(path);
    loadedDirectoryPathsRef.current = next;
    setLoadedDirectoryPaths(new Set(next));
  };

  const addLoadingDirectoryPath = (path: string): boolean => {
    if (loadedDirectoryPathsRef.current.has(path) || loadingDirectoryPathsRef.current.has(path)) {
      return false;
    }
    const next = new Set(loadingDirectoryPathsRef.current).add(path);
    loadingDirectoryPathsRef.current = next;
    setLoadingDirectoryPaths(new Set(next));
    return true;
  };

  const removeLoadingDirectoryPath = (path: string) => {
    const next = new Set(loadingDirectoryPathsRef.current);
    next.delete(path);
    loadingDirectoryPathsRef.current = next;
    setLoadingDirectoryPaths(new Set(next));
  };

  const clearFailedDirectoryMessage = (path: string) => {
    if (!failedDirectoryMessagesRef.current.has(path)) return;
    const next = new Map(failedDirectoryMessagesRef.current);
    next.delete(path);
    failedDirectoryMessagesRef.current = next;
    setFailedDirectoryMessages(new Map(next));
  };

  const setFailedDirectoryMessage = (path: string, message: string) => {
    const next = new Map(failedDirectoryMessagesRef.current);
    next.set(path, message);
    failedDirectoryMessagesRef.current = next;
    setFailedDirectoryMessages(new Map(next));
  };

  const loadDirectoryLayer = async (
    workspaceId: string,
    path: string,
  ): Promise<WorkspaceFileEntry[] | null> => {
    if (!addLoadingDirectoryPath(path)) {
      return null;
    }

    try {
      clearFailedDirectoryMessage(path);
      const children = await listWorkspaceChildren(
        workspaceId,
        path,
        WORKSPACE_CHILDREN_LAYER_DEPTH,
      );
      setFiles((current) => mergeWorkspaceChildren(current, path, children));
      addLoadedDirectoryPath(path);
      return children;
    } catch (error: unknown) {
      setFailedDirectoryMessage(path, getDisplayableError(error));
      throw error;
    } finally {
      removeLoadingDirectoryPath(path);
    }
  };

  const hydrateWorkspaceDirectory = async (
    workspaceId: string,
    path: string,
  ) => {
    if (hydratedDirectoryPathsRef.current.has(path)) {
      return;
    }
    hydratedDirectoryPathsRef.current = new Set(hydratedDirectoryPathsRef.current).add(path);
    try {
      const children = await listWorkspaceChildren(
        workspaceId,
        path,
        WORKSPACE_CHILDREN_HYDRATION_DEPTH,
      );
      setFiles((current) => mergeWorkspaceChildren(
        current,
        path,
        children,
        WORKSPACE_CHILDREN_HYDRATION_DEPTH,
      ));
      getLoadedDirectoryPathsForRequest(path, WORKSPACE_CHILDREN_HYDRATION_DEPTH, children)
        .forEach(addLoadedDirectoryPath);
      clearFailedDirectoryMessage(path);
    } catch (error: unknown) {
      setFailedDirectoryMessage(path, getDisplayableError(error));
      hydratedDirectoryPathsRef.current = new Set(
        [...hydratedDirectoryPathsRef.current].filter((loadedPath) => loadedPath !== path),
      );
    }
  };

  const loadWorkspace = async (nextWorkspace: WorkspaceHandle, messagePrefix: string) => {
    const nextFiles = await listWorkspaceChildren(
      nextWorkspace.workspaceId,
      "",
      WORKSPACE_CHILDREN_LAYER_DEPTH,
    );
    const usableFiles = nextFiles.length > 0 ? nextFiles : shellFiles;
    const firstFile = selectInitialWorkspaceFile(usableFiles);
    const initialFileSource = await resolveInitialWorkspaceFileSource(
      firstFile,
      async (path) => invokeCommand("read_workspace_file", {
        workspaceId: nextWorkspace.workspaceId,
        path,
      }),
    );
    setWorkspace(nextWorkspace);
    setFiles(usableFiles);
    replaceLoadedDirectoryPaths(getLoadedDirectoryPathsForRequest(
      "",
      WORKSPACE_CHILDREN_LAYER_DEPTH,
      usableFiles,
    ));
    loadingDirectoryPathsRef.current = new Set();
    hydratedDirectoryPathsRef.current = new Set();
    setLoadingDirectoryPaths(new Set());
    failedDirectoryMessagesRef.current = new Map();
    setFailedDirectoryMessages(new Map());
    setSession(createEditorSession(firstFile, {
      source: initialFileSource.source,
      savedContentHash: initialFileSource.contentHash,
    }));
    setWorkspaceConflict(null);
    setRootPath(nextWorkspace.rootPath);
    setMode("workspace");
    setMessage(initialFileSource.readFailed
      ? `${messagePrefix} ${usableFiles.length} workspace entries. Initial file could not be read, so bundled content is shown until another file is selected.`
      : `${messagePrefix} ${usableFiles.length} workspace entries from the local workspace.`);
    setWorkspaceState("open");
    void hydrateWorkspaceDirectory(nextWorkspace.workspaceId, "");
  };

  const openWorkspacePath = async (selectedRootPath: string) => {
    const rootPathToOpen = selectedRootPath.trim();
    if (!rootPathToOpen) return;
    setWorkspaceState("opening");
    try {
      const nextWorkspace = await invokeCommand("open_workspace_path", { rootPath: rootPathToOpen });
      await loadWorkspace(nextWorkspace, "Restored");
    } catch (error: unknown) {
      setWorkspaceState(workspaceState === "open" ? "open" : "error");
      setMessage(`Workspace restore failed: ${getDisplayableError(error)}. Use Open Workspace to reselect the folder.`);
    }
  };

  const openWorkspace = async () => {
    const previousWorkspaceState = workspaceState;
    setWorkspaceState("opening");
    try {
      const nextWorkspace = await invokeCommand("open_workspace", undefined);
      if (!nextWorkspace) {
        setWorkspaceState(previousWorkspaceState === "open" ? "open" : "empty");
        setMessage(mode === "workspace" ? `Workspace remains open: ${workspace.displayName}.` : "No workspace selected.");
        return;
      }

      await loadWorkspace(nextWorkspace, "Opened");
    } catch (error: unknown) {
      setWorkspace(shellWorkspace);
      setFiles(shellFiles);
      setSession(createEditorSession(shellFiles[0], { source: initialSource }));
      setMode("sample");
      setMessage(`Workspace open failed: ${getDisplayableError(error)}. Using bundled sample content.`);
      setWorkspaceState("error");
    }
  };

  const selectFile = async (file: WorkspaceFileEntry) => {
    if (file.kind !== "file") return;
    const requestId = selectFileRequestRef.current + 1;
    selectFileRequestRef.current = requestId;
    try {
      const existingBuffer = openBuffers[file.id];
      const nextContent = existingBuffer || mode !== "workspace" || isScratchFile(file)
        ? undefined
        : await invokeCommand("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path,
        });
      if (selectFileRequestRef.current !== requestId) {
        return;
      }
      const nextSource = nextContent?.content ?? getSampleSource(file);
      const nextSavedContentHash = nextContent?.contentHash ?? null;
      setSession((current) => selectEditorSessionFile(current, file, {
        source: nextSource,
        savedContentHash: nextSavedContentHash,
      }));
      setWorkspaceConflict(null);
      setMessage(getFileSelectedMessage(file, mode));
    } catch (error: unknown) {
      setMessage(`Workspace read failed: ${getDisplayableError(error)}.`);
    }
  };

  const loadDirectoryChildren = async (path: string) => {
    if (mode !== "workspace"
      || loadedDirectoryPathsRef.current.has(path)
      || loadingDirectoryPathsRef.current.has(path)) {
      return;
    }
    try {
      const children = await loadDirectoryLayer(workspace.workspaceId, path);
      if (!children) return;
      setMessage(`Loaded ${children.length} entries from ${path || workspace.displayName}.`);
      void hydrateWorkspaceDirectory(workspace.workspaceId, path);
    } catch (error: unknown) {
      setMessage(`Workspace folder load failed: ${getDisplayableError(error)}.`);
    }
  };

  const closeFileTab = async (fileId: string) => {
    const closingResult = closeEditorSessionTab(session, fileId);
    if (!closingResult.closed && !closingResult.blockedTab) {
      setMessage("At least one editor tab must remain open.");
      return;
    }
    if (closingResult.blockedTab) {
      setMessage(`Save or discard changes in ${closingResult.blockedTab.name} before closing this tab.`);
      if (selectedFileId !== fileId) {
        await selectFile(closingResult.blockedTab);
      }
      return;
    }

    setSession(closingResult.session);
  };

  const closeAllFileTabs = async () => {
    const closingResult = closeAllEditorSessionTabs(session);
    if (closingResult.blockedTab) {
      setMessage(`Save or discard changes in ${closingResult.blockedTab.name} before closing all tabs.`);
      if (selectedFileId !== closingResult.blockedTab.id) {
        await selectFile(closingResult.blockedTab);
      }
      return;
    }

    setSession(closingResult.session);
    setWorkspaceConflict(null);
    setMessage("All editor tabs closed. New blank tab opened.");
  };

  const reorderFileTabs = (orderedFileIds: readonly string[]) => {
    setSession((current) => reorderEditorSessionTabs(current, orderedFileIds));
  };

  const openNewTab = async () => {
    const nextSession = openScratchEditorSessionTab(session);
    const nextFileName = getSelectedEditorSessionFile(nextSession, files, shellFiles[0]).name;
    setSession(nextSession);
    setWorkspaceConflict(null);
    setMessage(`Created ${nextFileName}.`);
  };

  const reloadWorkspaceConflict = async () => {
    if (!workspaceConflict || mode !== "workspace" || selectedFile.kind !== "file") return;
    setWorkspaceConflict((current) => current ? { ...current, reloading: true } : current);
    try {
      const nextContent = await invokeCommand("read_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: selectedFile.path,
      });
      setSession((current) => replaceEditorSessionFileContent(current, selectedFile.id, {
        source: nextContent.content,
        savedContentHash: nextContent.contentHash,
      }));
      setWorkspaceConflict(null);
      setMessage(`Reloaded ${nextContent.path} from disk.`);
    } catch (error: unknown) {
      const nextMessage = `Reload failed: ${getDisplayableError(error)}. Local edits are still in the editor.`;
      setWorkspaceConflict((current) => current
        ? { ...current, message: nextMessage, reloading: false }
        : current);
      setMessage(nextMessage);
    }
  };

  const keepLocalWorkspaceConflict = () => {
    if (!workspaceConflict) return;
    setWorkspaceConflict(null);
    setMessage("Kept local editor changes. Save remains guarded by the last saved file hash.");
  };

  const saveWorkspaceFileUnlocked = useCallback(async (fileId = selectedFileId) => {
    const targetFile = files.find((file) => file.id === fileId);
    const targetBuffer = openBuffers[fileId];
    if (
      mode !== "workspace"
      || !workspace.writable
      || !targetFile
      || targetFile.kind !== "file"
      || isScratchFile(targetFile)
      || !targetBuffer
      || targetBuffer.source === targetBuffer.savedSource
    ) {
      return;
    }

    try {
      const saveRequest = buildWorkspaceFileSaveRequest({
        workspaceId: workspace.workspaceId,
        path: targetFile.path,
        content: targetBuffer.source,
        baseHash: targetBuffer.savedContentHash,
      });
      const result = await invokeCommand(saveRequest.command, saveRequest.input);
      const nextSavedAt = new Date().toISOString();
      setSession((current) => markEditorSessionFileSaved(current, fileId, {
        contentHash: result.contentHash,
        savedAt: nextSavedAt,
      }));
      if (fileId === selectedFileIdRef.current) {
        setWorkspaceConflict(null);
      }
      setMessage(`Saved ${result.path} (${result.bytes} bytes).`);
    } catch (error: unknown) {
      if (getCommandErrorCode(error) === "workspace_file_conflict") {
        if (fileId === selectedFileIdRef.current) {
          setWorkspaceConflict({
            path: targetFile.path,
            message: "The file changed on disk after this buffer was loaded. Reload from disk or keep editing the local buffer.",
            detectedAt: new Date().toISOString(),
            reloading: false,
          });
        }
        setMessage("Workspace save conflict. Local editor content was not overwritten.");
        return;
      }
      setMessage(`Workspace save failed: ${getDisplayableError(error)}.`);
    }
  }, [files, mode, openBuffers, selectedFileId, workspace.workspaceId, workspace.writable]);

  const saveWorkspaceFile = useCallback(
    (fileId = selectedFileId) =>
      saveSingleFlightRef.current!.run(() => saveWorkspaceFileUnlocked(fileId)),
    [saveWorkspaceFileUnlocked, selectedFileId],
  );

  const saveDirtyWorkspaceFiles = useCallback(async () => {
    await saveSingleFlightRef.current!.run(async () => {
      for (const fileId of dirtyWorkspaceFileIds) {
        await saveWorkspaceFileUnlocked(fileId);
      }
    });
  }, [dirtyWorkspaceFileIds, saveWorkspaceFileUnlocked]);

  const setSource = (nextSource: string) => {
    setSession((current) => updateEditorSessionSource(current, nextSource));
  };

  return {
    workspaceState,
    workspace,
    files,
    loadedDirectoryPaths,
    loadingDirectoryPaths,
    failedDirectoryMessages,
    openedTabs,
    dirtyFileIds,
    dirtyWorkspaceFileIds,
    dirtyWorkspaceFileSignature,
    selectedFile,
    selectedFileId,
    source,
    savedSource,
    savedAt,
    workspaceConflict,
    mode,
    rootPath,
    message,
    canSave,
    setRootPath,
    setSource,
    setMessage,
    openWorkspace,
    openWorkspacePath,
    loadDirectoryChildren,
    selectFile,
    closeFileTab,
    closeAllFileTabs,
    reorderFileTabs,
    openNewTab,
    saveWorkspaceFile,
    saveDirtyWorkspaceFiles,
    reloadWorkspaceConflict,
    keepLocalWorkspaceConflict,
  };
};

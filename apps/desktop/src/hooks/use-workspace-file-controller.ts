import type { DocumentMode, WorkspaceConflictState, WorkspaceState } from "../types";
import type { WorkspaceFileEntry, WorkspaceHandle } from "../contracts";
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

// ─── Hook ───────────────────────────────────────────────────────────────

export const useWorkspaceFileController = () => {
  const initialSource = sampleSources[DEFAULT_SAMPLE_SOURCE_NAME];
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("empty");
  const [workspace, setWorkspace] = useState<WorkspaceHandle>(shellWorkspace);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(shellFiles);
  const [session, setSession] = useState(() =>
    createEditorSession(shellFiles[0], { source: initialSource }));
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceConflictState | null>(null);
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

  const loadWorkspace = async (nextWorkspace: WorkspaceHandle, messagePrefix: string) => {
    const nextFiles = await invokeCommand("list_workspace_files", { workspaceId: nextWorkspace.workspaceId });
    const usableFiles = nextFiles.length > 0 ? nextFiles : shellFiles;
    const firstFile = selectInitialWorkspaceFile(usableFiles);
    const shouldReadInitialFile = firstFile.kind === "file" && firstFile.chemdKind !== "asset";
    const nextContent = shouldReadInitialFile
      ? await invokeCommand("read_workspace_file", {
        workspaceId: nextWorkspace.workspaceId,
        path: firstFile.path,
      })
      : undefined;
    const nextSource = nextContent?.content ?? getSampleSource(firstFile);
    const nextContentHash = nextContent?.contentHash ?? null;
    setWorkspace(nextWorkspace);
    setFiles(usableFiles);
    setSession(createEditorSession(firstFile, {
      source: nextSource,
      savedContentHash: nextContentHash,
    }));
    setWorkspaceConflict(null);
    setRootPath(nextWorkspace.rootPath);
    setMode("workspace");
    setMessage(`${messagePrefix} ${usableFiles.length} workspace entries from the local workspace.`);
    setWorkspaceState("open");
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

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
  createScratchFile,
  getNextScratchFileIndex,
  isScratchFile,
} from "../features/workspace/scratch-file";
import { useCallback, useMemo, useRef, useState } from "react";

type OpenBuffer = {
  source: string;
  savedSource: string;
  savedContentHash: string | null;
};

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
  const [selectedFileId, setSelectedFileId] = useState(shellFiles[0].id);
  const [openedTabs, setOpenedTabs] = useState<WorkspaceFileEntry[]>([shellFiles[0]]);
  const [source, setSourceState] = useState(initialSource);
  const [savedSource, setSavedSource] = useState(initialSource);
  const [savedContentHash, setSavedContentHash] = useState<string | null>(null);
  const [openBuffers, setOpenBuffers] = useState<Record<string, OpenBuffer>>({
    [shellFiles[0].id]: {
      source: initialSource,
      savedSource: initialSource,
      savedContentHash: null,
    },
  });
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceConflictState | null>(null);
  const [mode, setMode] = useState<DocumentMode>("sample");
  const [rootPath, setRootPath] = useState("");
  const [message, setMessage] = useState("No workspace is open. Editing bundled sample content.");
  const selectedFileIdRef = useRef(selectedFileId);
  const selectFileRequestRef = useRef(0);
  selectedFileIdRef.current = selectedFileId;
  const selectedFile = openedTabs.find((file) => file.id === selectedFileId)
    ?? files.find((file) => file.id === selectedFileId)
    ?? shellFiles[0];
  const selectedBuffer = openBuffers[selectedFileId];
  const dirtyFileIds = useMemo(
    () => Object.entries(openBuffers)
      .filter(([, buffer]) => buffer.source !== buffer.savedSource)
      .map(([fileId]) => fileId),
    [openBuffers],
  );
  const dirtyWorkspaceFileIds = useMemo(
    () => {
      if (mode !== "workspace" || !workspace.writable) return [];
      return dirtyFileIds.filter((fileId) => {
        const file = openedTabs.find((entry) => entry.id === fileId)
          ?? files.find((entry) => entry.id === fileId);
        return file?.kind === "file" && !isScratchFile(file);
      });
    },
    [dirtyFileIds, files, mode, openedTabs, workspace.writable],
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
    setSelectedFileId(firstFile.id);
    setOpenedTabs([firstFile]);
    setSourceState(nextSource);
    setSavedSource(nextSource);
    setSavedContentHash(nextContentHash);
    setOpenBuffers({
      [firstFile.id]: {
        source: nextSource,
        savedSource: nextSource,
        savedContentHash: nextContentHash,
      },
    });
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
      setSelectedFileId(shellFiles[0].id);
      setOpenedTabs([shellFiles[0]]);
      setSourceState(initialSource);
      setSavedSource(initialSource);
      setSavedContentHash(null);
      setOpenBuffers({
        [shellFiles[0].id]: {
          source: initialSource,
          savedSource: initialSource,
          savedContentHash: null,
        },
      });
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
      const nextSource = existingBuffer?.source ?? nextContent?.content ?? getSampleSource(file);
      const nextSavedSource = existingBuffer?.savedSource ?? nextSource;
      const nextSavedContentHash = existingBuffer?.savedContentHash ?? nextContent?.contentHash ?? null;
      setSelectedFileId(file.id);
      setOpenedTabs((current) =>
        current.some((tab) => tab.id === file.id) ? current : [...current, file],
      );
      setSourceState(nextSource);
      setSavedSource(nextSavedSource);
      setSavedContentHash(nextSavedContentHash);
      setOpenBuffers((current) => (current[file.id]
        ? current
        : {
          ...current,
          [file.id]: {
            source: nextSource,
            savedSource: nextSavedSource,
            savedContentHash: nextSavedContentHash,
          },
        }));
      setWorkspaceConflict(null);
      setMessage(getFileSelectedMessage(file, mode));
    } catch (error: unknown) {
      setMessage(`Workspace read failed: ${getDisplayableError(error)}.`);
    }
  };

  const closeFileTab = async (fileId: string) => {
    const nextTabs = openedTabs.filter((tab) => tab.id !== fileId);
    if (nextTabs.length === openedTabs.length) return;
    if (nextTabs.length === 0) {
      setMessage("At least one editor tab must remain open.");
      return;
    }
    const closingTab = openedTabs.find((tab) => tab.id === fileId);
    const closingBuffer = openBuffers[fileId];
    if (closingTab && closingBuffer && closingBuffer.source !== closingBuffer.savedSource) {
      setMessage(`Save or discard changes in ${closingTab.name} before closing this tab.`);
      if (selectedFileId !== fileId) {
        await selectFile(closingTab);
      }
      return;
    }

    const closingIndex = openedTabs.findIndex((tab) => tab.id === fileId);
    setOpenedTabs(nextTabs);
    setOpenBuffers((current) => {
      const remaining = { ...current };
      delete remaining[fileId];
      return remaining;
    });

    if (selectedFileId !== fileId) return;
    const nextSelected = nextTabs[Math.min(closingIndex, nextTabs.length - 1)];
    await selectFile(nextSelected);
  };

  const reorderFileTabs = (orderedFileIds: readonly string[]) => {
    setOpenedTabs((current) => {
      if (orderedFileIds.length !== current.length) return current;
      if (new Set(orderedFileIds).size !== orderedFileIds.length) return current;
      const tabById = new Map(current.map((tab) => [tab.id, tab]));
      const next = orderedFileIds.map((fileId) => tabById.get(fileId));
      if (next.some((tab) => !tab)) return current;
      if (next.every((tab, index) => tab?.id === current[index].id)) return current;
      return next as WorkspaceFileEntry[];
    });
  };

  const openNewTab = async () => {
    const nextFile = createScratchFile(getNextScratchFileIndex(openedTabs));
    setSelectedFileId(nextFile.id);
    setOpenedTabs((current) => [...current, nextFile]);
    setSourceState("");
    setSavedSource("");
    setSavedContentHash(null);
    setOpenBuffers((current) => ({
      ...current,
      [nextFile.id]: {
        source: "",
        savedSource: "",
        savedContentHash: null,
      },
    }));
    setWorkspaceConflict(null);
    setMessage(`Created ${nextFile.name}.`);
  };

  const reloadWorkspaceConflict = async () => {
    if (!workspaceConflict || mode !== "workspace" || selectedFile.kind !== "file") return;
    setWorkspaceConflict((current) => current ? { ...current, reloading: true } : current);
    try {
      const nextContent = await invokeCommand("read_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: selectedFile.path,
      });
      setSourceState(nextContent.content);
      setSavedSource(nextContent.content);
      setSavedContentHash(nextContent.contentHash);
      setOpenBuffers((current) => ({
        ...current,
        [selectedFile.id]: {
          source: nextContent.content,
          savedSource: nextContent.content,
          savedContentHash: nextContent.contentHash,
        },
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

  const saveWorkspaceFile = useCallback(async (fileId = selectedFileId) => {
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
      const result = await invokeCommand("write_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: targetFile.path,
        content: targetBuffer.source,
        baseHash: targetBuffer.savedContentHash ?? undefined,
      });
      if (fileId === selectedFileIdRef.current) {
        setSavedSource(targetBuffer.source);
        setSavedContentHash(result.contentHash);
      }
      setOpenBuffers((current) => {
        const currentBuffer = current[fileId];
        if (!currentBuffer) return current;
        return {
          ...current,
          [fileId]: {
            source: currentBuffer.source,
            savedSource: targetBuffer.source,
            savedContentHash: result.contentHash,
          },
        };
      });
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

  const saveDirtyWorkspaceFiles = useCallback(async () => {
    for (const fileId of dirtyWorkspaceFileIds) {
      await saveWorkspaceFile(fileId);
    }
  }, [dirtyWorkspaceFileIds, saveWorkspaceFile]);

  const setSource = (nextSource: string) => {
    setSourceState(nextSource);
    setOpenBuffers((current) => {
      const currentBuffer = current[selectedFileId] ?? {
        source,
        savedSource,
        savedContentHash,
      };
      return {
        ...current,
        [selectedFileId]: {
          ...currentBuffer,
          source: nextSource,
        },
      };
    });
  };

  return {
    workspaceState,
    workspace,
    files,
    openedTabs,
    dirtyFileIds,
    dirtyWorkspaceFileIds,
    selectedFile,
    selectedFileId,
    source,
    savedSource,
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
    reorderFileTabs,
    openNewTab,
    saveWorkspaceFile,
    saveDirtyWorkspaceFiles,
    reloadWorkspaceConflict,
    keepLocalWorkspaceConflict,
  };
};

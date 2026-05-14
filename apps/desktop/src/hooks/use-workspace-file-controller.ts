import type { DocumentMode, WorkspaceConflictState, WorkspaceState } from "../desktop-types";
import type { WorkspaceFileEntry, WorkspaceHandle } from "../desktop-contracts";
import { shellFiles, shellWorkspace } from "../desktop-contracts";
import {
  getCommandErrorCode,
  getDisplayableError,
  getSampleSource,
  invokeDesktop,
  sampleSources,
} from "../desktop-utils";
import { useState } from "react";

// ─── Hook ───────────────────────────────────────────────────────────────

export const useWorkspaceFileController = () => {
  const initialSource = sampleSources["suzuki-screen.chemd.md"];
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("empty");
  const [workspace, setWorkspace] = useState<WorkspaceHandle>(shellWorkspace);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(shellFiles);
  const [selectedFileId, setSelectedFileId] = useState(shellFiles[0].id);
  const [source, setSource] = useState(initialSource);
  const [savedSource, setSavedSource] = useState(initialSource);
  const [savedContentHash, setSavedContentHash] = useState<string | null>(null);
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceConflictState | null>(null);
  const [mode, setMode] = useState<DocumentMode>("sample");
  const [rootPath, setRootPath] = useState("");
  const [message, setMessage] = useState("No workspace is open. Editing bundled sample content.");
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? shellFiles[0];
  const canSave = mode === "workspace" && selectedFile.kind === "file" && source !== savedSource && workspace.writable;

  const openWorkspace = async () => {
    setWorkspaceState("opening");
    try {
      const nextWorkspace = await invokeDesktop("open_workspace", { rootPath: rootPath.trim() });
      const nextFiles = await invokeDesktop("list_workspace_files", { workspaceId: nextWorkspace.workspaceId });
      const usableFiles = nextFiles.length > 0 ? nextFiles : shellFiles;
      const firstFile = usableFiles.find((file) => file.kind === "file") ?? usableFiles[0];
      const nextContent = firstFile.kind === "file"
        ? await invokeDesktop("read_workspace_file", {
          workspaceId: nextWorkspace.workspaceId,
          path: firstFile.path,
        })
        : undefined;
      const nextSource = nextContent?.content ?? getSampleSource(firstFile);
      const nextContentHash = nextContent?.contentHash ?? null;
      setWorkspace(nextWorkspace);
      setFiles(usableFiles);
      setSelectedFileId(firstFile.id);
      setSource(nextSource);
      setSavedSource(nextSource);
      setSavedContentHash(nextContentHash);
      setWorkspaceConflict(null);
      setRootPath(nextWorkspace.rootPath);
      setMode("workspace");
      setMessage(`Opened ${usableFiles.length} visible Markdown entries from the local workspace.`);
      setWorkspaceState("open");
    } catch (error: unknown) {
      setWorkspace(shellWorkspace);
      setFiles(shellFiles);
      setMode("sample");
      setMessage(`Workspace open failed: ${getDisplayableError(error)}. Using bundled sample content.`);
      setWorkspaceState("error");
    }
  };

  const selectFile = async (file: WorkspaceFileEntry) => {
    if (file.kind !== "file") return;
    try {
      const nextContent = mode === "workspace"
        ? await invokeDesktop("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path,
        })
        : undefined;
      const nextSource = nextContent?.content ?? getSampleSource(file);
      setSelectedFileId(file.id);
      setSource(nextSource);
      setSavedSource(nextSource);
      setSavedContentHash(nextContent?.contentHash ?? null);
      setWorkspaceConflict(null);
      setMessage(mode === "sample" ? "Sample document selected from bundled fallback." : `Read ${file.path} from the local workspace.`);
    } catch (error: unknown) {
      setMessage(`Workspace read failed: ${getDisplayableError(error)}.`);
    }
  };

  const reloadWorkspaceConflict = async () => {
    if (!workspaceConflict || mode !== "workspace" || selectedFile.kind !== "file") return;
    setWorkspaceConflict((current) => current ? { ...current, reloading: true } : current);
    try {
      const nextContent = await invokeDesktop("read_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: selectedFile.path,
      });
      setSource(nextContent.content);
      setSavedSource(nextContent.content);
      setSavedContentHash(nextContent.contentHash);
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

  const saveWorkspaceFile = async () => {
    if (!canSave) return;
    try {
      const result = await invokeDesktop("write_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: selectedFile.path,
        content: source,
        baseHash: savedContentHash ?? undefined,
      });
      setSavedSource(source);
      setSavedContentHash(result.contentHash);
      setWorkspaceConflict(null);
      setMessage(`Saved ${result.path} (${result.bytes} bytes).`);
    } catch (error: unknown) {
      if (getCommandErrorCode(error) === "workspace_file_conflict") {
        setWorkspaceConflict({
          path: selectedFile.path,
          message: "The file changed on disk after this buffer was loaded. Reload from disk or keep editing the local buffer.",
          detectedAt: new Date().toISOString(),
          reloading: false,
        });
        setMessage("Workspace save conflict. Local editor content was not overwritten.");
        return;
      }
      setMessage(`Workspace save failed: ${getDisplayableError(error)}.`);
    }
  };

  return {
    workspaceState,
    workspace,
    files,
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
    selectFile,
    saveWorkspaceFile,
    reloadWorkspaceConflict,
    keepLocalWorkspaceConflict,
  };
};

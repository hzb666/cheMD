import type { WorkspaceFileEntry } from "../contracts";
import {
  createScratchFile,
  getNextScratchFileIndex,
  isScratchFile,
} from "../features/workspace/scratch-file";

export type EditorSessionBuffer = {
  source: string;
  savedSource: string;
  savedContentHash: string | null;
  savedAt: string | null;
};

export type EditorSessionState = {
  selectedFileId: string;
  openedTabs: WorkspaceFileEntry[];
  source: string;
  savedSource: string;
  savedContentHash: string | null;
  savedAt: string | null;
  openBuffers: Record<string, EditorSessionBuffer>;
};

type LoadedEditorSessionContent = {
  source: string;
  savedSource?: string;
  savedContentHash?: string | null;
  savedAt?: string | null;
};

type SavedEditorSessionContent = {
  contentHash: string;
  savedAt: string;
};

export type CloseEditorSessionResult = {
  closed: boolean;
  session: EditorSessionState;
  blockedTab?: WorkspaceFileEntry;
};

export const createEditorSessionBuffer = ({
  source,
  savedSource = source,
  savedContentHash = null,
  savedAt = null,
}: LoadedEditorSessionContent): EditorSessionBuffer => ({
  source,
  savedSource,
  savedContentHash,
  savedAt,
});

export const createEditorSession = (
  file: WorkspaceFileEntry,
  content: LoadedEditorSessionContent,
): EditorSessionState => {
  const buffer = createEditorSessionBuffer(content);
  return {
    selectedFileId: file.id,
    openedTabs: [file],
    source: buffer.source,
    savedSource: buffer.savedSource,
    savedContentHash: buffer.savedContentHash,
    savedAt: buffer.savedAt,
    openBuffers: {
      [file.id]: buffer,
    },
  };
};

export const getSelectedEditorSessionFile = (
  session: EditorSessionState,
  files: readonly WorkspaceFileEntry[],
  fallback: WorkspaceFileEntry,
): WorkspaceFileEntry =>
  session.openedTabs.find((file) => file.id === session.selectedFileId)
  ?? files.find((file) => file.id === session.selectedFileId)
  ?? fallback;

export const getDirtyEditorSessionFileIds = (
  session: EditorSessionState,
): string[] =>
  Object.entries(session.openBuffers)
    .filter(([, buffer]) => buffer.source !== buffer.savedSource)
    .map(([fileId]) => fileId);

export const getEditorSessionFileById = (
  session: EditorSessionState,
  files: readonly WorkspaceFileEntry[],
  fileId: string,
): WorkspaceFileEntry | undefined =>
  session.openedTabs.find((file) => file.id === fileId)
  ?? files.find((file) => file.id === fileId);

export const getDirtyWorkspaceEditorSessionFileIds = (
  session: EditorSessionState,
  files: readonly WorkspaceFileEntry[],
  writable: boolean,
): string[] => {
  if (!writable) return [];
  return getDirtyEditorSessionFileIds(session).filter((fileId) => {
    const file = getEditorSessionFileById(session, files, fileId);
    return file?.kind === "file" && !isScratchFile(file);
  });
};

export const updateEditorSessionSource = (
  session: EditorSessionState,
  nextSource: string,
): EditorSessionState => {
  const currentBuffer = session.openBuffers[session.selectedFileId]
    ?? createEditorSessionBuffer({
      source: session.source,
      savedSource: session.savedSource,
      savedContentHash: session.savedContentHash,
      savedAt: session.savedAt,
    });
  const nextBuffer = {
    ...currentBuffer,
    source: nextSource,
  };
  return {
    ...session,
    source: nextSource,
    openBuffers: {
      ...session.openBuffers,
      [session.selectedFileId]: nextBuffer,
    },
  };
};

export const selectEditorSessionFile = (
  session: EditorSessionState,
  file: WorkspaceFileEntry,
  content: LoadedEditorSessionContent,
): EditorSessionState => {
  const existingBuffer = session.openBuffers[file.id];
  const nextBuffer = existingBuffer ?? createEditorSessionBuffer(content);
  return {
    ...session,
    selectedFileId: file.id,
    openedTabs: session.openedTabs.some((tab) => tab.id === file.id)
      ? session.openedTabs
      : [...session.openedTabs, file],
    source: nextBuffer.source,
    savedSource: nextBuffer.savedSource,
    savedContentHash: nextBuffer.savedContentHash,
    savedAt: nextBuffer.savedAt,
    openBuffers: existingBuffer
      ? session.openBuffers
      : {
        ...session.openBuffers,
        [file.id]: nextBuffer,
      },
  };
};

export const markEditorSessionFileSaved = (
  session: EditorSessionState,
  fileId: string,
  saved: SavedEditorSessionContent,
): EditorSessionState => {
  const currentBuffer = session.openBuffers[fileId];
  if (!currentBuffer) return session;
  const nextBuffer = {
    source: currentBuffer.source,
    savedSource: currentBuffer.source,
    savedContentHash: saved.contentHash,
    savedAt: saved.savedAt,
  };
  return {
    ...session,
    source: fileId === session.selectedFileId ? nextBuffer.source : session.source,
    savedSource: fileId === session.selectedFileId ? nextBuffer.savedSource : session.savedSource,
    savedContentHash: fileId === session.selectedFileId
      ? nextBuffer.savedContentHash
      : session.savedContentHash,
    savedAt: fileId === session.selectedFileId ? nextBuffer.savedAt : session.savedAt,
    openBuffers: {
      ...session.openBuffers,
      [fileId]: nextBuffer,
    },
  };
};

export const replaceEditorSessionFileContent = (
  session: EditorSessionState,
  fileId: string,
  content: LoadedEditorSessionContent,
): EditorSessionState => {
  if (!session.openBuffers[fileId]) return session;
  const nextBuffer = createEditorSessionBuffer(content);
  return {
    ...session,
    source: fileId === session.selectedFileId ? nextBuffer.source : session.source,
    savedSource: fileId === session.selectedFileId ? nextBuffer.savedSource : session.savedSource,
    savedContentHash: fileId === session.selectedFileId
      ? nextBuffer.savedContentHash
      : session.savedContentHash,
    savedAt: fileId === session.selectedFileId ? nextBuffer.savedAt : session.savedAt,
    openBuffers: {
      ...session.openBuffers,
      [fileId]: nextBuffer,
    },
  };
};

export const closeEditorSessionTab = (
  session: EditorSessionState,
  fileId: string,
): CloseEditorSessionResult => {
  const closingIndex = session.openedTabs.findIndex((tab) => tab.id === fileId);
  if (closingIndex < 0) return { closed: false, session };
  if (session.openedTabs.length === 1) return { closed: false, session };
  const closingTab = session.openedTabs[closingIndex];
  const closingBuffer = session.openBuffers[fileId];
  if (closingBuffer && closingBuffer.source !== closingBuffer.savedSource) {
    return { closed: false, session, blockedTab: closingTab };
  }

  const openedTabs = session.openedTabs.filter((tab) => tab.id !== fileId);
  const openBuffers = { ...session.openBuffers };
  delete openBuffers[fileId];
  if (session.selectedFileId !== fileId) {
    return { closed: true, session: { ...session, openedTabs, openBuffers } };
  }

  const nextSelected = openedTabs[Math.min(closingIndex, openedTabs.length - 1)];
  const nextBuffer = openBuffers[nextSelected.id];
  return {
    closed: true,
    session: {
      ...session,
      selectedFileId: nextSelected.id,
      openedTabs,
      source: nextBuffer?.source ?? "",
      savedSource: nextBuffer?.savedSource ?? "",
      savedContentHash: nextBuffer?.savedContentHash ?? null,
      savedAt: nextBuffer?.savedAt ?? null,
      openBuffers,
    },
  };
};

export const closeAllEditorSessionTabs = (
  session: EditorSessionState,
): CloseEditorSessionResult => {
  const blockedTab = session.openedTabs.find((tab) => {
    const buffer = session.openBuffers[tab.id];
    return buffer && buffer.source !== buffer.savedSource;
  });
  if (blockedTab) return { closed: false, session, blockedTab };

  const scratchFile = createScratchFile(getNextScratchFileIndex(session.openedTabs));
  return {
    closed: true,
    session: createEditorSession(scratchFile, { source: "" }),
  };
};

export const openScratchEditorSessionTab = (
  session: EditorSessionState,
): EditorSessionState => {
  const scratchFile = createScratchFile(getNextScratchFileIndex(session.openedTabs));
  return selectEditorSessionFile(session, scratchFile, { source: "" });
};

export const reorderEditorSessionTabs = (
  session: EditorSessionState,
  orderedFileIds: readonly string[],
): EditorSessionState => {
  if (orderedFileIds.length !== session.openedTabs.length) return session;
  if (new Set(orderedFileIds).size !== orderedFileIds.length) return session;
  const tabById = new Map(session.openedTabs.map((tab) => [tab.id, tab]));
  const openedTabs = orderedFileIds.map((fileId) => tabById.get(fileId));
  if (openedTabs.some((tab) => !tab)) return session;
  if (openedTabs.every((tab, index) => tab?.id === session.openedTabs[index].id)) {
    return session;
  }
  return {
    ...session,
    openedTabs: openedTabs as WorkspaceFileEntry[],
  };
};

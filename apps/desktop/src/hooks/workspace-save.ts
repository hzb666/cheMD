import { createEditorSourceHash } from "../utils";

export type WorkspaceFileSaveRequest = {
  command: "write_workspace_file";
  input: {
    workspaceId?: string;
    path: string;
    content: string;
    baseHash?: string;
  };
};

type DirtyBufferSource = {
  source: string;
};

export type WorkspaceSaveSingleFlight = {
  run: (operation: () => Promise<void>) => Promise<void>;
  isSaving: () => boolean;
};

export const buildWorkspaceFileSaveRequest = ({
  workspaceId,
  path,
  content,
  baseHash,
}: {
  workspaceId?: string;
  path: string;
  content: string;
  baseHash: string | null;
}): WorkspaceFileSaveRequest => ({
  command: "write_workspace_file",
  input: {
    workspaceId,
    path,
    content,
    baseHash: baseHash ?? undefined,
  },
});

export const createWorkspaceSaveSingleFlight = (): WorkspaceSaveSingleFlight => {
  let currentSave: Promise<void> | null = null;

  return {
    run: (operation) => {
      if (currentSave) return currentSave;
      const save = operation().finally(() => {
        if (currentSave === save) {
          currentSave = null;
        }
      });
      currentSave = save;
      return save;
    },
    isSaving: () => currentSave !== null,
  };
};

export const createDirtyWorkspaceFileSignature = (
  dirtyWorkspaceFileIds: readonly string[],
  openBuffers: Record<string, DirtyBufferSource | undefined>,
): string =>
  dirtyWorkspaceFileIds
    .map((fileId) => `${fileId}:${createEditorSourceHash(openBuffers[fileId]?.source ?? "")}`)
    .join("\u001f");

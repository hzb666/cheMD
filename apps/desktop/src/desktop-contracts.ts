export type RuntimeState = "ready" | "placeholder" | "degraded" | "offline";

export interface WorkspaceHandle {
  workspaceId: string;
  displayName: string;
  rootHint: string;
  writable: boolean;
}

export interface WorkspaceFileEntry {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory";
  chemdKind?: "document" | "asset" | "unknown";
}

export interface SidecarStatus {
  state: RuntimeState;
  label: string;
  detail: string;
  pid: number | null;
}

export interface DesktopCommandMap {
  open_workspace: {
    input: void;
    output: WorkspaceHandle;
  };
  list_workspace_files: {
    input: {
      workspaceId: string;
    };
    output: WorkspaceFileEntry[];
  };
  read_sidecar_status: {
    input: void;
    output: SidecarStatus;
  };
}

export const shellWorkspace: WorkspaceHandle = {
  workspaceId: "placeholder-workspace",
  displayName: "No workspace selected",
  rootHint: "Use Tauri open_workspace in Phase 1",
  writable: false
};

export const shellFiles: WorkspaceFileEntry[] = [
  {
    id: "exp-001",
    name: "suzuki-screen.chemd.md",
    path: "/workspace/experiments/suzuki-screen.chemd.md",
    kind: "file",
    chemdKind: "document"
  },
  {
    id: "exp-002",
    name: "materials",
    path: "/workspace/materials",
    kind: "directory"
  },
  {
    id: "exp-003",
    name: "calibration.chemd.md",
    path: "/workspace/experiments/calibration.chemd.md",
    kind: "file",
    chemdKind: "document"
  }
];

export const shellSidecarStatus: SidecarStatus = {
  state: "placeholder",
  label: "Sidecar idle",
  detail: "chem-service lifecycle boundary is declared but not connected",
  pid: null
};

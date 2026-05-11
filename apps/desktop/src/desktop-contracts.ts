export type RuntimeState = "ready" | "placeholder" | "degraded" | "offline";

export interface WorkspaceHandle {
  workspaceId: string;
  displayName: string;
  rootPath: string;
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
  startedAt: string | null;
  logTail: string[];
}

export interface SidecarLogs {
  lines: string[];
}

export interface DesktopCommandError {
  code: string;
  message: string;
  detail?: string;
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  bytes: number;
  chemdKind?: "document" | "asset" | "unknown";
}

export interface WorkspaceWriteResult {
  path: string;
  bytes: number;
  chemdKind?: "document" | "asset" | "unknown";
}

export interface DesktopCommandMap {
  open_workspace: {
    input: {
      rootPath?: string;
    };
    output: WorkspaceHandle;
  };
  list_workspace_files: {
    input: {
      workspaceId?: string;
      rootPath?: string;
    };
    output: WorkspaceFileEntry[];
  };
  read_workspace_file: {
    input: {
      workspaceId?: string;
      rootPath?: string;
      path: string;
    };
    output: WorkspaceFileContent;
  };
  write_workspace_file: {
    input: {
      workspaceId?: string;
      rootPath?: string;
      path: string;
      content: string;
    };
    output: WorkspaceWriteResult;
  };
  start_sidecar: {
    input: void;
    output: SidecarStatus;
  };
  stop_sidecar: {
    input: void;
    output: SidecarStatus;
  };
  read_sidecar_status: {
    input: void;
    output: SidecarStatus;
  };
  read_sidecar_logs: {
    input: void;
    output: SidecarLogs;
  };
}

export const shellWorkspace: WorkspaceHandle = {
  workspaceId: "placeholder-workspace",
  displayName: "No workspace selected",
  rootPath: "",
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
  pid: null,
  startedAt: null,
  logTail: []
};

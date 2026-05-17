import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  CommandMap,
  ManagedPostgresStatus,
  PostgresStatus,
} from "../contracts";
import { shellPostgresStatus } from "../contracts";
import type {
  ManagedPostgresOperation,
  PersistControllerInput,
  PersistState,
  PostgresProfilePanelController,
} from "../types";
import {
  buildPersistCommandInput,
  getPostgresErrorMessage,
  getPersistDisabledReason,
  getPersistErrorMessage,
  initialManagedPostgresStatus,
  initialPersistState,
  invokeCommand,
} from "../utils";
import {
  buildPostgresProfileRows,
  buildPostgresProfileSaveInput,
  clearPostgresProfilePassword,
  createInitialPostgresProfileForm,
  createPostgresProfileFormFromProfile,
  initialPostgresProfilesState,
  toPostgresProfileCommandError,
  toPostgresProfileValidationError,
  type PostgresProfileCommandError,
  type PostgresProfileForm,
  type PostgresProfileOperation,
} from "../features/postgres/profiles";

type ManagedPostgresCommand = keyof Pick<
  CommandMap,
  "initialize_managed_postgres" | "start_managed_postgres" | "stop_managed_postgres" | "migrate_managed_postgres" | "read_managed_postgres_status"
>;

type PostgresProfilesState = CommandMap["list_postgres_profiles"]["output"];

const managedPostgresCommandByOperation: Record<ManagedPostgresOperation, ManagedPostgresCommand> = {
  init: "initialize_managed_postgres",
  start: "start_managed_postgres",
  stop: "stop_managed_postgres",
  migrate: "migrate_managed_postgres",
  refresh: "read_managed_postgres_status"
};

const buildPostgresProfilePanel = ({
  activateProfile,
  bindWorkspaceProfile,
  deleteProfile,
  editProfile,
  profileError,
  profileForm,
  profileMessage,
  profileOperation,
  profilesState,
  refreshProfiles,
  saveProfile,
  setProfileError,
  setProfileForm,
  setProfileMessage,
  workspaceId,
}: {
  activateProfile: (profileId: string) => Promise<void>;
  bindWorkspaceProfile: (profileId: string | null) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  editProfile: (profileId: string) => void;
  profileError: PostgresProfileCommandError | null;
  profileForm: PostgresProfileForm;
  profileMessage: string | null;
  profileOperation: PostgresProfileOperation | null;
  profilesState: PostgresProfilesState;
  refreshProfiles: () => Promise<void>;
  saveProfile: () => Promise<void>;
  setProfileError: (error: PostgresProfileCommandError | null) => void;
  setProfileForm: Dispatch<SetStateAction<PostgresProfileForm>>;
  setProfileMessage: (message: string | null) => void;
  workspaceId?: string | null;
}): PostgresProfilePanelController => {
  const normalizedWorkspaceId = workspaceId?.trim() || null;

  return {
    state: profilesState,
    rows: buildPostgresProfileRows(profilesState),
    currentWorkspaceId: normalizedWorkspaceId,
    currentWorkspaceProfileId: normalizedWorkspaceId
      ? profilesState.workspaceProfileBindings[normalizedWorkspaceId] ?? null
      : null,
    form: profileForm,
    operation: profileOperation,
    error: profileError,
    message: profileMessage,
    onFormChange: (patch: Partial<PostgresProfileForm>) => setProfileForm((current) => ({
      ...current,
      ...patch
    })),
    onResetForm: () => {
      setProfileForm(createInitialPostgresProfileForm());
      setProfileError(null);
      setProfileMessage("New Postgres profile form is ready. Password remains empty until entered.");
    },
    onEditProfile: editProfile,
    onSaveProfile: () => void saveProfile(),
    onActivateProfile: (profileId: string) => void activateProfile(profileId),
    onBindWorkspaceProfile: (profileId: string) => void bindWorkspaceProfile(profileId),
    onClearWorkspaceProfile: () => void bindWorkspaceProfile(null),
    onDeleteProfile: (profileId: string) => void deleteProfile(profileId),
    onRefreshProfiles: () => void refreshProfiles()
  };
};


export const usePostgresProfileController = (
  onRuntimeStatusChange: () => Promise<void>,
  workspaceId?: string | null
): { panel: PostgresProfilePanelController; readProfiles: () => Promise<PostgresProfilesState | null> } => {
  const [profilesState, setProfilesState] = useState(initialPostgresProfilesState);
  const [profileForm, setProfileForm] = useState(createInitialPostgresProfileForm);
  const [profileOperation, setProfileOperation] = useState<PostgresProfileOperation | null>(null);
  const [profileError, setProfileError] = useState<PostgresProfileCommandError | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const profileOperationRef = useRef<PostgresProfileOperation | null>(null);

  const readProfiles = async () => {
    try {
      const nextProfiles = await invokeCommand("list_postgres_profiles", undefined);
      setProfilesState(nextProfiles);
      setProfileError(null);
      return nextProfiles;
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("list", nextError, "Postgres profiles unavailable"));
      return null;
    }
  };

  const refreshProfiles = async () => {
    if (profileOperationRef.current) return;
    profileOperationRef.current = "list";
    setProfileOperation("list");
    setProfileMessage(null);
    try {
      const nextProfiles = await readProfiles();
      if (nextProfiles) {
        setProfileMessage(`Loaded ${nextProfiles.profiles.length} Postgres profiles.`);
      }
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const saveProfile = async () => {
    if (profileOperationRef.current) return;
    const saveInput = buildPostgresProfileSaveInput(profileForm);
    if (!saveInput.ok) {
      setProfileError(toPostgresProfileValidationError("save", saveInput.message));
      setProfileMessage(null);
      return;
    }
    profileOperationRef.current = "save";
    setProfileOperation("save");
    setProfileMessage(null);
    try {
      const nextProfiles = await invokeCommand("save_postgres_profile", { input: saveInput.input });
      setProfilesState(nextProfiles);
      setProfileForm((current) => clearPostgresProfilePassword(current));
      setProfileError(null);
      setProfileMessage("Postgres profile saved. Password input was cleared.");
      await onRuntimeStatusChange();
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("save", nextError, "Postgres profile save failed"));
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const activateProfile = async (profileId: string) => {
    if (profileOperationRef.current) return;
    profileOperationRef.current = "activate";
    setProfileOperation("activate");
    setProfileMessage(null);
    try {
      const nextProfiles = await invokeCommand("activate_postgres_profile", { profileId });
      setProfilesState(nextProfiles);
      setProfileError(null);
      setProfileMessage("Postgres profile activated.");
      await onRuntimeStatusChange();
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("activate", nextError, "Postgres profile activation failed"));
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const bindWorkspaceProfile = async (profileId: string | null) => {
    const normalizedWorkspaceId = workspaceId?.trim();
    if (profileOperationRef.current || !normalizedWorkspaceId) return;
    profileOperationRef.current = "bind";
    setProfileOperation("bind");
    setProfileMessage(null);
    try {
      const nextProfiles = await invokeCommand("bind_workspace_postgres_profile", {
        input: {
          workspaceId: normalizedWorkspaceId,
          profileId
        }
      });
      setProfilesState(nextProfiles);
      setProfileError(null);
      setProfileMessage(profileId ? "Workspace Postgres profile bound." : "Workspace Postgres profile binding cleared.");
      await onRuntimeStatusChange();
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("bind", nextError, "Workspace Postgres binding failed"));
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const deleteProfile = async (profileId: string) => {
    if (profileOperationRef.current) return;
    profileOperationRef.current = "delete";
    setProfileOperation("delete");
    setProfileMessage(null);
    try {
      const nextProfiles = await invokeCommand("delete_postgres_profile", { profileId });
      setProfilesState(nextProfiles);
      setProfileForm((current) => current.profileId === profileId ? createInitialPostgresProfileForm() : current);
      setProfileError(null);
      setProfileMessage("Postgres profile deleted. Active profile state was refreshed.");
      await onRuntimeStatusChange();
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("delete", nextError, "Postgres profile delete failed"));
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const editProfile = (profileId: string) => {
    const profile = profilesState.profiles.find((item) => item.profileId === profileId);
    if (!profile) return;
    setProfileForm(createPostgresProfileFormFromProfile(profile));
    setProfileError(null);
    setProfileMessage("Editing saved profile metadata. Saved passwords are never displayed.");
  };

  return {
    readProfiles,
    panel: buildPostgresProfilePanel({
      activateProfile, bindWorkspaceProfile, deleteProfile, editProfile,
      profileError, profileForm, profileMessage, profileOperation,
      profilesState, refreshProfiles, saveProfile,
      setProfileError, setProfileForm, setProfileMessage, workspaceId,
    })
  };
};


export const usePostgresController = ({
  workspaceId,
  workspaceMode
}: {
  workspaceId?: string | null;
  workspaceMode?: string;
} = {}) => {
  const [status, setStatus] = useState<PostgresStatus>(shellPostgresStatus);
  const [managedStatus, setManagedStatus] = useState<ManagedPostgresStatus>(initialManagedPostgresStatus);
  const [loading, setLoading] = useState(false);
  const [managedOperation, setManagedOperation] = useState<ManagedPostgresOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managedError, setManagedError] = useState<string | null>(null);
  const [managedMessage, setManagedMessage] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const managedOperationRef = useRef<ManagedPostgresOperation | null>(null);

  const readRuntimeStatus = async () => {
    try {
      const normalizedWorkspaceId = workspaceMode === "workspace" ? workspaceId?.trim() : "";
      const nextStatus = normalizedWorkspaceId
        ? await invokeCommand("read_workspace_postgres_status", { workspaceId: normalizedWorkspaceId })
        : await invokeCommand("read_postgres_status", undefined);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError: unknown) {
      setStatus(shellPostgresStatus);
      setError(getPostgresErrorMessage(nextError));
    }
  };

  const readManagedStatus = async () => {
    try {
      const nextStatus = await invokeCommand("read_managed_postgres_status", undefined);
      setManagedStatus(nextStatus);
      setManagedError(null);
    } catch (nextError: unknown) {
      setManagedStatus(initialManagedPostgresStatus);
      setManagedError(getPostgresErrorMessage(nextError));
    }
  };

  const profileController = usePostgresProfileController(readRuntimeStatus, workspaceId);

  const refresh = async () => {
    if (loadingRef.current || managedOperationRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      await Promise.all([readRuntimeStatus(), readManagedStatus(), profileController.readProfiles()]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const runManagedCommand = async (operation: ManagedPostgresOperation) => {
    if (loadingRef.current || managedOperationRef.current) return;
    managedOperationRef.current = operation;
    setManagedOperation(operation);
    setManagedMessage(null);
    try {
      const command = managedPostgresCommandByOperation[operation];
      const nextStatus = await invokeCommand(command, undefined);
      setManagedStatus(nextStatus);
      setManagedError(null);
      const actionLabel: Record<ManagedPostgresOperation, string> = {
        init: "initialized",
        start: "started",
        stop: "stopped",
        migrate: "migrated",
        refresh: "refreshed"
      };
      setManagedMessage(`Managed Postgres ${actionLabel[operation]}.`);
      await readRuntimeStatus();
    } catch (nextError: unknown) {
      setManagedError(getPostgresErrorMessage(nextError));
    } finally {
      managedOperationRef.current = null;
      setManagedOperation(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, [workspaceId, workspaceMode]);

  return {
    status,
    managedStatus,
    loading,
    managedOperation,
    error,
    managedError,
    managedMessage,
    profiles: profileController.panel,
    refresh: () => void refresh(),
    initializeManaged: () => void runManagedCommand("init"),
    startManaged: () => void runManagedCommand("start"),
    stopManaged: () => void runManagedCommand("stop"),
    migrateManaged: () => void runManagedCommand("migrate"),
    refreshManaged: () => void runManagedCommand("refresh")
  };
};


export const usePersistRuntimeController = ({
  mode,
  file,
  postgresStatus,
  source,
  workspace,
  compileOutput,
  agentRun
}: PersistControllerInput) => {
  const [state, setState] = useState<PersistState>(initialPersistState);
  const disabledReason = getPersistDisabledReason({
    mode,
    file,
    postgresStatus,
    compileStatus: compileOutput.status
  });

  useEffect(() => {
    setState(initialPersistState);
  }, [mode, file.id]);

  const reset = () => setState(initialPersistState);
  const persist = async () => {
    if (disabledReason !== null || compileOutput.status === "failed") {
      setState({ state: "failure", message: disabledReason ?? "Compile failed.", summary: null });
      return;
    }
    setState({ state: "pending", message: "Persisting Graph/RAG payload to Postgres.", summary: null });
    try {
      const input = buildPersistCommandInput({ source, workspace, file, compileOutput, agentRun });
      const result = await invokeCommand("persist_runtime_graph_rag", input);
      setState({
        state: "success",
        message: result.detail || "Persisted Graph/RAG payload.",
        summary: { graphSnapshotId: result.graphSnapshotId, counts: result.counts }
      });
    } catch (error: unknown) {
      setState({ state: "failure", message: getPersistErrorMessage(error), summary: null });
    }
  };

  return {
    state,
    disabledReason,
    reset,
    persist: () => void persist()
  };
};

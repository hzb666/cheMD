import { ChangeEvent as ReactChangeEvent } from "react";
import { CheckCircle2, FileCode2, PlayCircle, RefreshCw, Settings, ShieldCheck, Square, UploadCloud, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { PanelHeader } from "@/components/PanelHeader";
import { FieldGrid } from "@/components/FieldGrid";
import type { PostgresStatus, ManagedPostgresStatus } from "../desktop-contracts";
import type {
  ManagedPostgresOperation,
  PersistState,
  PostgresField,
  PostgresProfilePanelController,
} from "../desktop-types";
import type { PostgresProfileForm } from "../desktop-postgres-profiles";
import {
  getActivePostgresTarget,
  getExternalConfigured,
  getExternalPostgresFields,
  getManagedPostgresControlState,
  getManagedPostgresFields,
  getPostgresTargetMessage,
  summarizeGraphSnapshotId,
  formatPersistCounts,
} from "../desktop-utils";
import { buildExternalPostgresReadiness, buildManagedPostgresReadiness, type PostgresReadinessItem } from "../desktop-postgres-status";

// ---------------------------------------------------------------------------
// Local Postgres helper
// ---------------------------------------------------------------------------

const getManagedPostgresUnavailableMessage = (status: ManagedPostgresStatus): string | null => {
  if (status.available) return null;
  const reason = status.reason ?? status.detail;
  return reason.includes("CHEMD_MANAGED_POSTGRES_BIN_DIR")
    ? reason
    : `${reason}. Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries.`;
};

// ---------------------------------------------------------------------------
// PostgresControlButton
// ---------------------------------------------------------------------------

export const PostgresControlButton = ({
  label,
  loadingLabel,
  icon: Icon,
  operation,
  activeOperation,
  disabled,
  onClick
}: {
  label: string;
  loadingLabel: string;
  icon: typeof RefreshCw;
  operation: ManagedPostgresOperation;
  activeOperation: ManagedPostgresOperation | null;
  disabled: boolean;
  onClick: () => void;
}) => {
  const loading = activeOperation === operation;
  return (
    <Button variant="outline" size="sm" disabled={disabled} aria-busy={loading} onClick={onClick}>
      <Icon size={14} />
      <span>{loading ? loadingLabel : label}</span>
    </Button>
  );
};

// ---------------------------------------------------------------------------
// PostgresFieldGrid
// ---------------------------------------------------------------------------

export const PostgresFieldGrid = ({ fields }: { fields: PostgresField[] }) => (
  <FieldGrid fields={fields} />
);

// ---------------------------------------------------------------------------
// PostgresReadinessList
// ---------------------------------------------------------------------------

export const PostgresReadinessList = ({ items }: { items: PostgresReadinessItem[] }) => (
  <div className="desktop-postgres-readiness" aria-label="Postgres migration readiness">
    {items.map((item) => (
      <div key={item.id} data-tone={item.tone}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.reason}</small>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// ExternalPostgresSection
// ---------------------------------------------------------------------------

export const ExternalPostgresSection = ({ status }: { status: PostgresStatus }) => {
  const externalConfigured = getExternalConfigured(status);
  const readiness = buildExternalPostgresReadiness(status);
  return (
    <div className="desktop-postgres-subpanel">
      <div className="desktop-postgres-subhead">
        <span>External Postgres</span>
        <small>{externalConfigured ? "priority target" : "not selected"}</small>
      </div>
      <PostgresReadinessList items={readiness} />
      <PostgresFieldGrid fields={getExternalPostgresFields(status)} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// ManagedPostgresSection
// ---------------------------------------------------------------------------

export const ManagedPostgresSection = ({
  status,
  runtimeStatus,
  loading,
  operation,
  errorMessage,
  message,
  onInit,
  onStart,
  onStop,
  onMigrate,
  onRefresh
}: {
  status: ManagedPostgresStatus;
  runtimeStatus: PostgresStatus;
  loading: boolean;
  operation: ManagedPostgresOperation | null;
  errorMessage: string | null;
  message: string | null;
  onInit: () => void;
  onStart: () => void;
  onStop: () => void;
  onMigrate: () => void;
  onRefresh: () => void;
}) => {
  const unavailableMessage = getManagedPostgresUnavailableMessage(status);
  const controls = getManagedPostgresControlState(status, loading, operation);
  const readiness = buildManagedPostgresReadiness(status, runtimeStatus);

  return (
    <div className="desktop-postgres-subpanel">
      <div className="desktop-postgres-subhead">
        <span>Managed Postgres</span>
        <small>{status.configured ? "local config" : "local fallback"}</small>
      </div>
      <div className="desktop-managed-actions">
        <PostgresControlButton label="Init" loadingLabel="Initializing" icon={Wrench} operation="init" activeOperation={operation} disabled={!controls.canInit} onClick={onInit} />
        <PostgresControlButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!controls.canStart} onClick={onStart} />
        <PostgresControlButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!controls.canStop} onClick={onStop} />
        <PostgresControlButton label="Migrate" loadingLabel="Migrating" icon={UploadCloud} operation="migrate" activeOperation={operation} disabled={!controls.canMigrate} onClick={onMigrate} />
        <PostgresControlButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={!controls.canRefresh} onClick={onRefresh} />
      </div>
      {unavailableMessage ? <p className="desktop-postgres-message" data-tone="warning">{unavailableMessage}</p> : null}
      {errorMessage ? <p className="desktop-postgres-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className="desktop-postgres-message" data-tone="info">{message}</p> : null}
      <PostgresReadinessList items={readiness} />
      <PostgresFieldGrid fields={getManagedPostgresFields(status)} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// PostgresProfileManagerSection
// ---------------------------------------------------------------------------

export const PostgresProfileManagerSection = ({ profiles }: { profiles: PostgresProfilePanelController }) => {
  const busy = profiles.operation !== null;
  const updateField = (field: keyof PostgresProfileForm) => (
    event: ReactChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = event.currentTarget.type === "checkbox"
      ? (event.currentTarget as HTMLInputElement).checked
      : event.currentTarget.value;
    profiles.onFormChange({ [field]: value } as Partial<PostgresProfileForm>);
  };

  return (
    <div className="desktop-postgres-subpanel desktop-postgres-profile-manager">
      <div className="desktop-postgres-subhead">
        <span>Connection profiles</span>
        <small>{profiles.state.profiles.length} saved</small>
      </div>
      <div className="desktop-postgres-actions">
        <Button variant="outline" size="sm" disabled={busy} onClick={profiles.onRefreshProfiles}>
          <RefreshCw size={14} />
          <span>{profiles.operation === "list" ? "Loading" : "List"}</span>
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={profiles.onResetForm}>
          <FileCode2 size={14} />
          <span>New</span>
        </Button>
        <Button size="sm" disabled={busy} onClick={profiles.onSaveProfile}>
          <ShieldCheck size={14} />
          <span>{profiles.operation === "save" ? "Saving" : "Save"}</span>
        </Button>
      </div>
      {profiles.error ? (
        <div className="desktop-postgres-command-error" role="alert">
          <div>
            <strong>{profiles.error.operation} failed</strong>
            <code>{profiles.error.code}</code>
          </div>
          <p>{profiles.error.message}</p>
          {profiles.error.detail ? <small>{profiles.error.detail}</small> : null}
        </div>
      ) : null}
      {profiles.message ? <p className="desktop-postgres-message" data-tone="info">{profiles.message}</p> : null}
      <div className="desktop-postgres-profile-form">
        <label>
          <span>Label</span>
          <input value={profiles.form.label} onChange={updateField("label")} />
        </label>
        <label>
          <span>Host</span>
          <input value={profiles.form.host} onChange={updateField("host")} />
        </label>
        <label>
          <span>Port</span>
          <input inputMode="numeric" value={profiles.form.port} onChange={updateField("port")} />
        </label>
        <label>
          <span>Database</span>
          <input value={profiles.form.database} onChange={updateField("database")} />
        </label>
        <label>
          <span>User</span>
          <input value={profiles.form.user} onChange={updateField("user")} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={profiles.form.password} autoComplete="new-password" onChange={updateField("password")} />
        </label>
        <label>
          <span>SSL mode</span>
          <select value={profiles.form.sslmode} onChange={updateField("sslmode")}>
            <option value="require">require</option>
            <option value="prefer">prefer</option>
            <option value="disable">disable</option>
            <option value="verify-ca">verify-ca</option>
            <option value="verify-full">verify-full</option>
          </select>
        </label>
        <label>
          <span>Timeout</span>
          <input inputMode="numeric" value={profiles.form.timeoutMs} onChange={updateField("timeoutMs")} />
        </label>
        <label>
          <span>Pool</span>
          <input value={profiles.form.pool} placeholder="default" onChange={updateField("pool")} />
        </label>
        <label className="desktop-postgres-profile-check">
          <input type="checkbox" checked={profiles.form.setActive} onChange={updateField("setActive")} />
          <span>Set active</span>
        </label>
      </div>
      <div className="desktop-postgres-profile-list" aria-label="Saved Postgres profiles">
        {profiles.rows.length > 0 ? profiles.rows.map((profile) => (
          <div key={profile.profileId} className="desktop-postgres-profile-row" data-active={profile.active}>
            <div className="desktop-postgres-profile-main">
              <strong>{profile.label}</strong>
              <span>{profile.target} / {profile.userDatabase}</span>
            </div>
            <div className="desktop-postgres-profile-badges">
              <span data-tone={profile.active ? "success" : "muted"}>{profile.active ? "active" : "inactive"}</span>
              <span data-tone={profile.passwordSaved ? "success" : "warning"}>
                {profile.passwordSaved ? "passwordSaved" : "no password"}
              </span>
              <span>{profile.sslmode}</span>
              <span>{profile.timeout}</span>
            </div>
            <div className="desktop-postgres-profile-actions">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => profiles.onEditProfile(profile.profileId)}>
                <Settings size={13} />
                <span>Edit</span>
              </Button>
              <Button variant="outline" size="sm" disabled={busy || profile.active} onClick={() => profiles.onActivateProfile(profile.profileId)}>
                <CheckCircle2 size={13} />
                <span>Activate</span>
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => profiles.onDeleteProfile(profile.profileId)}>
                <XCircle size={13} />
                <span>Delete</span>
              </Button>
            </div>
          </div>
        )) : <p className="desktop-empty-copy">No Postgres profiles saved. Offline Core authoring remains available.</p>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PostgresStatusPanel
// ---------------------------------------------------------------------------

export const PostgresStatusPanel = ({
  status,
  managedStatus,
  loading,
  managedOperation,
  errorMessage,
  managedErrorMessage,
  managedMessage,
  profiles,
  persistState,
  persistDisabledReason,
  onRefresh,
  onInitManaged,
  onStartManaged,
  onStopManaged,
  onMigrateManaged,
  onRefreshManaged,
  onPersistGraph
}: {
  status: PostgresStatus;
  managedStatus: ManagedPostgresStatus;
  loading: boolean;
  managedOperation: ManagedPostgresOperation | null;
  errorMessage: string | null;
  managedErrorMessage: string | null;
  managedMessage: string | null;
  profiles: PostgresProfilePanelController;
  persistState: PersistState;
  persistDisabledReason: string | null;
  onRefresh: () => void;
  onInitManaged: () => void;
  onStartManaged: () => void;
  onStopManaged: () => void;
  onMigrateManaged: () => void;
  onRefreshManaged: () => void;
  onPersistGraph: () => void;
}) => {
  const activeTarget = getActivePostgresTarget(status, managedStatus);
  return (
    <section className="desktop-postgres-panel" aria-label="Postgres runtime status">
      <PanelHeader eyebrow="Storage" title="Postgres" />
      <div className="flex items-center gap-2">
        <StatusBadge label={status.label} tone={status.state} dot detail={status.detail} />
      </div>
      <div className="desktop-postgres-target" data-target={activeTarget.toLowerCase()}>
        <strong>{activeTarget}</strong>
        <span>{getPostgresTargetMessage(status, managedStatus)}</span>
      </div>
      <div className="desktop-postgres-actions">
        <Button variant="outline" size="sm" disabled={loading} aria-busy={loading} onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>{loading ? "Refreshing" : "Refresh all"}</span>
        </Button>
        <Button
          size="sm"
          disabled={persistState.state === "pending" || persistDisabledReason !== null}
          aria-busy={persistState.state === "pending"}
          onClick={onPersistGraph}
        >
          {persistState.state === "pending" ? <RefreshCw size={14} /> : <UploadCloud size={14} />}
          <span>{persistState.state === "pending" ? "Persisting" : "Persist graph"}</span>
        </Button>
      </div>
      {errorMessage ? <p className="desktop-postgres-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {persistDisabledReason ? <p className="desktop-postgres-message" data-tone="warning">{persistDisabledReason}</p> : null}
      <div className="desktop-persist-status" data-state={persistState.state} aria-live="polite">
        <div className="desktop-persist-status-row">
          <span>{persistState.state}</span>
          <p>{persistState.message}</p>
        </div>
        {persistState.summary ? (
          <dl className="desktop-persist-summary">
            <div><dt>Graph snapshot</dt><dd title={persistState.summary.graphSnapshotId}>{summarizeGraphSnapshotId(persistState.summary.graphSnapshotId)}</dd></div>
            <div><dt>Counts</dt><dd>{formatPersistCounts(persistState.summary.counts)}</dd></div>
          </dl>
        ) : null}
      </div>
      <div className="desktop-postgres-split">
        <PostgresProfileManagerSection profiles={profiles} />
        <ExternalPostgresSection status={status} />
        <ManagedPostgresSection
          status={managedStatus}
          runtimeStatus={status}
          loading={loading}
          operation={managedOperation}
          errorMessage={managedErrorMessage}
          message={managedMessage}
          onInit={onInitManaged}
          onStart={onStartManaged}
          onStop={onStopManaged}
          onMigrate={onMigrateManaged}
          onRefresh={onRefreshManaged}
        />
      </div>
    </section>
  );
};

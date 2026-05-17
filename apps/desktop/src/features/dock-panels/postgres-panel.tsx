import { ChangeEvent as ReactChangeEvent } from "react";
import { CheckCircle2, FileCode2, Link2, PlayCircle, RefreshCw, Settings, ShieldCheck, Square, UploadCloud, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { PanelHeader } from "@/components/common/panel-header";
import { FieldGrid } from "@/components/common/field-grid";
import type { PostgresStatus, ManagedPostgresStatus } from "../../contracts";
import type {
  ManagedPostgresOperation,
  PersistState,
  PostgresField,
  PostgresProfilePanelController,
} from "../../types";
import type { PostgresProfileForm } from "../postgres/profiles";
import {
  getActivePostgresTarget,
  getExternalConfigured,
  getExternalPostgresFields,
  getManagedPostgresControlState,
  getManagedPostgresFields,
  getPostgresTargetMessage,
  summarizeGraphSnapshotId,
  formatPersistCounts,
} from "../../utils";
import { buildExternalPostgresReadiness, buildManagedPostgresReadiness, type PostgresReadinessItem } from "../postgres/status";

const panelClassName = "flex min-h-0 flex-col gap-3 rounded-xl border border-white/35 bg-white/15 p-3 text-sm shadow-none";
const subpanelClassName = "flex min-h-0 flex-col gap-3 rounded-xl border border-white/35 bg-white/16 p-3";
const subheadClassName = "flex items-center justify-between gap-2";
const subheadTitleClassName = "text-sm font-semibold";
const subheadMetaClassName = "text-xs text-muted-foreground";
const actionRowClassName = "flex flex-wrap items-center gap-2";
const messageClassName = "m-0 text-xs leading-relaxed text-muted-foreground data-[tone=danger]:text-destructive data-[tone=info]:text-primary data-[tone=warning]:text-warning";
const readinessClassName = "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2";
const readinessItemClassName = "min-w-0 rounded-lg border border-white/35 bg-white/18 px-2.5 py-2";
const readinessTextClassName = "block truncate text-xs text-muted-foreground";
const profileFormClassName = "grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2";
const profileLabelClassName = "flex min-w-0 flex-col gap-1 text-xs text-muted-foreground";
const profileInputClassName = "h-8 min-w-0 rounded-md border border-slate-300/75 bg-white/80 px-2 text-xs text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition hover:border-slate-400 hover:bg-white hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)] focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring/40";
const profileCheckClassName = "flex min-w-0 flex-row items-center gap-2 text-xs text-muted-foreground";
const listClassName = "m-0 flex list-none flex-col gap-2 p-0";
const profileRowClassName = "min-w-0 rounded-xl border border-white/35 bg-white/18 p-2 text-xs";
const profileMainClassName = "flex min-w-0 flex-wrap items-center gap-2";
const badgeClassName = "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground";
const cardClassName = "rounded-xl border border-white/35 bg-white/18 p-3";
const persistRowClassName = "flex items-center gap-2";
const persistStateClassName = "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary";
const summaryGridClassName = "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 text-xs";
const summaryCellClassName = "min-w-0 rounded-lg border border-white/35 bg-white/18 px-2.5 py-2";
const summaryTermClassName = "m-0 truncate text-xs font-medium uppercase text-muted-foreground";
const summaryValueClassName = "mt-0.5 truncate font-mono text-xs text-foreground";
const emptyCopyClassName = "m-0 text-xs leading-relaxed text-muted-foreground";

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

type PostgresProfileFieldHandler = (
  field: keyof PostgresProfileForm
) => (event: ReactChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;

// ---------------------------------------------------------------------------
// PostgresReadinessList
// ---------------------------------------------------------------------------

export const PostgresReadinessList = ({ items }: { items: PostgresReadinessItem[] }) => (
  <div className={readinessClassName} aria-label="Postgres migration readiness">
    {items.map((item) => (
      <div key={item.id} className={readinessItemClassName} data-tone={item.tone}>
        <span className={readinessTextClassName}>{item.label}</span>
        <strong className="block truncate text-xs">{item.value}</strong>
        <small className={readinessTextClassName}>{item.reason}</small>
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
    <div className={subpanelClassName}>
      <div className={subheadClassName}>
        <span className={subheadTitleClassName}>External Postgres</span>
        <small className={subheadMetaClassName}>{externalConfigured ? "priority target" : "not selected"}</small>
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
    <div className={subpanelClassName}>
      <div className={subheadClassName}>
        <span className={subheadTitleClassName}>Managed Postgres</span>
        <small className={subheadMetaClassName}>{status.configured ? "local config" : "local fallback"}</small>
      </div>
      <div className={actionRowClassName}>
        <PostgresControlButton label="Init" loadingLabel="Initializing" icon={Wrench} operation="init" activeOperation={operation} disabled={!controls.canInit} onClick={onInit} />
        <PostgresControlButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!controls.canStart} onClick={onStart} />
        <PostgresControlButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!controls.canStop} onClick={onStop} />
        <PostgresControlButton label="Migrate" loadingLabel="Migrating" icon={UploadCloud} operation="migrate" activeOperation={operation} disabled={!controls.canMigrate} onClick={onMigrate} />
        <PostgresControlButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={!controls.canRefresh} onClick={onRefresh} />
      </div>
      {unavailableMessage ? <p className={messageClassName} data-tone="warning">{unavailableMessage}</p> : null}
      {errorMessage ? <p className={messageClassName} data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className={messageClassName} data-tone="info">{message}</p> : null}
      <PostgresReadinessList items={readiness} />
      <PostgresFieldGrid fields={getManagedPostgresFields(status)} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// PostgresProfileManagerSection
// ---------------------------------------------------------------------------

const WorkspacePostgresBindingSection = ({
  busy,
  profiles,
}: {
  busy: boolean;
  profiles: PostgresProfilePanelController;
}) => {
  const currentWorkspaceProfile = profiles.currentWorkspaceProfileId
    ? profiles.rows.find((profile) => profile.profileId === profiles.currentWorkspaceProfileId)
    : null;

  return (
    <div className={cardClassName}>
      <div className={subheadClassName}>
        <span className={subheadTitleClassName}>Workspace binding</span>
        <small className={subheadMetaClassName}>{profiles.currentWorkspaceId ?? "no workspace"}</small>
      </div>
      <p className={emptyCopyClassName}>
        {currentWorkspaceProfile
          ? `Workspace Graph/RAG uses ${currentWorkspaceProfile.label}.`
          : "Bind a profile before workspace Graph/RAG can use PostgreSQL."}
      </p>
      <div className={actionRowClassName}>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || profiles.currentWorkspaceProfileId === null}
          onClick={profiles.onClearWorkspaceProfile}
        >
          <XCircle size={13} />
          <span>Clear binding</span>
        </Button>
      </div>
    </div>
  );
};

const PostgresProfileFormSection = ({
  profiles,
  updateField,
}: {
  profiles: PostgresProfilePanelController;
  updateField: PostgresProfileFieldHandler;
}) => (
  <div className={profileFormClassName}>
    <label className={profileLabelClassName}>
      <span>Label</span>
      <input className={profileInputClassName} value={profiles.form.label} onChange={updateField("label")} />
    </label>
    <label className={profileLabelClassName}>
      <span>Host</span>
      <input className={profileInputClassName} value={profiles.form.host} onChange={updateField("host")} />
    </label>
    <label className={profileLabelClassName}>
      <span>Port</span>
      <input className={profileInputClassName} inputMode="numeric" value={profiles.form.port} onChange={updateField("port")} />
    </label>
    <label className={profileLabelClassName}>
      <span>Database</span>
      <input className={profileInputClassName} value={profiles.form.database} onChange={updateField("database")} />
    </label>
    <label className={profileLabelClassName}>
      <span>User</span>
      <input className={profileInputClassName} value={profiles.form.user} onChange={updateField("user")} />
    </label>
    <label className={profileLabelClassName}>
      <span>Password</span>
      <input className={profileInputClassName} type="password" value={profiles.form.password} autoComplete="new-password" onChange={updateField("password")} />
    </label>
    <label className={profileLabelClassName}>
      <span>SSL mode</span>
      <select className={profileInputClassName} value={profiles.form.sslmode} onChange={updateField("sslmode")}>
        <option value="require">require</option>
        <option value="prefer">prefer</option>
        <option value="disable">disable</option>
        <option value="verify-ca">verify-ca</option>
        <option value="verify-full">verify-full</option>
      </select>
    </label>
    <label className={profileLabelClassName}>
      <span>Timeout</span>
      <input className={profileInputClassName} inputMode="numeric" value={profiles.form.timeoutMs} onChange={updateField("timeoutMs")} />
    </label>
    <label className={profileLabelClassName}>
      <span>Pool</span>
      <input className={profileInputClassName} value={profiles.form.pool} placeholder="default" onChange={updateField("pool")} />
    </label>
    <label className={profileCheckClassName}>
      <input type="checkbox" checked={profiles.form.setActive} onChange={updateField("setActive")} />
      <span>Set active</span>
    </label>
  </div>
);

const PostgresProfileListSection = ({
  busy,
  profiles,
}: {
  busy: boolean;
  profiles: PostgresProfilePanelController;
}) => (
  <div className={listClassName} aria-label="Saved Postgres profiles">
    {profiles.rows.length > 0 ? profiles.rows.map((profile) => (
      <div key={profile.profileId} className={profileRowClassName} data-active={profile.active}>
        <div className={profileMainClassName}>
          <strong className="truncate">{profile.label}</strong>
          <span className="min-w-0 truncate text-muted-foreground">{profile.target} / {profile.userDatabase}</span>
        </div>
        <div className={profileMainClassName}>
          <span className={badgeClassName} data-tone={profile.active ? "success" : "muted"}>{profile.active ? "active" : "inactive"}</span>
          <span className={badgeClassName} data-tone={profile.passwordSaved ? "success" : "warning"}>
            {profile.passwordSaved ? "passwordSaved" : "no password"}
          </span>
          <span className={badgeClassName}>{profile.sslmode}</span>
          <span className={badgeClassName}>{profile.timeout}</span>
        </div>
        <div className={actionRowClassName}>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => profiles.onEditProfile(profile.profileId)}>
            <Settings size={13} />
            <span>Edit</span>
          </Button>
          <Button variant="outline" size="sm" disabled={busy || profile.active} onClick={() => profiles.onActivateProfile(profile.profileId)}>
            <CheckCircle2 size={13} />
            <span>Activate</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !profiles.currentWorkspaceId || profile.profileId === profiles.currentWorkspaceProfileId}
            onClick={() => profiles.onBindWorkspaceProfile(profile.profileId)}
          >
            <Link2 size={13} />
            <span>{profile.profileId === profiles.currentWorkspaceProfileId ? "Bound" : "Bind workspace"}</span>
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => profiles.onDeleteProfile(profile.profileId)}>
            <XCircle size={13} />
            <span>Delete</span>
          </Button>
        </div>
      </div>
    )) : <p className={emptyCopyClassName}>No Postgres profiles saved. Offline Core authoring remains available.</p>}
  </div>
);

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
    <div className={subpanelClassName}>
      <div className={subheadClassName}>
        <span className={subheadTitleClassName}>Connection profiles</span>
        <small className={subheadMetaClassName}>{profiles.state.profiles.length} saved</small>
      </div>
      <div className={actionRowClassName}>
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
        <div className="m-0 rounded-lg border border-destructive/35 bg-destructive/10 px-2.5 py-2 text-xs text-destructive" role="alert">
          <div>
            <strong>{profiles.error.operation} failed</strong>
            <code>{profiles.error.code}</code>
          </div>
          <p>{profiles.error.message}</p>
          {profiles.error.detail ? <small>{profiles.error.detail}</small> : null}
        </div>
      ) : null}
      {profiles.message ? <p className={messageClassName} data-tone="info">{profiles.message}</p> : null}
      <WorkspacePostgresBindingSection busy={busy} profiles={profiles} />
      <PostgresProfileFormSection profiles={profiles} updateField={updateField} />
      <PostgresProfileListSection busy={busy} profiles={profiles} />
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
    <section className={panelClassName} aria-label="Postgres runtime status">
      <PanelHeader eyebrow="Storage" title="Postgres" />
      <div className="flex items-center gap-2">
        <StatusBadge label={status.label} tone={status.state} dot detail={status.detail} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/35 bg-white/18 p-3" data-target={activeTarget.toLowerCase()}>
        <strong className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{activeTarget}</strong>
        <span className="m-0 min-w-0 flex-1 truncate text-xs text-muted-foreground">{getPostgresTargetMessage(status, managedStatus)}</span>
      </div>
      <div className={actionRowClassName}>
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
      {errorMessage ? <p className={messageClassName} data-tone="danger" role="alert">{errorMessage}</p> : null}
      {persistDisabledReason ? <p className={messageClassName} data-tone="warning">{persistDisabledReason}</p> : null}
      <div className={cardClassName} data-state={persistState.state} aria-live="polite">
        <div className={persistRowClassName}>
          <span className={persistStateClassName}>{persistState.state}</span>
          <p className="m-0 min-w-0 flex-1 truncate text-xs text-muted-foreground">{persistState.message}</p>
        </div>
        {persistState.summary ? (
          <dl className={summaryGridClassName}>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Graph snapshot</dt><dd className={summaryValueClassName} title={persistState.summary.graphSnapshotId}>{summarizeGraphSnapshotId(persistState.summary.graphSnapshotId)}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Counts</dt><dd className={summaryValueClassName}>{formatPersistCounts(persistState.summary.counts)}</dd></div>
          </dl>
        ) : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-3">
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

import {
  Activity,
  Database,
  FolderOpen,
  HardDrive,
  Monitor,
  Paintbrush,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  UserCircle,
} from "lucide-react"
import {
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Surface } from "@/components/ui/surface"
import { Switch } from "@/components/ui/switch"
import type {
  LocalStoreStatus,
  PostgresStatus,
  RuntimeState,
  SidecarStatus,
} from "../../contracts"
import { normalizeWorkspaceIgnoreNames, type AppSettings, type AppSettingsPatch } from "./settings"
import type {
  DocumentMode,
  PostgresProfilePanelController,
  WorkspaceState,
} from "../../types"

type AppSettingsCategory = "account" | "general" | "workspace" | "appearance" | "editor" | "runtime"

type AppSettingsDialogProps = {
  mode: DocumentMode
  workspaceName: string
  workspaceState: WorkspaceState
  rootPath: string
  settings: AppSettings
  sidecarStatus: SidecarStatus
  postgresStatus: PostgresStatus
  postgresProfiles: PostgresProfilePanelController
  localStoreStatus: LocalStoreStatus
  onSettingsChange: (patch: AppSettingsPatch) => void
  onResetSettings: () => void
}

const toneVariants: Record<RuntimeState, "success" | "info" | "warning" | "destructive"> = {
  ready: "success",
  placeholder: "info",
  degraded: "warning",
  offline: "destructive",
}

const categories: {
  id: AppSettingsCategory
  label: string
  description: string
  icon: typeof UserCircle
}[] = [
  { id: "account", label: "Account", description: "Local identity", icon: UserCircle },
  { id: "general", label: "General", description: "Startup behavior", icon: SlidersHorizontal },
  { id: "workspace", label: "Workspace", description: "Explorer loading", icon: FolderOpen },
  { id: "appearance", label: "Appearance", description: "Theme and density", icon: Paintbrush },
  { id: "editor", label: "Editor", description: "Monaco defaults", icon: Monitor },
  { id: "runtime", label: "Runtime", description: "Sidecar and storage", icon: Activity },
]

const emptySelectValue = "__empty"

function StatusPill({
  state,
  label,
}: {
  state: RuntimeState
  label: string
}) {
  return (
    <Badge variant={toneVariants[state]} className="rounded-md">
      {label}
    </Badge>
  )
}

function SettingsField({
  label,
  description,
  active,
  children,
}: {
  label: string
  description?: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <Surface className="grid gap-2 px-3 py-3" data-active={active ? "true" : undefined}>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {description ? <span className="text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
      {children}
    </Surface>
  )
}

function SettingsInfoRow({
  icon: Icon,
  label,
  value,
  detail,
  state,
}: {
  icon: typeof Activity
  label: string
  value: string
  detail?: string
  state?: RuntimeState
}) {
  return (
    <Surface className="grid grid-cols-[2rem_1fr_auto] items-start gap-3 px-3 py-3">
      <div className="flex size-8 items-center justify-center rounded-lg border border-border/35 bg-transparent text-muted-foreground">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold text-foreground">{value}</div>
        {detail ? <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{detail}</div> : null}
      </div>
      {state ? <StatusPill state={state} label={state} /> : null}
    </Surface>
  )
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Surface className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Surface>
  )
}

function SelectField<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string
  description?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <SettingsField label={label} description={description} active={open}>
      <Select value={value} open={open} onOpenChange={setOpen} onValueChange={(nextValue) => onChange(nextValue as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        </SelectContent>
      </Select>
    </SettingsField>
  )
}

function RangeField({
  label,
  description,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <SettingsField label={label} description={description}>
      <div className="flex items-center gap-3">
        <input
          className="min-w-0 flex-1 cursor-pointer accent-chemd-foreground"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span className="w-16 text-right font-mono text-xs text-muted-foreground">
          {value}{suffix ?? ""}
        </span>
      </div>
    </SettingsField>
  )
}

function TextListField({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <SettingsField label={label} description={description}>
      <textarea
        className="min-h-28 resize-none rounded-md border border-transparent bg-[var(--control-surface)] px-3 py-2 font-mono text-xs text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground hover:border-border/35 hover:bg-[var(--control-surface-hover)] focus:border-border/55 focus:bg-[var(--control-surface-active)]"
        value={value.join("\n")}
        spellCheck={false}
        onChange={(event) => onChange(normalizeWorkspaceIgnoreNames(event.currentTarget.value))}
      />
    </SettingsField>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-3">
      <div className="border-b border-border/35 pb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2">{children}</div>
    </section>
  )
}

export function SettingsDialog({
  mode,
  workspaceName,
  workspaceState,
  rootPath,
  settings,
  sidecarStatus,
  postgresStatus,
  postgresProfiles,
  localStoreStatus,
  onSettingsChange,
  onResetSettings,
}: AppSettingsDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<AppSettingsCategory>("account")
  const [profileSelectOpen, setProfileSelectOpen] = useState(false)
  const activePostgresProfileId = useMemo(
    () => postgresProfiles.rows.find((profile) => profile.active)?.profileId ?? "",
    [postgresProfiles.rows],
  )

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="rail"
          size="icon-xl"
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={21} strokeWidth={2} />
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[min(680px,calc(100vh-2rem))] max-w-[860px] grid-rows-[auto_1fr] gap-0 overflow-hidden border-border/45 bg-editor-surface p-0 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
        <DialogHeader className="border-b border-border/30 bg-background/20 px-5 py-4 pr-12">
          <DialogTitle className="text-lg">Settings</DialogTitle>
          <DialogDescription>
            Account, appearance, editor, and runtime defaults for Chemd Desktop.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-[178px_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-border/30 bg-background/12 p-3" aria-label="Settings bookmarks">
            <nav className="grid gap-1">
              {categories.map((category) => {
                const Icon = category.icon
                const active = activeCategory === category.id
                return (
                  <Button
                    key={category.id}
                    type="button"
                    variant="settingsItem"
                    size="settingsItem"
                    data-active={active ? "true" : undefined}
                    onClick={() => setActiveCategory(category.id)}
                  >
                    <span className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:bg-foreground/[0.05] data-[active=true]:bg-chemd-background data-[active=true]:text-chemd-foreground dark:group-hover:bg-foreground/[0.08]" data-active={active ? "true" : undefined}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground" data-active={active ? "true" : undefined}>{category.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{category.description}</span>
                    </span>
                  </Button>
                )
              })}
            </nav>
            <Button
              type="button"
              variant="surface"
              size="control"
              className="mt-3 w-full rounded-lg"
              onClick={onResetSettings}
            >
              <RotateCcw size={13} />
              Reset
            </Button>
          </aside>
          <div className="min-h-0 overflow-y-auto p-5 [overscroll-behavior:contain] [scrollbar-gutter:stable]">
            <div className="grid gap-6 pb-1">
              {activeCategory === "account" ? (
              <SettingsSection
                title="Account"
                description="Chemd Desktop currently runs as a local workspace identity. Cloud account binding can be added here later without changing the settings layout."
              >
                <SettingsInfoRow
                  icon={UserCircle}
                  label="Account"
                  value="Local Desktop User"
                  detail="Not signed in. Settings are stored on this device."
                />
                <SettingsInfoRow
                  icon={FolderOpen}
                  label="Workspace"
                  value={workspaceName}
                  detail={rootPath || "No workspace path selected"}
                />
                <SettingsInfoRow
                  icon={Activity}
                  label="Mode"
                  value={mode}
                  detail={`Workspace state: ${workspaceState}`}
                />
              </SettingsSection>
              ) : null}

              {activeCategory === "general" ? (
              <SettingsSection
                title="General"
                description="Control startup behavior for the local IDE session."
              >
                <ToggleField
                  label="Restore last workspace"
                  description="Open the last successful workspace path when the desktop IDE starts."
                  checked={settings.restoreLastWorkspace}
                  onChange={(checked) => onSettingsChange({ restoreLastWorkspace: checked })}
                />
                <SettingsInfoRow
                  icon={FolderOpen}
                  label="Last workspace"
                  value={settings.lastWorkspacePath || "No saved workspace"}
                  detail="This updates automatically after a workspace is opened."
                />
              </SettingsSection>
              ) : null}

              {activeCategory === "workspace" ? (
              <SettingsSection
                title="Workspace"
                description="Tune how the local file explorer loads large workspaces."
              >
                <SettingsInfoRow
                  icon={FolderOpen}
                  label="Initial file tree depth"
                  value="2 levels"
                  detail="The explorer loads root entries and one nested level, then loads deeper folders when expanded."
                />
                <TextListField
                  label="Ignored folder and file names"
                  description="One name per line. Matching entries are skipped by the workspace explorer."
                  value={settings.workspaceIgnoreNames}
                  onChange={(workspaceIgnoreNames) => onSettingsChange({ workspaceIgnoreNames })}
                />
              </SettingsSection>
              ) : null}

              {activeCategory === "appearance" ? (
              <SettingsSection
                title="Appearance"
                description="Keep the desktop shell close to the web UI while allowing compact authoring."
              >
                <SelectField
                  label="Theme"
                  value={settings.theme}
                  options={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                  onChange={(theme) => onSettingsChange({ theme })}
                />
                <ToggleField
                  label="Compact density"
                  description="Tighten control spacing for repeated IDE work."
                  checked={settings.density === "compact"}
                  onChange={(checked) => onSettingsChange({ density: checked ? "compact" : "comfortable" })}
                />
                <RangeField
                  label="Editor font size"
                  value={settings.editorFontSize}
                  min={11}
                  max={18}
                  step={1}
                  suffix="px"
                  onChange={(editorFontSize) => onSettingsChange({ editorFontSize })}
                />
              </SettingsSection>
              ) : null}

              {activeCategory === "editor" ? (
              <SettingsSection
                title="Editor"
                description="Set Monaco defaults for Chemd authoring and compile feedback."
              >
                <ToggleField
                  label="Word wrap"
                  description="Wrap long Chemd lines inside the editor viewport."
                  checked={settings.wordWrap}
                  onChange={(wordWrap) => onSettingsChange({ wordWrap })}
                />
                <ToggleField
                  label="Minimap"
                  description="Show Monaco's document minimap in wide editor sessions."
                  checked={settings.minimap}
                  onChange={(minimap) => onSettingsChange({ minimap })}
                />
                <ToggleField
                  label="Line numbers"
                  description="Show Monaco line numbers in the editor gutter."
                  checked={settings.lineNumbers === "on"}
                  onChange={(checked) => onSettingsChange({ lineNumbers: checked ? "on" : "off" })}
                />
                <RangeField
                  label="Compile debounce"
                  description="Delay Chemd language-service recompiles after typing."
                  value={settings.compileDebounceMs}
                  min={100}
                  max={1500}
                  step={100}
                  suffix="ms"
                  onChange={(compileDebounceMs) => onSettingsChange({ compileDebounceMs })}
                />
              </SettingsSection>
              ) : null}

              {activeCategory === "runtime" ? (
              <SettingsSection
                title="Runtime"
                description="Choose default runtime behavior without duplicating the full runtime panels."
              >
                <ToggleField
                  label="Start chem-service on launch"
                  description="Attempt to start the sidecar once when the IDE session starts."
                  checked={settings.sidecarAutostart}
                  onChange={(sidecarAutostart) => onSettingsChange({ sidecarAutostart })}
                />
                <SettingsInfoRow
                  icon={Activity}
                  label="Sidecar"
                  value={sidecarStatus.label}
                  detail={sidecarStatus.detail}
                  state={sidecarStatus.state}
                />
                <SettingsInfoRow
                  icon={Database}
                  label="Postgres"
                  value={postgresStatus.label}
                  detail={postgresStatus.source ?? postgresStatus.detail}
                  state={postgresStatus.state}
                />
                <SettingsField
                  label="Active Postgres profile"
                  description="Profile creation and secrets stay in the Postgres panel."
                  active={profileSelectOpen}
                >
                  <Select
                    value={activePostgresProfileId || emptySelectValue}
                    open={profileSelectOpen}
                    onOpenChange={setProfileSelectOpen}
                    disabled={postgresProfiles.rows.length === 0 || postgresProfiles.operation !== null}
                    onValueChange={(profileId) => {
                      if (profileId === null) return
                      if (profileId !== emptySelectValue) postgresProfiles.onActivateProfile(profileId)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No saved profile" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value={emptySelectValue} disabled>No saved profile</SelectItem>
                    {postgresProfiles.rows.map((profile) => (
                      <SelectItem key={profile.profileId} value={profile.profileId}>
                        {profile.label}
                      </SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                </SettingsField>
                <SettingsInfoRow
                  icon={HardDrive}
                  label="Local Store"
                  value={localStoreStatus.label}
                  detail={localStoreStatus.storagePath ?? localStoreStatus.detail}
                  state={localStoreStatus.state}
                />
              </SettingsSection>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

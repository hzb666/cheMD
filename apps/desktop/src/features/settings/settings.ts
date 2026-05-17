import { useCallback, useEffect, useMemo, useState } from "react"

export type ThemePreference = "system" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"
export type DensityPreference = "comfortable" | "compact"
export type AutoSaveMode = "off" | "afterDelay" | "onFocusLost"
export type LineNumbers = "on" | "off"

export type AppSettings = {
  theme: ThemePreference
  density: DensityPreference
  editorFontSize: number
  wordWrap: boolean
  minimap: boolean
  lineNumbers: LineNumbers
  autoSaveMode: AutoSaveMode
  restoreLastWorkspace: boolean
  lastWorkspacePath: string
  compileDebounceMs: number
  sidecarAutostart: boolean
  workspaceIgnoreNames: string[]
}

export type AppSettingsPatch = Partial<AppSettings>

export const defaultSettings: AppSettings = {
  theme: "system",
  density: "comfortable",
  editorFontSize: 14,
  wordWrap: false,
  minimap: false,
  lineNumbers: "on",
  autoSaveMode: "afterDelay",
  restoreLastWorkspace: false,
  lastWorkspacePath: "",
  compileDebounceMs: 300,
  sidecarAutostart: false,
  workspaceIgnoreNames: [
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".turbo",
    ".ruff_cache",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
  ],
}

const storageKey = "chemd.desktop.settings.v1"
const themeTransitionDurationMs = 180

let themeTransitionTimeout: number | undefined

const markThemeTransition = (resolvedTheme: ResolvedTheme): void => {
  if (typeof document === "undefined") return

  const previousTheme = document.documentElement.dataset.theme
  if ((previousTheme !== "light" && previousTheme !== "dark") || previousTheme === resolvedTheme) return

  document.documentElement.dataset.desktopThemeTransition = "true"
  if (document.body) {
    document.body.dataset.desktopThemeTransition = "true"
  }

  if (typeof window === "undefined") return
  if (themeTransitionTimeout !== undefined) {
    window.clearTimeout(themeTransitionTimeout)
  }
  themeTransitionTimeout = window.setTimeout(() => {
    delete document.documentElement.dataset.desktopThemeTransition
    if (document.body) {
      delete document.body.dataset.desktopThemeTransition
    }
    themeTransitionTimeout = undefined
  }, themeTransitionDurationMs)
}

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

const pickString = <T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T =>
  typeof value === "string" && allowed.includes(value as T) ? value as T : fallback

const pickBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback

export const normalizeWorkspaceIgnoreNames = (value: unknown): string[] => {
  const names = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : defaultSettings.workspaceIgnoreNames
  return [...new Set(names
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter(Boolean))]
}

const readSettings = (): AppSettings => {
  if (typeof window === "undefined") return defaultSettings

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<AppSettings>

    return {
      ...defaultSettings,
      theme: pickString(parsed.theme, defaultSettings.theme, ["system", "light", "dark"]),
      density: pickString(parsed.density, defaultSettings.density, ["comfortable", "compact"]),
      editorFontSize: clampNumber(parsed.editorFontSize, defaultSettings.editorFontSize, 11, 18),
      wordWrap: pickBoolean(parsed.wordWrap, defaultSettings.wordWrap),
      minimap: pickBoolean(parsed.minimap, defaultSettings.minimap),
      lineNumbers: pickString(parsed.lineNumbers, defaultSettings.lineNumbers, ["on", "off"]),
      autoSaveMode: pickString(parsed.autoSaveMode, defaultSettings.autoSaveMode, ["off", "afterDelay", "onFocusLost"]),
      restoreLastWorkspace: pickBoolean(parsed.restoreLastWorkspace, defaultSettings.restoreLastWorkspace),
      lastWorkspacePath: typeof parsed.lastWorkspacePath === "string" ? parsed.lastWorkspacePath : defaultSettings.lastWorkspacePath,
      compileDebounceMs: clampNumber(parsed.compileDebounceMs, defaultSettings.compileDebounceMs, 100, 1500),
      sidecarAutostart: pickBoolean(parsed.sidecarAutostart, defaultSettings.sidecarAutostart),
      workspaceIgnoreNames: normalizeWorkspaceIgnoreNames(parsed.workspaceIgnoreNames),
    }
  } catch {
    return defaultSettings
  }
}

const readSystemPrefersDark = (): boolean =>
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-color-scheme: dark)").matches

export const resolveThemePreference = (
  theme: ThemePreference,
  prefersDark = readSystemPrefersDark()
): ResolvedTheme => {
  if (theme !== "system") return theme
  return prefersDark ? "dark" : "light"
}

const applySettings = (settings: AppSettings, resolvedTheme: ResolvedTheme): void => {
  if (typeof document === "undefined") return
  markThemeTransition(resolvedTheme)
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.style.colorScheme = resolvedTheme
  if (document.body) {
    document.body.classList.toggle("dark", resolvedTheme === "dark")
    document.body.dataset.theme = resolvedTheme
    document.body.dataset.desktopDensity = settings.density
    document.body.dataset.desktopTheme = settings.theme
    document.body.style.colorScheme = resolvedTheme
  }
}

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(readSettings)
  const [systemThemeVersion, setSystemThemeVersion] = useState(0)
  const resolvedTheme = useMemo(
    () => resolveThemePreference(settings.theme),
    [settings.theme, systemThemeVersion]
  )

  useEffect(() => {
    applySettings(settings, resolvedTheme)
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
  }, [resolvedTheme, settings])

  useEffect(() => {
    if (
      settings.theme !== "system"
      || typeof window === "undefined"
      || typeof window.matchMedia !== "function"
    ) return
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const updateTheme = () => setSystemThemeVersion((current) => current + 1)
    mediaQuery.addEventListener("change", updateTheme)
    return () => mediaQuery.removeEventListener("change", updateTheme)
  }, [settings.theme])

  return {
    settings,
    resolvedTheme,
    updateSettings: useCallback((patch: AppSettingsPatch) => {
      setSettings((current) => ({ ...current, ...patch }))
    }, []),
    resetSettings: useCallback(() => setSettings(defaultSettings), []),
  }
}

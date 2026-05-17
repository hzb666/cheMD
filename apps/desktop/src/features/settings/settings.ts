import { useCallback, useEffect, useState } from "react"

export type ThemePreference = "system" | "light" | "dark"
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
}

const storageKey = "chemd.desktop.settings.v1"

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

const pickString = <T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T =>
  typeof value === "string" && allowed.includes(value as T) ? value as T : fallback

const pickBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback

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
    }
  } catch {
    return defaultSettings
  }
}

const resolveTheme = (theme: ThemePreference): "light" | "dark" => {
  if (theme !== "system") return theme
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

const applySettings = (settings: AppSettings): void => {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", resolveTheme(settings.theme) === "dark")
  document.body.dataset.desktopDensity = settings.density
  document.body.dataset.desktopTheme = settings.theme
}

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(readSettings)

  useEffect(() => {
    applySettings(settings)
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    if (settings.theme !== "system" || typeof window === "undefined") return
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const updateTheme = () => applySettings(settings)
    mediaQuery.addEventListener("change", updateTheme)
    return () => mediaQuery.removeEventListener("change", updateTheme)
  }, [settings])

  return {
    settings,
    updateSettings: useCallback((patch: AppSettingsPatch) => {
      setSettings((current) => ({ ...current, ...patch }))
    }, []),
    resetSettings: useCallback(() => setSettings(defaultSettings), []),
  }
}

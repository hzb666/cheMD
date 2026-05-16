import { useEffect } from "react";

const ZOOM_STORAGE_KEY = "chemd.desktop.zoom";
const ZOOM_DEFAULT = 1;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

const clampZoom = (value: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

const parseStoredZoom = (): number => {
  const stored = Number.parseFloat(window.localStorage.getItem(ZOOM_STORAGE_KEY) ?? "");
  return Number.isFinite(stored) ? clampZoom(stored) : ZOOM_DEFAULT;
};

const isZoomShortcut = (event: KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && !event.altKey;

const getNextZoom = (event: KeyboardEvent, currentZoom: number): number | null => {
  if (!isZoomShortcut(event)) return null;

  if (event.key === "0") return ZOOM_DEFAULT;
  if (event.key === "-" || event.key === "_") return clampZoom(currentZoom - ZOOM_STEP);
  if (event.key === "=" || event.key === "+") return clampZoom(currentZoom + ZOOM_STEP);

  return null;
};

export const useWebviewZoomShortcuts = () => {
  useEffect(() => {
    let disposed = false;
    let currentZoom = parseStoredZoom();
    let currentWebview: { setZoom: (scaleFactor: number) => Promise<void> } | null = null;

    const applyZoom = async (nextZoom: number) => {
      currentZoom = nextZoom;
      window.localStorage.setItem(ZOOM_STORAGE_KEY, nextZoom.toFixed(2));

      try {
        currentWebview ??= (await import("@tauri-apps/api/webview")).getCurrentWebview();
        if (!disposed) await currentWebview.setZoom(nextZoom);
      } catch {
        // Browser preview and older runtimes do not expose Tauri webview zoom.
      }
    };

    void applyZoom(currentZoom);

    const onKeyDown = (event: KeyboardEvent) => {
      const nextZoom = getNextZoom(event, currentZoom);
      if (nextZoom === null) return;

      event.preventDefault();
      event.stopPropagation();
      void applyZoom(nextZoom);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);
};

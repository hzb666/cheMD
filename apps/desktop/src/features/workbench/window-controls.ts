import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { invokeCommand } from "../../utils";
import type { WindowCaptionButtonRect } from "../../contracts";

type SnapButtonState = {
  hovered: boolean;
};

const snapButtonEvents = {
  enter: "chemd-window-snap-button-enter",
  leave: "chemd-window-snap-button-leave",
  click: "chemd-window-snap-button-click",
} as const;

const getReferenceTauriWindow = async () => {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
};

const ignoreNativeWindowBoundaryError = () => {
  // Browser preview has no native window command boundary.
};

export const runReferenceWindowCommand = async (
  command: "minimize" | "toggleMaximize" | "close" | "startDragging",
) => {
  try {
    const currentWindow = await getReferenceTauriWindow();
    await currentWindow?.[command]();
  } catch {
    // Browser preview has no native window command boundary.
  }
};

const isReferenceChromeInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element
  && Boolean(target.closest("button, input, textarea, select, a, [role='button'], [role='tab'], [contenteditable='true']"));

export const beginReferenceWindowDrag = (event: ReactMouseEvent<HTMLElement>) => {
  if (event.buttons !== 1) return;
  if (isReferenceChromeInteractiveTarget(event.target)) return;
  if (event.detail >= 2) {
    event.preventDefault();
    event.stopPropagation();
    void runReferenceWindowCommand("toggleMaximize");
    return;
  }
  void runReferenceWindowCommand("startDragging");
};

export const useReferenceWindowMaximized = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    const syncMaximized = async () => {
      const currentWindow = await getReferenceTauriWindow();
      const maximized = await currentWindow?.isMaximized();
      if (mounted && typeof maximized === "boolean") {
        setIsMaximized(maximized);
      }
      return currentWindow;
    };

    syncMaximized().then(async (currentWindow) => {
      unlisten = await currentWindow?.onResized(() => {
        syncMaximized().catch(ignoreNativeWindowBoundaryError);
      });
    }).catch(ignoreNativeWindowBoundaryError);

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  return isMaximized;
};

export const buildReferenceSnapLayoutAnchor = (
  rect: Pick<DOMRectReadOnly, "top" | "right" | "width" | "height">,
  viewportWidth: number,
  scaleFactor: number,
): WindowCaptionButtonRect => ({
  top: rect.top,
  right: Math.max(0, viewportWidth - rect.right),
  width: rect.width,
  height: rect.height,
  scaleFactor,
});

export const useReferenceSnapLayoutButtonRect = (buttonRef: RefObject<HTMLButtonElement | null>) => {
  const [buttonState, setButtonState] = useState<SnapButtonState>({
    hovered: false,
  });

  useEffect(() => {
    let disposed = false;
    let syncAnimationFrame = 0;
    let lastRectKey = "";
    let scaleFactor = window.devicePixelRatio;
    let currentAnchor: WindowCaptionButtonRect | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unlistenWindowResize: (() => void) | undefined;
    let unlistenScaleChanged: (() => void) | undefined;

    const readScaleFactor = async () => {
      const currentWindow = await getReferenceTauriWindow();
      return currentWindow?.scaleFactor().catch(() => window.devicePixelRatio) ?? window.devicePixelRatio;
    };

    const anchorKey = (rect: WindowCaptionButtonRect) => [
      rect.top,
      rect.right,
      rect.width,
      rect.height,
      rect.scaleFactor,
    ].map((value) => value.toFixed(3)).join(":");

    const writeAnchor = async (rect: WindowCaptionButtonRect, force = false) => {
      const rectKey = anchorKey(rect);
      currentAnchor = rect;
      if (!force && rectKey === lastRectKey) return;
      lastRectKey = rectKey;
      await invokeCommand("set_window_maximize_button_rect", { rect });
    };

    const readAnchor = () => {
      const button = buttonRef.current;
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return buildReferenceSnapLayoutAnchor(rect, window.innerWidth, scaleFactor);
    };

    const syncMeasuredAnchor = async () => {
      const rect = readAnchor();
      if (!rect) return;
      if (disposed) return;
      await writeAnchor(rect);
    };

    const syncCachedAnchor = async () => {
      const rect = currentAnchor ?? readAnchor();
      if (!rect) return;
      if (disposed) return;
      await writeAnchor(rect, true);
    };

    const scheduleSync = () => {
      cancelAnimationFrame(syncAnimationFrame);
      syncAnimationFrame = requestAnimationFrame(() => {
        syncMeasuredAnchor().catch(ignoreNativeWindowBoundaryError);
      });
    };

    const scheduleCachedSync = () => {
      cancelAnimationFrame(syncAnimationFrame);
      syncAnimationFrame = requestAnimationFrame(() => {
        syncCachedAnchor().catch(ignoreNativeWindowBoundaryError);
      });
    };

    const syncScaleFactor = () => {
      readScaleFactor().then((nextScaleFactor) => {
        if (disposed) return;
        scaleFactor = nextScaleFactor;
        scheduleSync();
      }).catch(() => {
        scaleFactor = window.devicePixelRatio;
        scheduleSync();
      });
    };

    syncScaleFactor();
    scheduleSync();
    if (buttonRef.current) {
      resizeObserver = new ResizeObserver(scheduleSync);
      resizeObserver.observe(buttonRef.current);
    }
    getReferenceTauriWindow().then(async (currentWindow) => {
      unlistenWindowResize = await currentWindow?.onResized(scheduleCachedSync);
      unlistenScaleChanged = await currentWindow?.onScaleChanged(syncScaleFactor);
    }).catch(ignoreNativeWindowBoundaryError);

    return () => {
      disposed = true;
      cancelAnimationFrame(syncAnimationFrame);
      resizeObserver?.disconnect();
      unlistenWindowResize?.();
      unlistenScaleChanged?.();
      invokeCommand("set_window_maximize_button_rect", { rect: null }).catch(ignoreNativeWindowBoundaryError);
    };
  }, [buttonRef]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    import("@tauri-apps/api/event").then(async ({ listen }) => {
      const subscriptions = await Promise.all([
        listen(snapButtonEvents.enter, () => {
          if (!disposed) setButtonState({ hovered: true });
        }),
        listen(snapButtonEvents.leave, () => {
          if (!disposed) setButtonState({ hovered: false });
        }),
        listen(snapButtonEvents.click, () => {
          if (!disposed) runReferenceWindowCommand("toggleMaximize").catch(ignoreNativeWindowBoundaryError);
        }),
      ]);
      if (disposed) {
        subscriptions.forEach((unlisten) => unlisten());
      } else {
        unlisteners.push(...subscriptions);
      }
    }).catch(ignoreNativeWindowBoundaryError);

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  return buttonState;
};

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const useReferenceSidebarResize = (
  sidebarVisible: boolean,
  sidebarWidth: number,
  setSidebarWidth: (width: number) => void,
) => {
  const shellRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sidebarVisible || event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let latestWidth = startWidth;
    cleanupRef.current?.();
    document.body.dataset.desktopResizePanel = "sidebar";

    const applyWidth = () => {
      frameRef.current = null;
      shellRef.current?.style.setProperty("--reference-sidebar-width", `${latestWidth}px`);
    };
    const scheduleWidth = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(applyWidth);
    };
    const onMove = (moveEvent: PointerEvent) => {
      latestWidth = Math.min(420, Math.max(240, startWidth + moveEvent.clientX - startX));
      scheduleWidth();
    };
    const cleanup = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        shellRef.current?.style.setProperty("--reference-sidebar-width", `${latestWidth}px`);
      }
      delete document.body.dataset.desktopResizePanel;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("blur", onEnd);
      cleanupRef.current = null;
    };
    const onEnd = () => {
      cleanup();
      setSidebarWidth(latestWidth);
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
    window.addEventListener("blur", onEnd, { once: true });
  };

  return { shellRef, beginResize };
};

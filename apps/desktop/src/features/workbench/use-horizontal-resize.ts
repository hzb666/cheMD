import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface HorizontalResizeContext {
  containerSize: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  startValue: number;
  startX: number;
  startY: number;
}

interface UseHorizontalResizeOptions<TElement extends HTMLElement> {
  disabled?: boolean;
  getContainerSize?: (element: TElement) => number;
  onResize: (value: number, element: TElement) => void;
  onResizeEnd?: (value: number, element: TElement) => void;
  panelId: string;
  resolveValue: (context: HorizontalResizeContext) => number;
  value: number;
}

export const useHorizontalResize = <TElement extends HTMLElement>({
  disabled = false,
  getContainerSize = (element) => element.clientWidth,
  onResize,
  onResizeEnd,
  panelId,
  resolveValue,
  value,
}: UseHorizontalResizeOptions<TElement>) => {
  const containerRef = useRef<TElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (disabled || !container || event.button !== 0) return;

    event.preventDefault();
    cleanupRef.current?.();

    const resizeHandle = event.currentTarget;
    if (!resizeHandle.hasPointerCapture(event.pointerId)) {
      resizeHandle.setPointerCapture(event.pointerId);
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startValue = value;
    const containerSize = getContainerSize(container);
    if (containerSize <= 0) return;

    let latestValue = startValue;
    document.body.dataset.desktopResizePanel = panelId;

    const applyResize = () => {
      frameRef.current = null;
      onResize(latestValue, container);
    };
    const scheduleResize = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(applyResize);
    };
    const onMove = (moveEvent: PointerEvent) => {
      latestValue = resolveValue({
        containerSize,
        currentX: moveEvent.clientX,
        currentY: moveEvent.clientY,
        deltaX: moveEvent.clientX - startX,
        deltaY: moveEvent.clientY - startY,
        startValue,
        startX,
        startY
      });
      scheduleResize();
    };
    const cleanup = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        onResize(latestValue, container);
      }
      if (resizeHandle.hasPointerCapture(event.pointerId)) {
        resizeHandle.releasePointerCapture(event.pointerId);
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
      onResizeEnd?.(latestValue, container);
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
    window.addEventListener("blur", onEnd, { once: true });
  };

  return { beginResize, containerRef };
};

import { useHorizontalResize } from "./use-horizontal-resize";

export const DEFAULT_BOTTOM_PANEL_HEIGHT = 280;
const MIN_BOTTOM_PANEL_HEIGHT = 160;
const MAX_BOTTOM_PANEL_HEIGHT = 520;
const MAX_BOTTOM_PANEL_RATIO = 0.72;

export const clampBottomPanelHeight = (
  value: number,
  containerHeight: number,
): number => {
  const ratioMax = containerHeight > 0
    ? Math.floor(containerHeight * MAX_BOTTOM_PANEL_RATIO)
    : MAX_BOTTOM_PANEL_HEIGHT;
  const maxHeight = Math.max(
    MIN_BOTTOM_PANEL_HEIGHT,
    Math.min(MAX_BOTTOM_PANEL_HEIGHT, ratioMax)
  );

  return Math.min(maxHeight, Math.max(MIN_BOTTOM_PANEL_HEIGHT, Math.round(value)));
};

export const useReferenceBottomPanelResize = (
  panelOpen: boolean,
  panelHeight: number,
  setPanelHeight: (height: number) => void,
) => {
  const { beginResize, containerRef } = useHorizontalResize<HTMLElement>({
    disabled: !panelOpen,
    getContainerSize: (element) => element.clientHeight,
    onResize: (height, container) => {
      container.style.setProperty("--reference-bottom-panel-height", `${height}px`);
    },
    onResizeEnd: setPanelHeight,
    panelId: "bottom",
    resolveValue: ({ containerSize, deltaY, startValue }) =>
      clampBottomPanelHeight(startValue - deltaY, containerSize),
    value: panelHeight
  });

  return { beginResize, containerRef };
};

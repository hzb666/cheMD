import { useHorizontalResize } from "./use-horizontal-resize";

const clampSidebarWidth = (value: number): number =>
  Math.min(420, Math.max(240, value));

export const useReferenceSidebarResize = (
  sidebarVisible: boolean,
  sidebarWidth: number,
  setSidebarWidth: (width: number) => void,
) => {
  const { beginResize, containerRef: shellRef } = useHorizontalResize<HTMLElement>({
    disabled: !sidebarVisible,
    onResize: (width, shell) => {
      shell.style.setProperty("--reference-sidebar-width", `${width}px`);
    },
    onResizeEnd: setSidebarWidth,
    panelId: "sidebar",
    resolveValue: ({ deltaX, startValue }) => clampSidebarWidth(startValue + deltaX),
    value: sidebarWidth
  });

  return { shellRef, beginResize };
};

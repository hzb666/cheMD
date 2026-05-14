import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { DesktopLayoutState, LayoutPanel, InsightDockLayout, InsightDockPanelId, DockDragPreview, ActivityTool } from "../desktop-types";
import {
  initialDesktopLayout,
  layoutBounds,
  initialInsightDockLayout,
  activityDockPanel,
  insightDockMeta,
  clampDockPanelSize,
  getLayoutSize,
  setLayoutSize,
  toggleLayoutPanel,
  isLayoutPanelCollapsed,
  getResizeDelta,
  getKeyboardResizeDelta,
  moveDockPanel
} from "../desktop-utils";

export const useDesktopLayout = () => {
  const [layout, setLayout] = useState<DesktopLayoutState>(initialDesktopLayout);
  const style = useMemo(() => ({
    "--desktop-sidebar-width": `${layout.sidebarWidth}px`,
    "--desktop-insight-width": `${layout.insightWidth}px`,
    "--desktop-bottom-height": `${layout.bottomHeight}px`
  }) as CSSProperties, [layout.bottomHeight, layout.insightWidth, layout.sidebarWidth]);

  const togglePanel = (panel: LayoutPanel) => {
    setLayout((current) => toggleLayoutPanel(current, panel));
  };

  const expandPanel = (panel: LayoutPanel) => {
    setLayout((current) => {
      if (!isLayoutPanelCollapsed(current, panel)) return current;
      return toggleLayoutPanel(current, panel);
    });
  };

  const beginResize = (panel: LayoutPanel, event: ReactPointerEvent<HTMLDivElement>) => {
    if (isLayoutPanelCollapsed(layout, panel)) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = getLayoutSize(layout, panel);
    document.body.dataset.desktopResizePanel = panel;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = getResizeDelta(panel, startX, startY, moveEvent);
      setLayout((current) => setLayoutSize(current, panel, startSize + delta));
    };
    const onEnd = () => {
      delete document.body.dataset.desktopResizePanel;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  const handleKeyDown = (panel: LayoutPanel, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePanel(panel);
      return;
    }
    const delta = getKeyboardResizeDelta(panel, event.key);
    if (delta === 0) return;
    event.preventDefault();
    setLayout((current) => {
      const expanded = isLayoutPanelCollapsed(current, panel) ? toggleLayoutPanel(current, panel) : current;
      return setLayoutSize(expanded, panel, getLayoutSize(expanded, panel) + delta);
    });
  };

  const resetPanel = (panel: LayoutPanel) => {
    setLayout((current) => setLayoutSize(current, panel, layoutBounds[panel].defaultValue));
  };

  return { layout, style, beginResize, togglePanel, expandPanel, handleKeyDown, resetPanel };
};

export const useInsightDockController = (activeTool: ActivityTool) => {
  const [dockLayout, setDockLayout] = useState<InsightDockLayout>(initialInsightDockLayout);
  const [dragPreview, setDragPreview] = useState<DockDragPreview | null>(null);
  const activeDockPanel = activityDockPanel[activeTool];

  useEffect(() => {
    setDockLayout((current) => ({
      ...current,
      active: activeDockPanel,
      minimized: current.minimized.filter((panel) => panel !== activeDockPanel),
      order: [activeDockPanel, ...current.order.filter((panel) => panel !== activeDockPanel)]
    }));
  }, [activeDockPanel]);

  const visiblePanels = dockLayout.order.filter((panel) => !dockLayout.minimized.includes(panel));
  const minimizedPanels = dockLayout.order.filter((panel) => dockLayout.minimized.includes(panel));

  const activatePanel = (panel: InsightDockPanelId) => {
    setDockLayout((current) => ({
      ...current,
      active: panel,
      minimized: current.minimized.filter((item) => item !== panel)
    }));
  };

  const minimizePanel = (panel: InsightDockPanelId) => {
    setDockLayout((current) => {
      const minimized = current.minimized.includes(panel)
        ? current.minimized
        : [...current.minimized, panel];
      const nextVisible = current.order.find((item) => item !== panel && !minimized.includes(item));
      return {
        ...current,
        minimized,
        active: current.active === panel ? nextVisible ?? panel : current.active
      };
    });
  };

  const beginDockResize = (panel: InsightDockPanelId, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dockLayout.sizes[panel];
    document.body.dataset.desktopResizePanel = "dock";

    const onMove = (moveEvent: PointerEvent) => {
      const nextHeight = clampDockPanelSize(startHeight + moveEvent.clientY - startY);
      setDockLayout((current) => ({
        ...current,
        sizes: { ...current.sizes, [panel]: nextHeight }
      }));
    };
    const onEnd = () => {
      delete document.body.dataset.desktopResizePanel;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  const beginDockDrag = (panel: InsightDockPanelId, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    let latestTarget: InsightDockPanelId | null = null;
    document.body.dataset.desktopDockDrag = panel;

    const updatePreview = (clientX: number, clientY: number) => {
      const moved = Math.abs(clientX - startX) + Math.abs(clientY - startY);
      const targetElement = document.elementFromPoint(clientX, clientY);
      const targetPanel = targetElement?.closest("[data-dock-panel]")?.getAttribute("data-dock-panel") as InsightDockPanelId | null;
      const nextTarget = moved >= 8 && targetPanel && targetPanel !== panel && insightDockMeta[targetPanel]
        ? targetPanel
        : null;
      latestTarget = nextTarget;
      setDragPreview(nextTarget ? { source: panel, target: nextTarget } : null);
    };

    const onMove = (moveEvent: PointerEvent) => {
      updatePreview(moveEvent.clientX, moveEvent.clientY);
    };

    const onEnd = (endEvent: PointerEvent) => {
      delete document.body.dataset.desktopDockDrag;
      window.removeEventListener("pointermove", onMove);
      const moved = Math.abs(endEvent.clientX - startX) + Math.abs(endEvent.clientY - startY);
      const targetPanel = latestTarget;
      setDragPreview(null);
      if (moved < 8 || !targetPanel || !insightDockMeta[targetPanel]) return;
      setDockLayout((current) => ({
        ...current,
        active: panel,
        order: moveDockPanel(current.order, panel, targetPanel)
      }));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  return {
    dockLayout,
    dragPreview,
    visiblePanels,
    minimizedPanels,
    activatePanel,
    minimizePanel,
    beginDockResize,
    beginDockDrag
  };
};

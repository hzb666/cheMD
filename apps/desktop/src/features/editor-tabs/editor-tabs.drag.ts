import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { WorkspaceFileEntry } from "../../contracts";

type TabRect = {
  left: number;
  right: number;
  width: number;
};

type TabDragBounds = {
  minLeft: number;
  maxRight: number;
};

export type TabDragState = {
  sourceFileId: string;
  pointerId: number;
  originClientX: number;
  currentClientX: number;
  started: boolean;
  rects: Record<string, TabRect>;
  bounds: TabDragBounds;
  slotWidth: number;
};

const tabDragThresholdPx = 4;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const cloneDragState = (state: TabDragState): TabDragState => ({ ...state });

const ordersMatch = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const getTabSlotWidth = (
  tabIds: readonly string[],
  sourceFileId: string,
  rects: Record<string, TabRect>,
): number => {
  const sourceRect = rects[sourceFileId];
  if (!sourceRect) return 0;
  const sourceIndex = tabIds.indexOf(sourceFileId);
  const nextRect = sourceIndex >= 0 ? rects[tabIds[sourceIndex + 1]] : undefined;
  const previousRect = sourceIndex > 0 ? rects[tabIds[sourceIndex - 1]] : undefined;
  if (nextRect) return Math.max(sourceRect.width, nextRect.left - sourceRect.left);
  if (previousRect) return Math.max(sourceRect.width, sourceRect.left - previousRect.left);
  return sourceRect.width;
};

const getDragSlotOffset = (dragDeltaX: number, slotWidth: number): number => {
  if (slotWidth <= 0) return 0;
  const slotsMoved = dragDeltaX / slotWidth;
  if (slotsMoved > 0) return Math.floor(slotsMoved + 0.5);
  if (slotsMoved < 0) return Math.ceil(slotsMoved - 0.5);
  return 0;
};

export const buildTabDragPreviewOrder = (
  tabIds: readonly string[],
  sourceFileId: string,
  dragDeltaX: number,
  slotWidth: number,
): string[] => {
  const sourceIndex = tabIds.indexOf(sourceFileId);
  if (sourceIndex < 0 || slotWidth <= 0) return [...tabIds];

  const slotOffset = getDragSlotOffset(dragDeltaX, slotWidth);
  const targetIndex = clamp(sourceIndex + slotOffset, 0, tabIds.length - 1);
  if (targetIndex === sourceIndex) return [...tabIds];

  const nextOrder = tabIds.filter((tabId) => tabId !== sourceFileId);
  nextOrder.splice(targetIndex, 0, sourceFileId);
  return nextOrder;
};

export const clampTabDragDelta = (
  rawDelta: number,
  sourceRect: TabRect,
  bounds: TabDragBounds,
): number => {
  const minDelta = bounds.minLeft - sourceRect.left;
  const maxDelta = bounds.maxRight - sourceRect.right;
  return clamp(rawDelta, minDelta, maxDelta);
};

const getDragDeltaX = (state: TabDragState | null): number | null => {
  if (!state?.started) return null;
  const sourceRect = state.rects[state.sourceFileId];
  const rawDelta = state.currentClientX - state.originClientX;
  return sourceRect ? clampTabDragDelta(rawDelta, sourceRect, state.bounds) : rawDelta;
};

const collectTabRects = (strip: HTMLDivElement | null): Record<string, TabRect> => {
  const rects: Record<string, TabRect> = {};
  strip?.querySelectorAll<HTMLElement>("[data-editor-tab-id]").forEach((element) => {
    const tabId = element.dataset.editorTabId;
    if (!tabId) return;
    const rect = element.getBoundingClientRect();
    rects[tabId] = { left: rect.left, right: rect.right, width: rect.width };
  });
  return rects;
};

const collectTabDragBounds = (
  strip: HTMLDivElement | null,
  tabIds: readonly string[],
  rects: Record<string, TabRect>,
  sourceFileId: string,
): TabDragBounds => {
  const sourceRect = rects[sourceFileId];
  const rootRect = strip?.closest(".reference-editor-tabs")?.getBoundingClientRect();
  const stripRect = strip?.getBoundingClientRect();
  const firstRect = rects[tabIds[0]];
  return {
    minLeft: firstRect?.left ?? sourceRect?.left ?? 0,
    maxRight: rootRect?.right ?? stripRect?.right ?? sourceRect?.right ?? 0,
  };
};

const getTabTranslateX = (
  tabId: string,
  tabIds: readonly string[],
  previewOrder: readonly string[],
  dragState: TabDragState | null,
  dragDeltaX: number | null,
): number => {
  if (!dragState?.started || dragDeltaX === null || dragState.slotWidth <= 0) return 0;
  if (tabId === dragState.sourceFileId) return dragDeltaX;

  const sourceIndex = tabIds.indexOf(dragState.sourceFileId);
  const previewSourceIndex = previewOrder.indexOf(dragState.sourceFileId);
  const currentIndex = tabIds.indexOf(tabId);
  if (sourceIndex < 0 || previewSourceIndex < 0 || currentIndex < 0) return 0;
  if (previewSourceIndex > sourceIndex && currentIndex > sourceIndex && currentIndex <= previewSourceIndex) {
    return -dragState.slotWidth;
  }
  if (previewSourceIndex < sourceIndex && currentIndex >= previewSourceIndex && currentIndex < sourceIndex) {
    return dragState.slotWidth;
  }
  return 0;
};

export const useEditorTabDrag = (
  tabs: readonly WorkspaceFileEntry[],
  onReorderFileTabs: (orderedFileIds: readonly string[]) => void,
) => {
  const [dragState, setDragState] = useState<TabDragState | null>(null);
  const [settling, setSettling] = useState(false);
  const dragStateRef = useRef<TabDragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const suppressClickFileIdRef = useRef<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const dragDeltaX = getDragDeltaX(dragState);
  const previewOrder = dragState?.started && dragDeltaX !== null
    ? buildTabDragPreviewOrder(tabIds, dragState.sourceFileId, dragDeltaX, dragState.slotWidth)
    : tabIds;

  const flushDragFrame = useCallback(() => {
    frameRef.current = null;
    setDragState(dragStateRef.current ? cloneDragState(dragStateRef.current) : null);
  }, []);

  const scheduleDragFrame = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(flushDragFrame);
  }, [flushDragFrame]);

  const resetDragState = useCallback(() => {
    dragStateRef.current = null;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setDragState(null);
  }, []);

  const beginTabDrag = useCallback((tabId: string, event: ReactPointerEvent<HTMLDivElement>): boolean => {
    if (event.button !== 0 || event.pointerType === "touch") return false;
    const target = event.target as HTMLElement;
    if (target.closest(".reference-editor-tab-close, .reference-editor-tab-menu-trigger, .reference-editor-tab-new")) return false;

    const rects = collectTabRects(stripRef.current);
    if (!rects[tabId]) return false;
    const nextState: TabDragState = {
      sourceFileId: tabId,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      currentClientX: event.clientX,
      started: false,
      rects,
      bounds: collectTabDragBounds(stripRef.current, tabIds, rects, tabId),
      slotWidth: getTabSlotWidth(tabIds, tabId, rects),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = nextState;
    setDragState(cloneDragState(nextState));
    return true;
  }, [tabIds]);

  const updateTabDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.originClientX;
    current.currentClientX = event.clientX;
    current.started = current.started || Math.abs(deltaX) >= tabDragThresholdPx;
    if (current.started) event.preventDefault();
    scheduleDragFrame();
  }, [scheduleDragFrame]);

  const finishTabDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const dragDelta = getDragDeltaX(current);
    if (current.started && dragDelta !== null) {
      const nextOrder = buildTabDragPreviewOrder(tabIds, current.sourceFileId, dragDelta, current.slotWidth);
      suppressClickFileIdRef.current = current.sourceFileId;
      window.setTimeout(() => {
        if (suppressClickFileIdRef.current === current.sourceFileId) suppressClickFileIdRef.current = null;
      }, 0);
      if (!ordersMatch(tabIds, nextOrder)) {
        setSettling(true);
        onReorderFileTabs(nextOrder);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => setSettling(false)));
      }
    }
    resetDragState();
  }, [onReorderFileTabs, resetDragState, tabIds]);

  const getTabDragTranslateX = useCallback((tabId: string): number =>
    getTabTranslateX(tabId, tabIds, previewOrder, dragState, dragDeltaX),
  [dragDeltaX, dragState, previewOrder, tabIds]);

  const shouldSuppressClick = useCallback((fileId: string): boolean => {
    if (suppressClickFileIdRef.current !== fileId) return false;
    suppressClickFileIdRef.current = null;
    return true;
  }, []);

  return {
    dragState,
    settling,
    stripRef,
    beginTabDrag,
    updateTabDrag,
    finishTabDrag,
    resetDragState,
    getTabDragTranslateX,
    shouldSuppressClick,
  };
};

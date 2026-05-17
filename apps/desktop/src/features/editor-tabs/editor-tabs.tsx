import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { FileCode2, MoreHorizontal, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceFileEntry } from "../../contracts";
import { useEditorTabDrag, type TabDragState } from "./editor-tabs.drag";
import { EditorTabActionsMenu, type EditorTabMenuAction } from "./editor-tabs.menu";

export interface EditorTabsProps {
  tabs: readonly WorkspaceFileEntry[];
  selectedFileId: string;
  dirtyFileIds: readonly string[];
  menuActions?: readonly EditorTabMenuAction[];
  onSelectFile: (file: WorkspaceFileEntry) => void;
  onCloseFileTab: (fileId: string) => void;
  onCloseAllFileTabs: () => void;
  onReorderFileTabs: (orderedFileIds: readonly string[]) => void;
  onOpenNewTab: () => void;
}

const tabStripClassName = "reference-editor-tab-strip";
const tabScrollClassName = "reference-editor-tab-scroll";
const tabIconClassName = "reference-editor-tab-icon text-muted-foreground";
const tabLabelClassName = "reference-editor-tab-label min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap";
const tabDirtyClassName = "reference-editor-tab-dirty w-1.5 text-center opacity-0";
const minTabWidth = 86;

const getNaturalTabWidth = () => {
  if (typeof window === "undefined") return 152;
  const viewportWidth = window.innerWidth || 0;
  return Math.min(240, Math.max(152, viewportWidth * 0.18));
};

type EditorTabStripProps = {
  tabs: readonly WorkspaceFileEntry[];
  selectedFileId: string;
  dirtyFileIds: readonly string[];
  dragState: TabDragState | null;
  settling: boolean;
  stripRef: React.RefObject<HTMLDivElement | null>;
  onOpenNewTab: () => void;
  onSelectFile: (file: WorkspaceFileEntry) => void;
  onCloseFileTab: (fileId: string) => void;
  onBeginTabDrag: (tabId: string, event: ReactPointerEvent<HTMLDivElement>) => boolean;
  onUpdateTabDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFinishTabDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResetDragState: () => void;
  onGetTabDragTranslateX: (tabId: string) => number;
  onShouldSuppressClick: (fileId: string) => boolean;
};

type EditorTabProps = {
  tab: WorkspaceFileEntry;
  active: boolean;
  tabDirty: boolean;
  translateX: number;
  isDragging: boolean;
  onSelectFile: (file: WorkspaceFileEntry) => void;
  onCloseFileTab: (fileId: string) => void;
  onBeginTabDrag: (tabId: string, event: ReactPointerEvent<HTMLDivElement>) => boolean;
  onUpdateTabDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFinishTabDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResetDragState: () => void;
  onShouldSuppressClick: (fileId: string) => boolean;
};

function EditorTab({
  tab,
  active,
  tabDirty,
  translateX,
  isDragging,
  onSelectFile,
  onCloseFileTab,
  onBeginTabDrag,
  onUpdateTabDrag,
  onFinishTabDrag,
  onResetDragState,
  onShouldSuppressClick,
}: EditorTabProps) {
  return (
    <div
      className="reference-editor-tab"
      data-active={active ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
      data-editor-tab-id={tab.id}
      role="presentation"
      style={{ transform: translateX ? `translate3d(${translateX}px, 0, 0)` : undefined }}
      title={tab.path}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (onBeginTabDrag(tab.id, event)) {
          onSelectFile(tab);
        }
      }}
      onPointerMove={onUpdateTabDrag}
      onPointerUp={onFinishTabDrag}
      onPointerCancel={onResetDragState}
      onLostPointerCapture={onResetDragState}
    >
      <span className="reference-editor-tab-bridge" aria-hidden="true" />
      <button
        type="button"
        className="reference-editor-tab-trigger"
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          if (onShouldSuppressClick(tab.id)) {
            event.preventDefault();
            return;
          }
          onSelectFile(tab);
        }}
      >
        <FileCode2 className={tabIconClassName} size={16} aria-hidden="true" />
        <span className={tabLabelClassName} title={tab.name}>{tab.name}</span>
        <span
          className={tabDirtyClassName}
          data-visible={tabDirty ? "true" : undefined}
          aria-label={tabDirty ? "Unsaved changes" : undefined}
        >
          •
        </span>
      </button>
      <button
        type="button"
        className="reference-editor-tab-close"
        aria-label={`Close ${tab.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onCloseFileTab(tab.id);
        }}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function EditorTabStrip({
  tabs,
  selectedFileId,
  dirtyFileIds,
  dragState,
  settling,
  stripRef,
  onOpenNewTab,
  onSelectFile,
  onCloseFileTab,
  onBeginTabDrag,
  onUpdateTabDrag,
  onFinishTabDrag,
  onResetDragState,
  onGetTabDragTranslateX,
  onShouldSuppressClick,
}: EditorTabStripProps) {
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const [tabWidth, setTabWidth] = useState(() => getNaturalTabWidth());
  const prevTabsLength = useRef(tabs.length);
  const pendingScroll = useRef(false);

  useLayoutEffect(() => {
    if (tabs.length > prevTabsLength.current) {
      pendingScroll.current = true;
    }
    prevTabsLength.current = tabs.length;
  }, [tabs.length]);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const scrollArea = strip?.querySelector<HTMLElement>(".reference-editor-tab-scroll");
    if (!strip || !scrollArea) return undefined;

    const measureLayout = () => {
      const tabCount = tabs.length;
      const naturalTabWidth = getNaturalTabWidth();

      // Use exact CSS constants to eliminate expensive synchronous getComputedStyle reflows
      const buttonWidth = 32; // .reference-editor-tab-new (2rem = 32px)
      const scrollPadding = 14; // .reference-editor-tab-scroll padding-left (8px) + padding-right (6px)
      const tabMargin = 2; // .reference-editor-tab margin-right (0.125rem = 2px)

      const availableWidth = Math.max(0, strip.clientWidth - buttonWidth - scrollPadding);
      const nextTabWidth = tabCount > 0
        ? Math.max(minTabWidth, Math.min(naturalTabWidth, (availableWidth / tabCount) - tabMargin))
        : naturalTabWidth;

      const totalTabsWidth = tabCount * (nextTabWidth + tabMargin);
      const isOverflowing = totalTabsWidth + scrollPadding + buttonWidth > strip.clientWidth;

      if (nextTabWidth !== tabWidth || isOverflowing !== tabsOverflow) {
        setTabWidth(nextTabWidth);
        setTabsOverflow(isOverflowing);
      } else if (pendingScroll.current) {
        scrollArea.scrollLeft = scrollArea.scrollWidth;
        pendingScroll.current = false;
      } else {
        // Intentionally empty to satisfy sonarjs/elseif-without-else
      }
    };

    measureLayout();

    const observer = new ResizeObserver(() => {
      pendingScroll.current = false; // Do not trigger auto-scroll to end on manual window resizes
      measureLayout();
    });

    observer.observe(strip);
    return () => observer.disconnect();
  }, [stripRef, tabs.length, tabWidth, tabsOverflow]);

  const scrollTabs = (event: ReactWheelEvent<HTMLDivElement>) => {
    const scrollArea = event.currentTarget.querySelector<HTMLElement>(".reference-editor-tab-scroll");
    if (!scrollArea) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    event.preventDefault();
    scrollArea.scrollLeft += delta;
  };

  return (
    <div
      ref={stripRef}
      className={tabStripClassName}
      role="tablist"
      aria-label="Open editor tabs"
      style={{ "--reference-tab-width": `${tabWidth}px` } as CSSProperties}
      data-overflowing={tabsOverflow ? "true" : undefined}
      data-drag-active={dragState?.started ? "true" : undefined}
      data-drag-settling={settling ? "true" : undefined}
      onWheel={scrollTabs}
    >
      <div className={tabScrollClassName}>
        {tabs.map((tab) => (
          <EditorTab
            key={tab.id}
            tab={tab}
            active={tab.id === selectedFileId}
            tabDirty={dirtyFileIds.includes(tab.id)}
            translateX={onGetTabDragTranslateX(tab.id)}
            isDragging={Boolean(dragState?.started && dragState.sourceFileId === tab.id)}
            onSelectFile={onSelectFile}
            onCloseFileTab={onCloseFileTab}
            onBeginTabDrag={onBeginTabDrag}
            onUpdateTabDrag={onUpdateTabDrag}
            onFinishTabDrag={onFinishTabDrag}
            onResetDragState={onResetDragState}
            onShouldSuppressClick={onShouldSuppressClick}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="window"
        size="window-icon"
        className="reference-editor-tab-new"
        aria-label="Open new tab"
        title="Open new tab"
        onClick={onOpenNewTab}
      >
        <Plus size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function EditorTabs({
  tabs,
  selectedFileId,
  dirtyFileIds,
  menuActions = [],
  onSelectFile,
  onCloseFileTab,
  onCloseAllFileTabs,
  onReorderFileTabs,
  onOpenNewTab,
}: EditorTabsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tabQuery, setTabQuery] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const filteredTabs = useMemo(() => {
    const query = tabQuery.trim().toLocaleLowerCase();
    if (!query) return tabs;
    return tabs.filter((tab) =>
      `${tab.name} ${tab.path}`.toLocaleLowerCase().includes(query)
    );
  }, [tabQuery, tabs]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeMenu = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [menuOpen]);
  const tabDrag = useEditorTabDrag(tabs, onReorderFileTabs);

  return (
    <div className="reference-editor-tabs">
      <div className="reference-editor-tab-actions" ref={menuRef}>
        <Button
          type="button"
          variant="window"
          size="window-icon"
          className="reference-editor-tab-menu-trigger"
          aria-label="Open tab actions"
          aria-expanded={menuOpen}
          title="Tab actions"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </Button>
        {menuOpen ? (
          <EditorTabActionsMenu
            tabs={tabs}
            filteredTabs={filteredTabs}
            selectedFileId={selectedFileId}
            tabQuery={tabQuery}
            menuActions={menuActions}
            onTabQueryChange={setTabQuery}
            onSelectFile={onSelectFile}
            onCloseFileTab={onCloseFileTab}
            onCloseAllFileTabs={onCloseAllFileTabs}
            onClose={() => setMenuOpen(false)}
          />
        ) : null}
      </div>
      <EditorTabStrip
        tabs={tabs}
        selectedFileId={selectedFileId}
        dirtyFileIds={dirtyFileIds}
        dragState={tabDrag.dragState}
        settling={tabDrag.settling}
        stripRef={tabDrag.stripRef}
        onOpenNewTab={onOpenNewTab}
        onSelectFile={onSelectFile}
        onCloseFileTab={onCloseFileTab}
        onBeginTabDrag={tabDrag.beginTabDrag}
        onUpdateTabDrag={tabDrag.updateTabDrag}
        onFinishTabDrag={tabDrag.finishTabDrag}
        onResetDragState={tabDrag.resetDragState}
        onGetTabDragTranslateX={tabDrag.getTabDragTranslateX}
        onShouldSuppressClick={tabDrag.shouldSuppressClick}
      />
    </div>
  );
}

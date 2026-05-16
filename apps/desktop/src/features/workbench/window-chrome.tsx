import { useRef } from "react";
import type { ReactNode } from "react";
import {
  Copy,
  Minus,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "../../../../../vision/logo-01.svg?url";
import type { ActivityTool, WorkbenchProps } from "../../types";
import { EditorTabs } from "../editor-tabs/editor-tabs";
import { referenceActivityItems } from "../activity-tools/activity-tools";
import type { ReferenceBottomPanelId } from "./bottom-panel";
import {
  beginReferenceWindowDrag,
  runReferenceWindowCommand,
  useReferenceSnapLayoutButtonRect,
  useReferenceWindowMaximized,
} from "./window-controls";

export function ReferenceActivityRail({
  activeTool,
  settingsDialog,
  onSelectTool,
}: {
  activeTool: ActivityTool;
  settingsDialog: ReactNode;
  onSelectTool: (tool: ActivityTool) => void;
}) {
  return (
    <aside className="flex w-[72px] shrink-0 flex-col border-r border-transparent bg-transparent">
      <div className="h-[46px] shrink-0" onMouseDown={beginReferenceWindowDrag} />
      <nav className="flex flex-1 flex-col items-start gap-3 px-4 pb-4 pt-4" aria-label="Primary tools">
        {referenceActivityItems.map((item) => (
          <ReferenceActivityButton
            key={item.id}
            item={item}
            active={item.id === activeTool}
            onSelectTool={onSelectTool}
          />
        ))}
        <div className="flex-1" />
        {settingsDialog}
      </nav>
    </aside>
  );
}

export function ReferenceBrandLogo() {
  return (
    <div className="pointer-events-none absolute left-4 top-[6px] z-40 flex h-[42px] items-center">
      <img
        src={logoUrl}
        alt="Chemd"
        className="h-[42px] w-20 object-contain"
        draggable={false}
      />
    </div>
  );
}

export function ReferenceGlobalHeaderActions({
  bottomPanel,
  onToggleTerminal,
}: {
  bottomPanel: ReferenceBottomPanelId | null;
  onToggleTerminal: () => void;
}) {
  return (
    <div className="reference-editor-tab-actions absolute left-[124px] top-1.5 z-40 flex h-10 items-center">
      <Button
        type="button"
        variant="window"
        size="window-icon"
        className="reference-editor-tab-menu-trigger"
        data-active={bottomPanel === "terminal" ? "true" : undefined}
        aria-pressed={bottomPanel === "terminal"}
        aria-label="Toggle terminal panel"
        title="Toggle terminal panel"
        onClick={onToggleTerminal}
      >
        <Terminal size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

function ReferenceActivityButton({
  item,
  active,
  onSelectTool,
}: {
  item: (typeof referenceActivityItems)[number];
  active: boolean;
  onSelectTool: (tool: ActivityTool) => void;
}) {
  const Icon = item.icon;
  return (
    <Button
      type="button"
      variant="rail"
      size="icon-xl"
      data-active={active ? "true" : undefined}
      aria-label={item.label}
      aria-pressed={active}
      title={item.label}
      onClick={() => onSelectTool(item.id)}
    >
      <Icon size={21} strokeWidth={2} />
    </Button>
  );
}

export function ReferenceTabBar({
  openedTabs,
  dirtyFileIds,
  selectedFileId,
  sidebarVisible,
  bottomPanel,
  onToggleTerminal,
  onSelectFile,
  onCloseFileTab,
  onReorderFileTabs,
  onOpenNewTab,
}: {
  openedTabs: WorkbenchProps["openedTabs"];
  dirtyFileIds: WorkbenchProps["dirtyFileIds"];
  selectedFileId: string;
  sidebarVisible: boolean;
  bottomPanel: ReferenceBottomPanelId | null;
  onToggleTerminal: () => void;
  onSelectFile: WorkbenchProps["onSelectFile"];
  onCloseFileTab: WorkbenchProps["onCloseFileTab"];
  onReorderFileTabs: WorkbenchProps["onReorderFileTabs"];
  onOpenNewTab: WorkbenchProps["onOpenNewTab"];
}) {
  const isMaximized = useReferenceWindowMaximized();
  const maximizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const snapButtonState = useReferenceSnapLayoutButtonRect(maximizeButtonRef);

  return (
    <header
      className="relative z-30 flex h-[46px] shrink-0 items-center border-b border-transparent bg-transparent"
      onMouseDown={beginReferenceWindowDrag}
    >
      <div
        className="reference-sidebar-spacer flex h-full shrink-0 items-center gap-4 overflow-hidden border-r border-transparent px-4 transition-[width,opacity] duration-200 ease-out"
        style={{ width: sidebarVisible ? "var(--reference-sidebar-width)" : 0, opacity: sidebarVisible ? 1 : 0 }}
      >
        <div className="h-full flex-1" />
      </div>
      <div className="grid h-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center pl-2 pr-2">
        <EditorTabs
          tabs={openedTabs}
          selectedFileId={selectedFileId}
          dirtyFileIds={dirtyFileIds}
          onSelectFile={onSelectFile}
          onCloseFileTab={onCloseFileTab}
          onReorderFileTabs={onReorderFileTabs}
          onOpenNewTab={onOpenNewTab}
          menuActions={sidebarVisible ? [] : [{
            id: "terminal",
            label: "Terminal",
            icon: <Terminal size={13} aria-hidden="true" />,
            active: bottomPanel === "terminal",
            onSelect: onToggleTerminal
          }]}
        />
        <div className="flex h-full items-center gap-2 pl-5 text-foreground">
          <Button
            type="button"
            variant="window"
            size="window-icon"
            aria-label="Minimize window"
            onClick={() => void runReferenceWindowCommand("minimize")}
          >
            <Minus size={16} strokeWidth={3} aria-hidden="true" />
          </Button>
          <Button
            ref={maximizeButtonRef}
            type="button"
            variant="window"
            size="window-icon"
            data-maximized={isMaximized ? "true" : undefined}
            data-snap-hover={snapButtonState.hovered ? "true" : undefined}
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
            title={isMaximized ? "Restore window" : "Maximize window"}
            className="data-[snap-hover=true]:bg-white/45 data-[snap-hover=true]:text-foreground data-[snap-hover=true]:shadow-sm"
            onClick={() => void runReferenceWindowCommand("toggleMaximize")}
          >
            {isMaximized
              ? <Copy size={15} strokeWidth={2} aria-hidden="true" />
              : <Square size={15} strokeWidth={2} aria-hidden="true" />}
          </Button>
          <Button
            type="button"
            variant="window"
            size="window-icon"
            data-control="close"
            aria-label="Close window"
            title="Close window"
            onClick={() => void runReferenceWindowCommand("close")}
          >
            <X size={16} strokeWidth={3} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}

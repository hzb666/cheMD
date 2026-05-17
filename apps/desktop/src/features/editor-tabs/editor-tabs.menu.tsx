import { FileCode2, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceFileEntry } from "../../contracts";
import { useConfirmAction } from "../../hooks/use-confirm-action";

export interface EditorTabMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onSelect: () => void;
}

const menuItemClassName = "reference-editor-tab-menu-item grid h-11 min-h-8 min-w-0 grid-cols-[minmax(0,1fr)_1.375rem] items-center gap-1 rounded-sm pr-1";
const menuTabSelectClassName = "reference-editor-tab-menu-tab-select flex h-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border-0 px-2 text-left text-sm font-semibold shadow-none outline-none transition-colors duration-150 ease-in-out";
const menuActionClassName = "reference-editor-tab-menu-action flex h-11 min-w-0 cursor-pointer items-center gap-2 rounded-sm border-0 px-2 text-left text-sm font-semibold shadow-none outline-none transition-[background-color,color,box-shadow] duration-150 ease-in-out";
const menuLabelClassName = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";

type EditorTabActionsMenuProps = {
  tabs: readonly WorkspaceFileEntry[];
  filteredTabs: readonly WorkspaceFileEntry[];
  selectedFileId: string;
  tabQuery: string;
  menuActions: readonly EditorTabMenuAction[];
  onTabQueryChange: (query: string) => void;
  onSelectFile: (file: WorkspaceFileEntry) => void;
  onCloseFileTab: (fileId: string) => void;
  onCloseAllFileTabs: () => void;
  onClose: () => void;
};

export function EditorTabActionsMenu({
  tabs,
  filteredTabs,
  selectedFileId,
  tabQuery,
  menuActions,
  onTabQueryChange,
  onSelectFile,
  onCloseFileTab,
  onCloseAllFileTabs,
  onClose,
}: EditorTabActionsMenuProps) {
  const closeAllAction = useConfirmAction({
    disabled: tabs.length === 0,
    onConfirm: () => {
      onCloseAllFileTabs();
      onClose();
    },
  });

  return (
    <div
      className="reference-editor-tab-menu absolute left-0 top-full z-30 flex h-auto max-h-[min(34rem,calc(100vh-4rem))] w-72 flex-col gap-2 overflow-hidden rounded-sm p-2"
      role="menu"
      onPointerDownCapture={(event) => {
        if (!closeAllAction.isConfirming) return;
        const target = event.target as Element;
        if (target.closest(".reference-editor-tab-menu-command")) return;
        closeAllAction.reset();
      }}
    >
      <label className="reference-editor-tab-search flex h-11 flex-none items-center gap-2 rounded-sm px-2 text-muted-foreground">
        <Search size={14} aria-hidden="true" />
        <input
          className="min-w-0 flex-1 border border-transparent border-b-0 bg-transparent text-sm font-medium text-foreground outline-none"
          value={tabQuery}
          placeholder="Search tabs"
          onChange={(event) => onTabQueryChange(event.target.value)}
        />
      </label>
      <div className="reference-editor-tab-menu-list flex min-h-0 flex-[1_1_auto] flex-col gap-0.5 overflow-y-auto">
        {filteredTabs.map((tab) => (
          <div
            key={tab.id}
            className={menuItemClassName}
            data-active={tab.id === selectedFileId ? "true" : undefined}
            role="none"
            title={tab.path}
          >
            <button
              type="button"
              className={menuTabSelectClassName}
              role="menuitem"
              onClick={() => {
                closeAllAction.reset();
                onSelectFile(tab);
                onClose();
              }}
            >
              <FileCode2 size={14} aria-hidden="true" />
              <span className={menuLabelClassName}>{tab.name}</span>
            </button>
            <button
              type="button"
              className="reference-editor-tab-menu-close grid cursor-pointer place-items-center rounded-sm border-0 outline-none transition-[background-color,color,opacity,box-shadow] duration-150 ease-in-out"
              aria-label={`Close ${tab.name}`}
              role="menuitem"
              onClick={() => {
                closeAllAction.reset();
                onCloseFileTab(tab.id);
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {menuActions.length > 0 ? (
        <div className="reference-editor-tab-menu-section flex flex-none flex-col gap-0.5 border-t pt-1.5" aria-label="Workbench actions">
          {menuActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={menuActionClassName}
              data-active={action.active ? "true" : undefined}
              role="menuitem"
              onClick={() => {
                closeAllAction.reset();
                action.onSelect();
                onClose();
              }}
            >
              {action.icon}
              <span className={menuLabelClassName}>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="reference-editor-tab-menu-command flex h-11 min-w-0 flex-none cursor-pointer items-center justify-center rounded-sm border-0 px-2 text-center text-sm font-bold shadow-none outline-none"
        role="menuitem"
        data-confirming={closeAllAction.isConfirming ? "true" : undefined}
        disabled={tabs.length === 0}
        onBlur={closeAllAction.reset}
        onClick={() => void closeAllAction.run()}
      >
        {closeAllAction.isConfirming ? "Confirm close all" : "Close all tabs"}
      </button>
    </div>
  );
}

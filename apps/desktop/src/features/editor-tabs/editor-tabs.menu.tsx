import { FileCode2, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceFileEntry } from "../../contracts";

export interface EditorTabMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onSelect: () => void;
}

const menuItemClassName = "reference-editor-tab-menu-item flex min-h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-left text-xs font-semibold text-muted-foreground shadow-none outline-none transition-[background-color,color,box-shadow] duration-150 ease-in-out";
const menuActionClassName = "reference-editor-tab-menu-action flex min-h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-left text-xs font-semibold text-muted-foreground shadow-none outline-none transition-[background-color,color,box-shadow] duration-150 ease-in-out";
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
  onClose,
}: EditorTabActionsMenuProps) {
  return (
    <div
      className="reference-editor-tab-menu absolute left-0 top-full z-30 flex h-auto max-h-[min(34rem,calc(100vh-4rem))] w-64 flex-col gap-2 overflow-hidden rounded-lg p-1.5"
      role="menu"
    >
      <label className="reference-editor-tab-search flex h-9 flex-none items-center gap-1.5 rounded-lg px-2 text-muted-foreground">
        <Search size={13} aria-hidden="true" />
        <input
          className="min-w-0 border border-transparent border-b-0 bg-transparent text-foreground outline-none [font:inherit]"
          value={tabQuery}
          placeholder="Search tabs"
          onChange={(event) => onTabQueryChange(event.target.value)}
        />
      </label>
      <div className="reference-editor-tab-menu-list flex min-h-0 flex-[1_1_auto] flex-col gap-0.5 overflow-y-auto">
        {filteredTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={menuItemClassName}
            data-active={tab.id === selectedFileId ? "true" : undefined}
            role="menuitem"
            title={tab.path}
            onClick={() => {
              onSelectFile(tab);
              onClose();
            }}
          >
            <FileCode2 size={13} aria-hidden="true" />
            <span className={menuLabelClassName}>{tab.name}</span>
          </button>
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
        className="reference-editor-tab-menu-command flex min-h-9 min-w-0 flex-none cursor-pointer items-center justify-center rounded-lg border-0 bg-destructive px-2 text-center text-xs font-bold text-white shadow-none outline-none transition-[background-color,color,box-shadow] duration-150 ease-in-out"
        role="menuitem"
        disabled={tabs.length === 0}
        onClick={() => {
          tabs.forEach((tab) => onCloseFileTab(tab.id));
          onClose();
        }}
      >
        Close all tabs
      </button>
    </div>
  );
}

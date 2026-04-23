"use client";

import React from "react";
import type { ReactNode } from "react";

import { CopyIconButton } from "../../../components/copy-icon-button";
import { EditorSurface } from "./EditorSurface";

interface EditorShellProps {
  source: string;
  lineCount: number;
  profileId: string;
  toolbarActions?: ReactNode;
  authoringPanel?: ReactNode;
  statusMessage?: string | null;
  onSourceChange?: (nextSource: string) => void;
}

export const EditorShell = ({
  source,
  lineCount,
  profileId: _profileId,
  toolbarActions,
  authoringPanel,
  statusMessage,
  onSourceChange
}: EditorShellProps) => (
  <div
    data-playground-panel="editor"
    className="flex flex-col h-full bg-background border-r border-border min-h-[500px]"
  >
    <div className="flex flex-row items-center justify-between shrink-0 h-11 px-4 py-0 border-b border-border bg-background">
      <div className="flex items-center gap-2">
        <h2 className="notion-font-caption text-muted-foreground">Editor</h2>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {toolbarActions}
          <CopyIconButton
            copyText={source}
            label="Copy editor source"
            className="playground-topbar-button notion-font-ui h-8 w-8 p-0"
          />
        </div>
        <span className="notion-font-caption text-muted-foreground opacity-70">
          <span className="editor-gutter-font">{lineCount}</span> lines
        </span>
      </div>
    </div>

    {statusMessage ? (
      <div className="px-4 py-2 border-b border-border bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 notion-font-caption">
        {statusMessage}
      </div>
    ) : null}

    {authoringPanel}

    <div className="flex-1 min-h-0 p-0 relative">
      <div className="h-full relative z-10 bg-background">
        <EditorSurface source={source} onSourceChange={onSourceChange} />
      </div>
    </div>
  </div>
);

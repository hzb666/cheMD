"use client";

import React from "react";
import type { ReactNode } from "react";

import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";

interface EditorShellProps {
  source: string;
  lineCount: number;
  profileId: string;
  toolbarActions?: ReactNode;
  statusMessage?: string | null;
  onSourceChange?: (nextSource: string) => void;
}

export const EditorShell = ({
  source,
  lineCount,
  profileId,
  toolbarActions,
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
        {toolbarActions}
        <span className="notion-font-caption text-muted-foreground opacity-70">{lineCount} lines</span>
      </div>
    </div>

    {statusMessage ? (
      <div className="px-4 py-2 border-b border-border bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 notion-font-caption">
        {statusMessage}
      </div>
    ) : null}

    <div className="flex-1 min-h-0 p-0 relative">
      <div className="h-full relative z-10 bg-background">
        <Label className="sr-only" htmlFor="chemd-source-editor">
          Chemd source editor
        </Label>
        <Textarea
          id="chemd-source-editor"
          className="h-full w-full resize-none p-4 font-mono text-sm leading-relaxed border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent rounded-none focus-visible:shadow-[inset_0_1px_4px_rgba(0,0,0,0.05)] dark:focus-visible:shadow-[inset_0_1px_4px_rgba(0,0,0,0.25)] transition-shadow duration-200"
          value={source}
          onChange={(event) => onSourceChange?.(event.target.value)}
          spellCheck={false}
          placeholder="Start typing your chemical markdown..."
        />
      </div>
    </div>
  </div>
);

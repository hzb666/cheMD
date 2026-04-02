"use client";

import React from "react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "../../../components/ui/card";
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
  <Card
    data-playground-panel="editor"
    className="playground-panel workspace-panel workspace-panel-editor panel-stack rounded-none border-0 shadow-none"
  >
    <CardHeader className="panel-header panel-toolbar shrink-0 items-center space-y-0 p-0">
      <div className="panel-heading-cluster">
        <p className="panel-kicker">Editor</p>
      </div>
      <div className="panel-inline-meta">
        {toolbarActions}
        <span className="toolbar-chip">{lineCount} lines</span>
        <span className="toolbar-chip">YAML {profileId}</span>
      </div>
    </CardHeader>
    {statusMessage ? <p className="status-text shrink-0">{statusMessage}</p> : null}

    <CardContent className="playground-panel-content p-0">
      <div className="editor-surface min-h-0 flex-1">
        <Label className="sr-only" htmlFor="chemd-source-editor">
          Chemd source editor
        </Label>
        <Textarea
          id="chemd-source-editor"
          className="editor-textarea playground-editor-textarea scroll-area"
          value={source}
          onChange={(event) => onSourceChange?.(event.target.value)}
          spellCheck={false}
        />
      </div>
    </CardContent>
  </Card>
);

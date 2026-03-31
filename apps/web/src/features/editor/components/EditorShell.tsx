"use client";

import React from "react";

interface EditorShellProps {
  source: string;
  lineCount: number;
  profileId: string;
  onSourceChange?: (nextSource: string) => void;
}

export const EditorShell = ({
  source,
  lineCount,
  profileId,
  onSourceChange
}: EditorShellProps) => (
  <section className="workspace-panel workspace-panel-editor panel-stack min-h-0">
    <div className="panel-header panel-toolbar shrink-0 items-center">
      <div className="panel-heading-cluster">
        <p className="panel-kicker">Editor</p>
      </div>
      <div className="panel-inline-meta">
        <span className="toolbar-chip">{lineCount} lines</span>
        <span className="toolbar-chip">YAML {profileId}</span>
      </div>
    </div>

    <div className="editor-surface min-h-0 flex-1">
      <label className="sr-only" htmlFor="chemd-source-editor">
        Chemd source editor
      </label>
      <textarea
        id="chemd-source-editor"
        className="editor-textarea scroll-area"
        value={source}
        onChange={(event) => onSourceChange?.(event.target.value)}
        spellCheck={false}
      />
    </div>
  </section>
);

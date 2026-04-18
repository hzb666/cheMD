"use client";

import React from "react";
import type { DiagnosticQuickFix, DiagnosticWithQuickFixes } from "@chemd/compiler";

interface DiagnosticQuickFixPanelProps {
  diagnostics: DiagnosticWithQuickFixes[];
  quickFixesEnabled?: boolean;
  onApplyQuickFix?: (
    diagnostic: DiagnosticWithQuickFixes,
    quickFix: DiagnosticQuickFix
  ) => void;
}

const readLayerLabel = (diagnostic: DiagnosticWithQuickFixes): string =>
  diagnostic.sourceLayer ?? "compiler";

const readSourceLabel = (diagnostic: DiagnosticWithQuickFixes): string | undefined => {
  const sourceNodeId = diagnostic.sourceNodeId ?? diagnostic.nodeId;
  if (!sourceNodeId) {
    return undefined;
  }

  return diagnostic.sourceField
    ? `${sourceNodeId}.${diagnostic.sourceField}`
    : sourceNodeId;
};

export const DiagnosticQuickFixPanel = ({
  diagnostics,
  quickFixesEnabled = true,
  onApplyQuickFix
}: DiagnosticQuickFixPanelProps) => (
  <div className="absolute inset-0 overflow-auto bg-background p-5">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="notion-font-label text-[14px] font-semibold text-foreground">
          Diagnostics
        </h2>
        <p className="notion-font-caption text-[13px] text-muted-foreground">
          {diagnostics.length === 0 ? "Clean compile" : `${diagnostics.length} diagnostics`}
        </p>
      </div>
    </div>

    {diagnostics.length === 0 ? (
      <p className="notion-font-caption text-[13px] text-muted-foreground">
        No parser, resolver, typechecker, or runtime diagnostics.
      </p>
    ) : (
      <ul className="space-y-3">
        {diagnostics.map((diagnostic, index) => {
          const sourceLabel = readSourceLabel(diagnostic);
          const quickFixes = diagnostic.quickFixes ?? [];

          return (
            <li
              key={`${diagnostic.code}-${sourceLabel ?? index}`}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="notion-font-badge rounded-md bg-accent px-2 py-0.5 text-[12px] text-accent-foreground">
                  {diagnostic.code}
                </span>
                <span className="notion-font-caption text-[12px] text-muted-foreground">
                  {readLayerLabel(diagnostic)}
                </span>
                {sourceLabel ? (
                  <span className="notion-font-caption text-[12px] text-muted-foreground">
                    {sourceLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 notion-font-ui text-[13px] leading-5 text-foreground">
                {diagnostic.message}
              </p>
              {quickFixes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickFixes.map((quickFix) => (
                    <button
                      key={`${diagnostic.code}-${quickFix.kind}-${quickFix.title}`}
                      type="button"
                      disabled={!onApplyQuickFix || !quickFixesEnabled}
                      className="playground-topbar-button notion-font-ui h-8 rounded-md border border-border px-3 text-[13px]"
                      onClick={() => onApplyQuickFix?.(diagnostic, quickFix)}
                    >
                      {quickFix.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

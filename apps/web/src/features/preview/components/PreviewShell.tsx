"use client";

import React from "react";
import type { RenderOptions } from "@chemd/render-profile";
import type { DiagnosticQuickFix, DiagnosticWithQuickFixes } from "@chemd/compiler";
import type { ChemEditorDraftWithBlockId } from "../../chem-editor/types";

import { CopyIconButton } from "../../../components/copy-icon-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { DiagnosticQuickFixPanel } from "../../diagnostics/components/DiagnosticQuickFixPanel";
import { DocumentPreview } from "./DocumentPreview";
import { usePreviewShellController } from "../hooks/usePreviewShellController";

interface PreviewShellProps {
  html: string;
  json: string;
  docxBridge: string;
  source: string;
  documentId?: string;
  sessionId?: string;
  renderOptions?: RenderOptions;
  previewIsFresh?: boolean;
  onEditChemd?: (draft: ChemEditorDraftWithBlockId) => void | Promise<void>;
  diagnostics?: DiagnosticWithQuickFixes[];
  onApplyQuickFix?: (
    diagnostic: DiagnosticWithQuickFixes,
    quickFix: DiagnosticQuickFix
  ) => void;
}

type PreviewTabValue = "preview" | "json" | "docxBridge" | "diagnostics";

const PreviewShell = ({
  html,
  json,
  docxBridge,
  source,
  documentId,
  sessionId,
  renderOptions,
  previewIsFresh = true,
  onEditChemd,
  diagnostics = [],
  onApplyQuickFix
}: PreviewShellProps) => {
  const {
    activeTab,
    setActiveTab,
    previewFrameRef,
    hydratedHtml,
    activeCode
  } = usePreviewShellController({
    html,
    json,
    docxBridge,
    source,
    documentId,
    sessionId,
    renderOptions,
    previewIsFresh,
    onEditChemd
  });

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as PreviewTabValue)}
      className="flex flex-col h-full min-h-[500px] w-full"
    >
      <div
        data-playground-panel="preview"
        className="flex flex-col h-full bg-background relative z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-border"
      >
        <div className="flex flex-row items-center justify-between shrink-0 h-11 px-4 py-0 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <TabsList className="playground-tab-list notion-font-ui">
              <TabsTrigger
                value="preview"
                className="playground-tab-trigger notion-font-ui h-8 px-3 py-0 text-[13px] data-[state=active]:font-semibold"
              >
                Preview
              </TabsTrigger>
              <TabsTrigger
                value="json"
                className="playground-tab-trigger notion-font-ui h-8 px-3 py-0 text-[13px] data-[state=active]:font-semibold"
              >
                JSON
              </TabsTrigger>
              <TabsTrigger
                value="docxBridge"
                className="playground-tab-trigger notion-font-ui h-8 px-3 py-0 text-[13px] data-[state=active]:font-semibold"
              >
                DOCX
              </TabsTrigger>
              <TabsTrigger
                value="diagnostics"
                className="playground-tab-trigger notion-font-ui h-8 px-3 py-0 text-[13px] data-[state=active]:font-semibold"
              >
                Diagnostics
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "json" ? (
              <CopyIconButton
                copyText={activeCode}
                label="Copy JSON output"
                className="playground-topbar-button notion-font-ui h-8 w-8 p-0"
              />
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-h-0 p-0 flex flex-col relative bg-background">
          {!previewIsFresh ? (
            <div className="px-4 py-2 border-b border-border bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 notion-font-caption">
              Preview updating; export and structure edit are disabled.
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col w-full relative">
            <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full overflow-auto">
              <div className="relative w-full min-h-full bg-background">
                <DocumentPreview html={hydratedHtml} frameRef={previewFrameRef} />
              </div>
            </TabsContent>

            <TabsContent value="json" className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full">
              <div className="absolute inset-0 p-6 overflow-auto bg-background" data-preview-code-surface="json">
                <pre className="font-mono text-[0.85rem] leading-relaxed text-foreground opacity-90">
                  <code>{activeCode}</code>
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="docxBridge" className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full">
              <div className="absolute inset-0 p-6 overflow-auto bg-background">
                <pre className="font-mono text-[0.85rem] leading-relaxed text-foreground opacity-90">
                  <code>{activeCode}</code>
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="diagnostics" className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full">
              <DiagnosticQuickFixPanel
                diagnostics={diagnostics}
                quickFixesEnabled={previewIsFresh}
                onApplyQuickFix={onApplyQuickFix}
              />
            </TabsContent>
          </div>
        </div>
      </div>
    </Tabs>
  );
};

export default PreviewShell;

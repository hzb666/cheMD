"use client";

import React from "react";
import type { RenderOptions } from "@chemd/render-profile";
import type { ChemEditorDraftWithBlockId } from "../../chem-editor/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
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
}

type PreviewTabValue = "preview" | "json" | "docxBridge";

const PreviewShell = ({
  html,
  json,
  docxBridge,
  source,
  documentId,
  sessionId,
  renderOptions,
  previewIsFresh = true,
  onEditChemd
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
            <TabsList className="bg-muted p-1 h-auto space-x-1 rounded-md">
              <TabsTrigger
                value="preview"
                className="notion-font-ui text-[13px] px-3 py-1 data-[state=active]:font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground rounded transition-all"
              >
                Preview
              </TabsTrigger>
              <TabsTrigger
                value="json"
                className="notion-font-ui text-[13px] px-3 py-1 data-[state=active]:font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground rounded transition-all"
              >
                JSON
              </TabsTrigger>
              <TabsTrigger
                value="docxBridge"
                className="notion-font-ui text-[13px] px-3 py-1 data-[state=active]:font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground rounded transition-all"
              >
                DOCX
              </TabsTrigger>
            </TabsList>
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
              {/* Force white/light background for the iframe preview since chemical structure SVGs are often black */}
              <div className="relative w-full min-h-full bg-white">
                <DocumentPreview html={hydratedHtml} frameRef={previewFrameRef} />
              </div>
            </TabsContent>

            <TabsContent value="json" className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full">
              <div className="absolute inset-0 p-6 overflow-auto bg-background">
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
          </div>
        </div>
      </div>
    </Tabs>
  );
};

export default PreviewShell;

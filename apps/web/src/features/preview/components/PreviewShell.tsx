"use client";

import React, { useEffect, useRef, useState } from "react";

import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useRenderedPreview } from "../../chem-preview/hooks/useRenderedPreview";
import { useDocxExport } from "../../export-docx/hooks/useDocxExport";
import { readPreviewEditMessage } from "../lib/read-preview-edit-message";
import { toSandboxedPreviewDocument } from "../styles/preview-document";

interface PreviewShellProps {
  html: string;
  json: string;
  docxBridge: string;
  source: string;
  documentId?: string;
  sessionId?: string;
  previewIsFresh?: boolean;
  onEditMolecule?: (blockId: string, smiles: string) => void | Promise<void>;
  onEditReaction?: (
    blockId: string,
    reactants: string[],
    products: string[],
    conditions: string[]
  ) => void | Promise<void>;
}

type OutputTab = "preview" | "json" | "docxBridge";

const PreviewShell = ({
  html,
  json,
  docxBridge,
  source,
  documentId,
  sessionId,
  previewIsFresh = true,
  onEditMolecule,
  onEditReaction
}: PreviewShellProps) => {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const { exportingDocx, exportMessage, exportDocx } = useDocxExport({
    payload: { source }
  });
  const { hydratedHtml } = useRenderedPreview(html, { documentId, sessionId });

  useEffect(() => {
    if (!onEditMolecule && !onEditReaction) {
      return undefined;
    }

    const handlePreviewMessage = (event: MessageEvent) => {
      const payload = readPreviewEditMessage(
        event,
        previewFrameRef.current?.contentWindow ?? null,
        previewIsFresh
      );
      if (!payload) {
        return;
      }
      if (payload.kind === "molecule") {
        void onEditMolecule?.(payload.blockId, payload.smiles);
        return;
      }
      void onEditReaction?.(
        payload.blockId,
        payload.reactants,
        payload.products,
        payload.conditions
      );
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => {
      window.removeEventListener("message", handlePreviewMessage);
    };
  }, [onEditMolecule, onEditReaction, previewIsFresh]);

  const activeCode = activeTab === "json" ? json : docxBridge;

  return (
    <Card
      data-playground-panel="preview"
      className="playground-panel workspace-panel workspace-panel-output panel-stack rounded-none border-0 shadow-none"
    >
      <CardHeader className="panel-header panel-toolbar shrink-0 items-center space-y-0 p-0">
        <div className="panel-heading-inline">
          <p className="panel-kicker">Preview</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void exportDocx()}
          disabled={exportingDocx || !previewIsFresh}
          className="button-primary h-auto"
        >
          {exportingDocx ? "Exporting..." : "Export"}
        </Button>
      </CardHeader>

      <CardContent className="playground-panel-content p-0">
        {!previewIsFresh ? (
          <p className="status-text shrink-0">Preview updating; export and structure edit are disabled.</p>
        ) : null}
        {exportMessage ? <p className="status-text shrink-0">{exportMessage}</p> : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as OutputTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="panel-toolbar shrink-0">
            <div className="panel-heading-inline">
              <TabsList className="tab-strip-container">
                <span className="tab-indicator" data-active-tab={activeTab} aria-hidden />
                <TabsTrigger
                  value="preview"
                  className="tab-button"
                  data-active={activeTab === "preview"}
                >
                  Preview
                </TabsTrigger>
                <TabsTrigger
                  value="json"
                  className="tab-button"
                  data-active={activeTab === "json"}
                >
                  JSON
                </TabsTrigger>
                <TabsTrigger
                  value="docxBridge"
                  className="tab-button"
                  data-active={activeTab === "docxBridge"}
                >
                  DOCX
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="detail-card min-h-0 flex-1">
              <div className="detail-card-body preview-canvas h-full">
                <iframe
                  ref={previewFrameRef}
                  title="chemd-preview"
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  className="preview-frame"
                  srcDoc={toSandboxedPreviewDocument(hydratedHtml)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="json" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="detail-card min-h-0 flex-1">
              <div className="detail-card-body h-full">
                <div className="code-surface h-full">
                  <pre className="code-block scroll-area">
                    <code>{activeCode}</code>
                  </pre>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="docxBridge" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="detail-card min-h-0 flex-1">
              <div className="detail-card-body h-full">
                <div className="code-surface h-full">
                  <pre className="code-block scroll-area">
                    <code>{activeCode}</code>
                  </pre>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default PreviewShell;

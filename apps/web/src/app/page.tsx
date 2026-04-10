"use client";

import React from "react";

import logoMark from "../../../../vision/logo-03.png";

import { Separator } from "../components/ui/separator";
import { ThemeToggle } from "../components/theme-toggle";
import { EditorShell } from "../features/editor/components/EditorShell";
import { OcrImportButton } from "../features/ocr/components/OcrImportButton";
import { OcrPasteListener } from "../features/ocr/components/OcrPasteListener";
import { ChemEditorDialog } from "../features/chem-editor/components/ChemEditorDialog";
import { useChemdEditFlow } from "../features/chem-editor/hooks/useChemdEditFlow";
import { useImageOcr } from "../features/ocr/hooks/useImageOcr";
import { usePlaygroundDocumentController } from "../features/playground/hooks/usePlaygroundDocumentController";
import { useDocxExport } from "../features/export-docx/hooks/useDocxExport";
import { Button } from "../components/ui/button";
import PreviewShell from "../features/preview/components/PreviewShell";
import { Activity, FlaskConical } from "lucide-react";

const Page = () => {
  const {
    source,
    result,
    json,
    documentId,
    sessionId,
    lineCount,
    previewIsFresh,
    compileState,
    editorStatus,
    setEditorStatus,
    applySourceChange,
    getLatestSource
  } = usePlaygroundDocumentController();
  const ocr = useImageOcr({
    documentId,
    sessionId,
    getLatestSource,
    onSourceChange: applySourceChange
  });
  const { exportingDocx, exportMessage, exportDocx } = useDocxExport({
    payload: { source }
  });
  const {
    editingChemd,
    closeChemdDialog,
    handleEditChemd,
    handleSaveChemd
  } = useChemdEditFlow({
    documentId,
    sessionId,
    getLatestSource,
    applySourceChange,
    setEditorStatus
  });
  const logoSrc = typeof logoMark === "string" ? logoMark : logoMark.src;
  const diagnosticCount = result.diagnostics.length;
  const applyOcrFile = (file: File) => {
    if (ocr.loading) {
      return;
    }

    void ocr.runOcr(file).then((next) => {
      if (!next) {
        if (ocr.error) {
          setEditorStatus("OCR failed");
        }
        return;
      }

      if (next.kind === "reaction") {
        setEditorStatus(
          next.action === "create_new"
            ? `OCR created reaction block #${next.blockId}`
            : `OCR updated reaction block #${next.blockId}`
        );
        return;
      }

      setEditorStatus(
        next.action === "create_new"
          ? `OCR created molecule block #${next.blockId}`
          : `OCR updated molecule block #${next.blockId}`
      );
    });
  };

  return (
    <main
      data-playground-shell="workbench"
      className="bg-background min-h-screen overflow-auto xl:h-screen xl:overflow-hidden"
    >
      <div className="flex min-h-0 flex-col xl:h-full w-full max-w-[2000px] mx-auto">
        <header className="sticky top-0 z-30 shrink-0 w-full border-b border-border bg-background">
          <div className="flex items-center justify-between h-12 px-3 md:px-5">
            <div className="flex items-center gap-2.5">
              <img src={logoSrc} alt="chemd logo" className="h-4 w-auto pr-1 object-contain dark:invert" />
              <h1 className="notion-font-label text-[14px] text-foreground tracking-tight flex items-center gap-1">
                <FlaskConical className="w-3.5 h-3.5 text-primary" />
                Chemd Playground
              </h1>
            </div>

            <div className="flex items-center gap-3 md:gap-5">
              <div className="hidden md:flex items-center gap-4 text-[0.8rem] text-muted-foreground mr-2">
                <div className="flex max-w-[360px] min-w-0 flex-col items-end text-right">
                  <div className="notion-font-label text-[14px] text-foreground w-full truncate">
                    {result.document.meta.title || "Untitled Document"}
                  </div>
                  <div className="notion-font-caption text-[14px] text-muted-foreground w-full truncate">
                    {[result.document.meta.date, result.document.meta.id].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent text-accent-foreground rounded-full notion-font-badge">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-accent-foreground/50"></span>
                  YAML: {result.renderOptions.profileId}
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full notion-font-badge ${diagnosticCount === 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"}`}>
                  <Activity className="w-3 h-3" />
                  <span>
                    {diagnosticCount === 0 ? "Clean compile" : compileState}
                  </span>
                </div>
              </div>
              <Separator orientation="vertical" className="h-4 hidden md:block" />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <section
          className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 items-stretch xl:items-start xl:overflow-hidden bg-background"
          aria-label="Playground workbench"
        >
          <EditorShell
            source={source}
            lineCount={lineCount}
            profileId={result.renderOptions.profileId}
            toolbarActions={(
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void exportDocx()}
                  disabled={exportingDocx || !previewIsFresh}
                  className="playground-topbar-button notion-font-ui h-8 px-3 text-[13px]"
                >
                  {exportingDocx ? "Exporting..." : "Export DOCX"}
                </Button>
                <OcrImportButton
                  loading={ocr.loading}
                  label="OCR Image"
                  onPickFile={applyOcrFile}
                  className="playground-topbar-button notion-font-ui h-8 px-3 text-[13px]"
                />
              </div>
            )}
            statusMessage={exportMessage ?? ocr.error ?? editorStatus}
            onSourceChange={applySourceChange}
          />
          <PreviewShell
            html={result.html}
            json={json}
            docxBridge={result.docxBridge}
            source={source}
            documentId={documentId}
            sessionId={sessionId}
            renderOptions={result.renderOptions}
            previewIsFresh={previewIsFresh}
            onEditChemd={(draft) => handleEditChemd(draft, previewIsFresh)}
          />
        </section>

        <ChemEditorDialog
          open={Boolean(editingChemd)}
          value={editingChemd}
          onClose={closeChemdDialog}
          onSave={handleSaveChemd}
        />
        <OcrPasteListener enabled={!ocr.loading} onPickFile={applyOcrFile} />
      </div>
    </main>
  );
};

export default Page;

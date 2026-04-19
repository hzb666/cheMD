"use client";

import React, { useEffect, useState } from "react";

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
import { Activity, FlaskConical, LoaderCircle } from "lucide-react";
import {
  applyDiagnosticQuickFix,
  type DiagnosticQuickFix,
  type DiagnosticWithQuickFixes
} from "@chemd/compiler";

interface PlaygroundHeaderProps {
  logoSrc: string;
  title: string;
  subtitle: string;
  profileId: string;
  labStorageStatus: LabStorageStatus;
  diagnosticCount: number;
  compileState: string;
  compileStateTone: "pending" | "success" | "warning";
}

interface EditorToolbarProps {
  exportingDocx: boolean;
  previewIsFresh: boolean;
  ocrLoading: boolean;
  onExportDocx: () => void;
  onPickOcrFile: (file: File) => void;
}

type LabStorageStatus = "ready" | "disconnect";

const readLabStorageStatusPayload = (value: unknown): LabStorageStatus =>
  typeof value === "object"
  && value !== null
  && "status" in value
  && value.status === "ready"
    ? "ready"
    : "disconnect";

const useLabStorageStatus = (): LabStorageStatus => {
  const [status, setStatus] = useState<LabStorageStatus>("disconnect");

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/chem/inventory/status", {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => null)) as unknown;
        if (active) {
          setStatus(response.ok ? readLabStorageStatusPayload(payload) : "disconnect");
        }
      } catch {
        if (active) {
          setStatus("disconnect");
        }
      }
    };

    void loadStatus();

    return () => {
      active = false;
    };
  }, []);

  return status;
};

const PlaygroundHeader = ({
  logoSrc,
  title,
  subtitle,
  profileId,
  labStorageStatus,
  diagnosticCount,
  compileState,
  compileStateTone
}: PlaygroundHeaderProps) => {
  const labStorageStatusLabel = labStorageStatus === "ready" ? "ready" : "Disconnect";
  const labStorageStatusToneClass = labStorageStatus === "ready"
    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
    : "bg-rose-50 text-rose-600 dark:bg-rose-950/45 dark:text-rose-300";
  const labStorageStatusDotClass = labStorageStatus === "ready" ? "bg-emerald-500" : "bg-rose-500";
  const compileBadgeToneClass = compileStateTone === "pending"
    ? "bg-sky-50 text-sky-700 dark:bg-sky-950/45 dark:text-sky-300"
    : compileStateTone === "success"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
      : "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400";
  const compileBadgeLabel = compileStateTone === "success" && diagnosticCount === 0
    ? "Clean compile"
    : compileState;

  return (
    <header className="sticky top-0 z-30 shrink-0 w-full border-b border-border bg-background">
      <div className="flex h-14 items-center justify-between px-3 md:px-5">
        <div className="flex items-center gap-2.5">
          <img src={logoSrc} alt="chemd logo" className="h-5 w-auto pr-1 object-contain dark:invert" />
          <h1 className="notion-font-label text-[14px] text-foreground tracking-tight flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5 text-primary" />
            Chemd Playground
          </h1>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <div className="hidden md:flex items-center gap-4 text-[0.8rem] text-muted-foreground mr-2">
            <div className="flex max-w-[360px] min-w-0 flex-col items-end text-right">
              <div className="notion-font-label text-[14px] text-foreground w-full truncate">{title}</div>
              <div className="notion-font-caption text-[14px] text-muted-foreground w-full truncate">{subtitle}</div>
            </div>
            <div
              className={`group flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-2 py-0.5 notion-font-badge focus:outline-none ${labStorageStatusToneClass}`}
              aria-label={`LSM: ${labStorageStatusLabel}`}
              tabIndex={0}
              title={`LSM: ${labStorageStatusLabel}`}
            >
              <span className={`flex h-1.5 w-1.5 shrink-0 rounded-full ${labStorageStatusDotClass}`}></span>
              <span className="shrink-0">LSM</span>
              <span className="inline-block max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-250 ease-in group-hover:max-w-[10rem] group-hover:opacity-100 group-focus:max-w-[10rem] group-focus:opacity-100">
                : {labStorageStatusLabel}
              </span>
            </div>
            <div
              className="group flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-accent-foreground notion-font-badge focus:outline-none"
              aria-label={`YAML: ${profileId}`}
              tabIndex={0}
              title={`YAML: ${profileId}`}
            >
              <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-accent-foreground/50"></span>
              <span className="shrink-0">YAML</span>
              <span className="inline-block max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-250 ease-in group-hover:max-w-[12rem] group-hover:opacity-100 group-focus:max-w-[12rem] group-focus:opacity-100">
                : {profileId}
              </span>
            </div>
            <div
              className={`flex w-[8.75rem] shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 notion-font-badge ${compileBadgeToneClass}`}
              aria-live="polite"
            >
              {compileStateTone === "pending" ? (
                <LoaderCircle className="w-3 h-3 shrink-0 animate-spin" />
              ) : (
                <Activity className="w-3 h-3 shrink-0" />
              )}
              <span className="min-w-0 truncate">{compileBadgeLabel}</span>
            </div>
          </div>
          <Separator orientation="vertical" className="h-4 hidden md:block" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

const EditorToolbar = ({
  exportingDocx,
  previewIsFresh,
  ocrLoading,
  onExportDocx,
  onPickOcrFile
}: EditorToolbarProps) => (
  <>
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onExportDocx}
      disabled={exportingDocx || !previewIsFresh}
      className="playground-topbar-button notion-font-ui h-8 px-3 text-[13px]"
    >
      {exportingDocx ? "Exporting..." : "Export DOCX"}
    </Button>
    <OcrImportButton
      loading={ocrLoading}
      label="OCR Image"
      onPickFile={onPickOcrFile}
      className="playground-topbar-button notion-font-ui h-8 px-3 text-[13px]"
    />
  </>
);

const Page = () => {
  const labStorageStatus = useLabStorageStatus();
  const {
    source,
    result,
    json,
    compilerOutputCode,
    documentId,
    sessionId,
    lineCount,
    previewIsFresh,
    compileState,
    compileStateTone,
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
  const documentSubtitle = [result.document.meta.date, result.document.meta.id].filter(Boolean).join(" · ");
  const handleApplyQuickFix = (
    diagnostic: DiagnosticWithQuickFixes,
    quickFix: DiagnosticQuickFix
  ) => {
    if (!previewIsFresh) {
      setEditorStatus("Wait for preview to update before applying quick fixes");
      return;
    }

    const currentSource = getLatestSource();
    const nextSource = applyDiagnosticQuickFix(currentSource, diagnostic, quickFix);

    if (nextSource === currentSource) {
      setEditorStatus("Quick fix unavailable for this source");
      return;
    }

    applySourceChange(nextSource);
    setEditorStatus("Applied quick fix");
  };
  const applyOcrFile = (file: File) => {
    if (ocr.loading) {
      return;
    }

    void ocr.runOcr(file).then((next) => {
      if (!next) {
        setEditorStatus("OCR failed");
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
        <PlaygroundHeader
          logoSrc={logoSrc}
          title={result.document.meta.title || "Untitled Document"}
          subtitle={documentSubtitle}
          profileId={result.renderOptions.profileId}
          labStorageStatus={labStorageStatus}
          diagnosticCount={diagnosticCount}
          compileState={compileState}
          compileStateTone={compileStateTone}
        />

        <section
          className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 items-stretch xl:items-start xl:overflow-hidden bg-background"
          aria-label="Playground workbench"
        >
          <EditorShell
            source={source}
            lineCount={lineCount}
            profileId={result.renderOptions.profileId}
            toolbarActions={(
              <EditorToolbar
                exportingDocx={exportingDocx}
                previewIsFresh={previewIsFresh}
                ocrLoading={ocr.loading}
                onExportDocx={() => void exportDocx()}
                onPickOcrFile={applyOcrFile}
              />
            )}
            statusMessage={exportMessage ?? ocr.error ?? editorStatus}
            onSourceChange={applySourceChange}
          />
          <PreviewShell
            html={result.html}
            json={json}
            docxBridge={result.docxBridge}
            compilerOutputCode={compilerOutputCode}
            source={source}
            documentId={documentId}
            sessionId={sessionId}
            renderOptions={result.renderOptions}
            previewIsFresh={previewIsFresh}
            onEditChemd={(draft) => handleEditChemd(draft, previewIsFresh)}
            diagnostics={result.diagnostics}
            onApplyQuickFix={handleApplyQuickFix}
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

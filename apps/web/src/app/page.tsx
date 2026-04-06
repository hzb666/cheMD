"use client";

import React from "react";

import logoMark from "../../../../vision/logo-03.png";

import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { EditorShell } from "../features/editor/components/EditorShell";
import { OcrImportButton } from "../features/ocr/components/OcrImportButton";
import { OcrPasteListener } from "../features/ocr/components/OcrPasteListener";
import { ChemEditorDialog } from "../features/chem-editor/components/ChemEditorDialog";
import type { ChemEditorDraftWithBlockId } from "../features/chem-editor/types";
import { useImageOcr } from "../features/ocr/hooks/useImageOcr";
import { usePlaygroundDocumentController } from "../features/playground/hooks/usePlaygroundDocumentController";
import PreviewShell from "../features/preview/components/PreviewShell";
import { useReactionEditFlow } from "../features/reaction-editor/hooks/useReactionEditFlow";
import { useStructureEditFlow } from "../features/structure-editor/hooks/useStructureEditFlow";

const Page = () => {
  const {
    source,
    result,
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
  const {
    editingStructure,
    closeStructureDialog,
    handleEditMolecule,
    handleSaveStructure
  } = useStructureEditFlow({
    documentId,
    sessionId,
    getLatestSource,
    applySourceChange,
    setEditorStatus
  });
  const {
    editingReaction,
    closeReactionDialog,
    handleEditReaction,
    handleSaveReaction
  } = useReactionEditFlow({
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
  const editingChem: ChemEditorDraftWithBlockId | null = editingReaction
    ? {
        blockId: editingReaction.blockId,
        sourceKind: "reaction",
        kind: "reaction",
        reactants: editingReaction.reactants,
        products: editingReaction.products,
        conditions: editingReaction.conditions
      }
    : editingStructure
      ? {
          blockId: editingStructure.blockId,
          sourceKind: "molecule",
          kind: "molecule",
          smiles: editingStructure.smiles,
          molfile: editingStructure.molfile
        }
      : null;

  return (
    <main
      data-playground-shell="workbench"
      className="playground-page workspace-page min-h-screen overflow-auto xl:h-screen xl:overflow-hidden"
    >
      <div className="playground-shell flex min-h-0 flex-col xl:h-full">
        <section className="playground-topbar shrink-0" aria-label="Playground overview">
          <div className="playground-overview">
            <Card className="playground-overview-card md:col-span-1">
              <CardHeader className="gap-4">
                <div className="playground-brand-row">
                  <div className="playground-brand min-w-0">
                    <img src={logoSrc} alt="chemd logo" className="playground-logo object-contain" />
                    <div className="min-w-0">
                      <p className="playground-meta-label">Chemd Playground</p>
                      <CardTitle className="truncate text-xl">{result.document.meta.title}</CardTitle>
                      <p className="playground-panel-copy text-sm text-muted-foreground">
                        收口为 Editor + Preview 的 v0.1 原型，并保留 OCR、结构编辑与导出能力。
                      </p>
                    </div>
                  </div>
                  <span className="playground-status-pill shrink-0" data-state={compileStateTone}>
                    {compileState}
                  </span>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <div className="playground-meta-grid">
                  <div className="playground-meta-card">
                    <p className="playground-meta-label">Render Profile</p>
                    <p className="playground-meta-value">{result.renderOptions.profileId}</p>
                  </div>
                  <div className="playground-meta-card">
                    <p className="playground-meta-label">Diagnostics</p>
                    <p className="playground-meta-value">
                      {diagnosticCount === 0 ? "Clean compile" : compileState}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="playground-overview-card">
              <CardHeader>
                <p className="playground-meta-label">Source</p>
                <CardTitle className="text-base">{lineCount} lines</CardTitle>
                <p className="playground-panel-copy text-sm text-muted-foreground">
                  YAML metadata、markdown 源文和 OCR 回填都在同一编辑面板完成。
                </p>
              </CardHeader>
            </Card>

            <Card className="playground-overview-card">
              <CardHeader>
                <p className="playground-meta-label">Outputs</p>
                <CardTitle className="text-base">Preview, JSON, DOCX</CardTitle>
                <p className="playground-panel-copy text-sm text-muted-foreground">
                  同一份输入驱动实时预览、JSON 检查和 DOCX 导出。
                </p>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section
          className="workspace-grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden"
          aria-label="Playground workbench"
        >
          <EditorShell
            source={source}
            lineCount={lineCount}
            profileId={result.renderOptions.profileId}
            toolbarActions={(
              <>
                <OcrImportButton
                  loading={ocr.loading}
                  label="OCR"
                  onPickFile={applyOcrFile}
                />
              </>
            )}
            statusMessage={ocr.error ?? editorStatus}
            onSourceChange={applySourceChange}
          />
          <PreviewShell
            html={result.html}
            json={result.json}
            docxBridge={result.docxBridge}
            source={source}
            documentId={documentId}
            sessionId={sessionId}
            renderOptions={result.renderOptions}
            previewIsFresh={previewIsFresh}
            onEditMolecule={(blockId, smiles) => handleEditMolecule(blockId, smiles, previewIsFresh)}
            onEditReaction={(blockId, reactants, products, conditions) =>
              handleEditReaction(blockId, reactants, products, conditions, previewIsFresh)}
          />
        </section>

        <ChemEditorDialog
          open={Boolean(editingChem)}
          value={editingChem}
          onClose={() => {
            closeStructureDialog();
            closeReactionDialog();
          }}
          onSave={async (next) => {
            if (next.kind === "reaction") {
              await handleSaveReaction({
                blockId: next.blockId,
                reactants: next.reactants,
                products: next.products,
                conditions: next.conditions,
                sourceReactionKey: editingReaction?.sourceReactionKey,
                draftReactionKey: editingReaction?.draftReactionKey
              });
              return;
            }

            await handleSaveStructure(
              {
                smiles: next.smiles,
                molfile: next.molfile
              },
              next.blockId
            );
          }}
        />
        <OcrPasteListener enabled={!ocr.loading} onPickFile={applyOcrFile} />
      </div>
    </main>
  );
};

export default Page;

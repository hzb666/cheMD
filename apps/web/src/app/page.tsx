"use client";

import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { compileChemd, type CompileResult } from "@chemd/compiler";

import logoMark from "../../../../vision/logo-03.png";

import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { EditorShell } from "../features/editor/components/EditorShell";
import { createCompileScheduler } from "../features/editor/lib/compile-scheduler";
import { parseDocumentIdFromSource } from "../features/editor/lib/parse-document-id-from-source";
import { OcrImportButton } from "../features/ocr/components/OcrImportButton";
import { OcrPasteListener } from "../features/ocr/components/OcrPasteListener";
import { useImageOcr } from "../features/ocr/hooks/useImageOcr";
import { insertMoleculeBlock } from "../features/ocr/lib/insert-molecule-block";
import { updateMoleculeBlock } from "../features/ocr/lib/update-molecule-block";
import PreviewShell from "../features/preview/components/PreviewShell";
import { reactionKetcherShellAdapter } from "../features/reaction-editor/adapters/reaction-ketcher-shell-adapter";
import { ReactionDialog } from "../features/reaction-editor/components/ReactionDialog";
import { loadReactionDraft } from "../features/reaction-editor/lib/load-reaction-draft";
import {
  createReactionSourceKey,
  saveStoredReactionDraft
} from "../features/reaction-editor/lib/reaction-draft-store";
import { insertReactionBlock } from "../features/reaction-editor/lib/insert-reaction-block";
import {
  buildReactionSaveRequest,
  resolveSavedReactionDraft
} from "../features/reaction-editor/lib/reaction-save";
import { updateReactionBlock } from "../features/reaction-editor/lib/update-reaction-block";
import type { ReactionEditorDraftWithBlockId } from "../features/reaction-editor/types";
import { useReactionOcr } from "../features/reaction-ocr/hooks/useReactionOcr";
import { KetcherDialog } from "../features/structure-editor/components/KetcherDialog";
import { loadStructureDraft } from "../features/structure-editor/lib/load-structure-draft";
import {
  buildStructureSaveRequest,
  resolveSavedStructureDraft
} from "../features/structure-editor/lib/structure-save";
import { getStructureSessionId } from "../features/structure-editor/lib/structure-session";
import { saveStoredStructureDraft } from "../features/structure-editor/lib/structure-draft-store";

const sampleSource = `---
id: exp-2026-03-30-001
title: Ethanol oxidation to acetic acid
date: 2026-03-30
render_profile: publication-acs
primary_result: res-main
---

# Ethanol oxidation to acetic acid

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
:::

:::result #res-main
yield: 63%
:::

:::molecule #mol-main
smiles: CCO
:::

Water marker: :chem[H2O]
Yield: @res-main.yield
`;

const compilePreview = (source: string): CompileResult => compileChemd(source);

const Page = () => {
  const [source, setSource] = useState(sampleSource);
  const [result, setResult] = useState<CompileResult>(() => compilePreview(sampleSource));
  const [lastCompiledSource, setLastCompiledSource] = useState(sampleSource);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [editingStructure, setEditingStructure] = useState<{
    blockId: string;
    smiles: string;
    molfile?: string;
  } | null>(null);
  const [editingReaction, setEditingReaction] = useState<ReactionEditorDraftWithBlockId | null>(null);
  const deferredSource = useDeferredValue(source);
  const schedulerRef = useRef(createCompileScheduler(compilePreview));
  const sourceRef = useRef(sampleSource);
  const documentId = useMemo(() => parseDocumentIdFromSource(source), [source]);
  const sessionId = useMemo(() => getStructureSessionId(), []);
  const applySourceChange = (nextSource: string) => {
    sourceRef.current = nextSource;
    setSource(nextSource);
  };
  const ocr = useImageOcr({
    documentId,
    sessionId,
    getLatestSource: () => sourceRef.current,
    onSourceChange: applySourceChange
  });
  const reactionOcr = useReactionOcr({
    documentId,
    sessionId,
    getLatestSource: () => sourceRef.current,
    onSourceChange: applySourceChange
  });

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const scheduler = schedulerRef.current;

    scheduler.schedule(deferredSource, (nextResult) => {
      startTransition(() => {
        setResult(nextResult);
        setLastCompiledSource(deferredSource);
      });
    });

    return () => {
      scheduler.cancel();
    };
  }, [deferredSource]);

  const diagnosticCount = result.diagnostics.length;
  const previewIsFresh = lastCompiledSource === source;
  const compileState = !previewIsFresh
    ? "Compiling..."
    : diagnosticCount === 0
      ? "Preview synced"
      : `${diagnosticCount} diagnostics`;
  const compileStateTone = !previewIsFresh ? "pending" : diagnosticCount === 0 ? "success" : "warning";
  const logoSrc = typeof logoMark === "string" ? logoMark : logoMark.src;
  const lineCount = source.split(/\r?\n/).length;
  const ocrBusy = ocr.loading || reactionOcr.loading;

  const applyMoleculeOcrFile = (file: File) => {
    if (ocrBusy) {
      return;
    }

    void ocr.runOcr(file).then((next) => {
      if (!next) {
        if (ocr.error) {
          setEditorStatus("OCR failed");
        }
        return;
      }
      setEditorStatus(
        next.action === "create_new"
          ? `OCR created molecule block #${next.blockId}`
          : `OCR updated molecule block #${next.blockId}`
      );
    });
  };

  const applyReactionOcrFile = (file: File) => {
    if (ocrBusy) {
      return;
    }

    void reactionOcr.runOcr(file).then((next) => {
      if (!next) {
        if (reactionOcr.error) {
          setEditorStatus("Reaction OCR failed");
        }
        return;
      }
      setEditorStatus(
        next.action === "create_new"
          ? `OCR created reaction block #${next.blockId}`
          : `OCR updated reaction block #${next.blockId}`
      );
    });
  };

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
                  loading={ocrBusy}
                  label="OCR Molecule"
                  onPickFile={applyMoleculeOcrFile}
                />
                <OcrImportButton
                  loading={ocrBusy}
                  label="OCR Reaction"
                  onPickFile={applyReactionOcrFile}
                />
              </>
            )}
            statusMessage={reactionOcr.error ?? ocr.error ?? editorStatus}
            onSourceChange={applySourceChange}
          />
          <PreviewShell
            html={result.html}
            json={result.json}
            docxBridge={result.docxBridge}
            source={source}
            documentId={documentId}
            sessionId={sessionId}
            previewIsFresh={previewIsFresh}
            onEditMolecule={async (blockId, smiles) => {
              if (!previewIsFresh) {
                setEditorStatus("Preview is updating; wait for compile to finish before editing.");
                return;
              }

              try {
                const draft = await loadStructureDraft({
                  documentId,
                  blockId,
                  sessionId,
                  fallbackSmiles: smiles
                });
                setEditingStructure(draft);
              } catch (error) {
                setEditingStructure({ blockId, smiles });
                setEditorStatus(
                  error instanceof Error
                    ? `${error.message}; fallback to preview structure`
                    : "Structure draft load failed; fallback to preview structure"
                );
              }
            }}
            onEditReaction={async (blockId, reactants, products, conditions) => {
              if (!previewIsFresh) {
                setEditorStatus("Preview is updating; wait for compile to finish before editing.");
                return;
              }

              try {
                const draft = await loadReactionDraft({
                  documentId,
                  blockId,
                  sessionId,
                  fallback: {
                    reactants,
                    products,
                    conditions
                  }
                });
                setEditingReaction(draft);
              } catch (error) {
                setEditingReaction({
                  blockId,
                  reactants,
                  products,
                  conditions
                });
                setEditorStatus(
                  error instanceof Error
                    ? `${error.message}; fallback to preview reaction`
                    : "Reaction draft load failed; fallback to preview reaction"
                );
              }
            }}
          />
        </section>

        <KetcherDialog
          open={Boolean(editingStructure)}
          value={
            editingStructure
              ? { smiles: editingStructure.smiles, molfile: editingStructure.molfile }
              : null
          }
          onClose={() => setEditingStructure(null)}
          onSave={async (next) => {
            if (!editingStructure) {
              return;
            }

            const response = await fetch("/api/chem/structure/save", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                documentId,
                blockId: editingStructure.blockId,
                sessionId,
                ...buildStructureSaveRequest(next)
              })
            });

            const payload = (await response.json().catch(() => null)) as
              | { smiles?: string; molfile?: string; message?: string }
              | null;
            if (!response.ok || !payload?.smiles) {
              throw new Error(payload?.message ?? `Structure save failed (${response.status})`);
            }

            const savedDraft = resolveSavedStructureDraft(next, {
              smiles: payload.smiles,
              molfile: typeof payload.molfile === "string" ? payload.molfile : undefined
            });
            saveStoredStructureDraft({
              documentId,
              blockId: editingStructure.blockId,
              smiles: savedDraft.smiles,
              molfile: savedDraft.molfile,
              sourceSmiles: savedDraft.smiles
            });
            const latestSource = sourceRef.current;
            const blockExists = latestSource.includes(`:::molecule #${editingStructure.blockId}`);
            const nextSource = blockExists
              ? updateMoleculeBlock(latestSource, editingStructure.blockId, savedDraft.smiles)
              : insertMoleculeBlock(latestSource, editingStructure.blockId, savedDraft.smiles);
            applySourceChange(nextSource);
            setEditorStatus(`Structure updated for #${editingStructure.blockId}`);
            setEditingStructure(null);
          }}
        />
        <ReactionDialog
          adapter={reactionKetcherShellAdapter}
          documentId={documentId}
          open={Boolean(editingReaction)}
          value={editingReaction}
          onClose={() => setEditingReaction(null)}
          onSave={async (next) => {
            const response = await fetch("/api/chem/reaction/save", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                documentId,
                blockId: next.blockId,
                sessionId,
                ...buildReactionSaveRequest(next)
              })
            });

            const payload = (await response.json().catch(() => null)) as
              | {
                  blockId?: string;
                  reactants?: string[];
                  products?: string[];
                  conditions?: string[];
                  message?: string;
                }
              | null;
            if (
              !response.ok
              || !payload?.blockId
              || !Array.isArray(payload.reactants)
              || !Array.isArray(payload.products)
              || !Array.isArray(payload.conditions)
            ) {
              throw new Error(payload?.message ?? `Reaction save failed (${response.status})`);
            }

            const savedDraft = resolveSavedReactionDraft(next, {
              reactants: payload.reactants,
              products: payload.products,
              conditions: payload.conditions
            });
            saveStoredReactionDraft({
              documentId,
              blockId: payload.blockId,
              reactants: savedDraft.reactants,
              products: savedDraft.products,
              conditions: savedDraft.conditions,
              sourceReactionKey: createReactionSourceKey(savedDraft)
            });
            const latestSource = sourceRef.current;
            const blockExists = latestSource.includes(`:::reaction #${payload.blockId}`);
            const nextSource = blockExists
              ? updateReactionBlock(latestSource, payload.blockId, {
                  reactants: savedDraft.reactants,
                  products: savedDraft.products,
                  conditions: savedDraft.conditions
                })
              : insertReactionBlock(latestSource, payload.blockId, {
                  reactants: savedDraft.reactants,
                  products: savedDraft.products,
                  conditions: savedDraft.conditions
                });
            applySourceChange(nextSource);
            setEditorStatus(`Reaction updated for #${payload.blockId}`);
            setEditingReaction(null);
          }}
        />
        <OcrPasteListener enabled={!ocrBusy} onPickFile={applyMoleculeOcrFile} />
      </div>
    </main>
  );
};

export default Page;

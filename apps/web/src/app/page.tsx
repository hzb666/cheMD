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

import { DocumentTreePanel } from "../features/document-tree/components/DocumentTreePanel";
import { EditorShell } from "../features/editor/components/EditorShell";
import { createCompileScheduler } from "../features/editor/lib/compile-scheduler";
import { OcrImportButton } from "../features/ocr/components/OcrImportButton";
import { OcrPasteListener } from "../features/ocr/components/OcrPasteListener";
import { useImageOcr } from "../features/ocr/hooks/useImageOcr";
import { insertMoleculeBlock } from "../features/ocr/lib/insert-molecule-block";
import { updateMoleculeBlock } from "../features/ocr/lib/update-molecule-block";
import PreviewShell from "../features/preview/components/PreviewShell";
import { KetcherDialog } from "../features/structure-editor/components/KetcherDialog";

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
temperature: 200 °C
time: 4 h
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
const documentIdFromSource = (source: string): string => {
  const match = source.match(/^id:\s*(.+)$/m);
  return match?.[1]?.trim() || "workspace-doc";
};

const Page = () => {
  const [source, setSource] = useState(sampleSource);
  const [result, setResult] = useState<CompileResult>(() => compilePreview(sampleSource));
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [editingStructure, setEditingStructure] = useState<{
    blockId: string;
    smiles: string;
    molfile?: string;
  } | null>(null);
  const deferredSource = useDeferredValue(source);
  const schedulerRef = useRef(createCompileScheduler(compilePreview));
  const documentId = useMemo(() => documentIdFromSource(source), [source]);
  const ocr = useImageOcr({
    source,
    documentId,
    onSourceChange: setSource
  });

  useEffect(() => {
    const scheduler = schedulerRef.current;

    scheduler.schedule(deferredSource, (nextResult) => {
      startTransition(() => {
        setResult(nextResult);
      });
    });

    return () => {
      scheduler.cancel();
    };
  }, [deferredSource]);

  const diagnosticCount = result.diagnostics.length;
  const compileState = diagnosticCount === 0 ? "Preview synced" : `${diagnosticCount} diagnostics`;
  const logoSrc = typeof logoMark === "string" ? logoMark : logoMark.src;
  const applyOcrFile = (file: File) => {
    void ocr.runOcr(file).then((next) => {
      if (!next) {
        setEditorStatus("OCR failed");
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
    <main className="workspace-page min-h-screen overflow-auto xl:h-screen xl:overflow-hidden">
      <div className="playground-shell flex min-h-0 flex-col xl:h-full">
        <header className="workspace-header shrink-0">
          <div className="workspace-toolbar">
            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
              <img src={logoSrc} alt="chemd logo" className="workspace-logo shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="workspace-eyebrow">Chemd</p>
                <p className="workspace-title truncate">{result.document.meta.title}</p>
              </div>
            </div>
            <span
              className="status-pill shrink-0"
              data-state={diagnosticCount === 0 ? "success" : "warning"}
            >
              {compileState}
            </span>
          </div>
        </header>

        <section className="workspace-grid min-h-0 flex-1 xl:grid-cols-[18rem_minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden">
          <DocumentTreePanel source={source} />
          <EditorShell
            source={source}
            lineCount={source.split(/\r?\n/).length}
            profileId={result.renderOptions.profileId}
            toolbarActions={<OcrImportButton loading={ocr.loading} onPickFile={applyOcrFile} />}
            statusMessage={ocr.error ?? editorStatus}
            onSourceChange={setSource}
          />
          <PreviewShell
            html={result.html}
            json={result.json}
            docxBridge={result.docxBridge}
            source={source}
            onEditMolecule={(blockId, smiles) => {
              setEditingStructure({ blockId, smiles });
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
                smiles: next.smiles,
                molfile: next.molfile
              })
            });

            const payload = (await response.json().catch(() => null)) as
              | { smiles?: string; message?: string }
              | null;
            if (!response.ok || !payload?.smiles) {
              throw new Error(payload?.message ?? `Structure save failed (${response.status})`);
            }

            const blockExists = source.includes(`:::molecule #${editingStructure.blockId}`);
            const nextSource = blockExists
              ? updateMoleculeBlock(source, editingStructure.blockId, payload.smiles)
              : insertMoleculeBlock(source, editingStructure.blockId, payload.smiles);
            setSource(nextSource);
            setEditorStatus(`Structure updated for #${editingStructure.blockId}`);
            setEditingStructure(null);
          }}
        />
        <OcrPasteListener onPickFile={applyOcrFile} />
      </div>
    </main>
  );
};

export default Page;

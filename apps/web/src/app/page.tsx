"use client";

import React, {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
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
import { ensureBlockId } from "../features/ocr/lib/ensure-block-id";
import { insertMoleculeBlock } from "../features/ocr/lib/insert-molecule-block";
import { selectTargetMolecule } from "../features/ocr/lib/select-target-molecule";
import { updateMoleculeBlock } from "../features/ocr/lib/update-molecule-block";
import { KetcherDialog } from "../features/structure-editor/components/KetcherDialog";
import PreviewShell from "../features/preview/components/PreviewShell";

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

:::molecule #mol-001
smiles: CCO
:::

Water marker: :chem[H2O]
Yield: @res-main.yield
`;

const DOCUMENT_ID = "exp-2026-03-30-001";

const compilePreview = (source: string): CompileResult => compileChemd(source);

const Page = () => {
  const [source, setSource] = useState(sampleSource);
  const [result, setResult] = useState<CompileResult>(() => compilePreview(sampleSource));
  const deferredSource = useDeferredValue(source);
  const schedulerRef = useRef(createCompileScheduler(compilePreview));

  // Ketcher dialog state
  const [ketcherOpen, setKetcherOpen] = useState(false);
  const [ketcherBlockId, setKetcherBlockId] = useState("");
  const [ketcherMolfile, setKetcherMolfile] = useState<string | undefined>();
  const [ketcherSmiles, setKetcherSmiles] = useState<string | undefined>();

  // OCR state
  const { state: ocrState, runOcr } = useImageOcr({ documentId: DOCUMENT_ID });
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    scheduler.schedule(deferredSource, (nextResult) => {
      startTransition(() => {
        setResult(nextResult);
      });
    });
    return () => { scheduler.cancel(); };
  }, [deferredSource]);

  const handleOcrFile = useCallback(
    async (file: File) => {
      setOcrMessage(null);
      const ocrResult = await runOcr(file);
      if (!ocrResult) {
        return;
      }

      const smiles = ocrResult.structure.smiles;
      if (!smiles) {
        return;
      }

      setSource((prev) => {
        const target = selectTargetMolecule(prev);

        if (!target) {
          // No molecule block – create one
          const blockId = ocrResult.blockId || `mol-${Date.now()}`;
          setOcrMessage(`✓ Created new molecule block #${blockId}`);
          return insertMoleculeBlock(prev, smiles, blockId);
        }

        // Ensure the target block has a stable id
        const { source: withId, blockId } = ensureBlockId(prev, target.lineStart);
        setOcrMessage(`✓ Updated molecule block #${blockId}`);
        return updateMoleculeBlock(withId, { ...target, blockId }, smiles);
      });
    },
    [runOcr]
  );

  const handleOpenKetcher = useCallback(
    async (blockId: string, smiles?: string) => {
      // Try to load cached molfile from the server
      let molfile: string | undefined;
      try {
        const res = await fetch(
          `/api/chem/structure?documentId=${encodeURIComponent(DOCUMENT_ID)}&blockId=${encodeURIComponent(blockId)}`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            found: boolean;
            structure?: { smiles: string; molfile?: string };
          };
          if (data.found && data.structure?.molfile) {
            molfile = data.structure.molfile;
          }
        }
      } catch {
        // ignore; fall back to smiles
      }

      setKetcherBlockId(blockId);
      setKetcherMolfile(molfile);
      setKetcherSmiles(smiles);
      setKetcherOpen(true);
    },
    []
  );

  const handleKetcherSave = useCallback(
    (newSmiles: string) => {
      if (!newSmiles || !ketcherBlockId) {
        return;
      }

      setSource((prev) => {
        const target = selectTargetMolecule(prev);
        if (!target || target.blockId !== ketcherBlockId) {
          return prev;
        }
        return updateMoleculeBlock(prev, target, newSmiles);
      });
      setOcrMessage(`✓ Structure saved for #${ketcherBlockId}`);
    },
    [ketcherBlockId]
  );

  const diagnosticCount = result.diagnostics.length;
  const compileState = diagnosticCount === 0 ? "Preview synced" : `${diagnosticCount} diagnostics`;
  const logoSrc = typeof logoMark === "string" ? logoMark : logoMark.src;

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

        <section className="workspace-grid min-h-0 flex-1 xl:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden">
          {/* Left: Document tree */}
          <DocumentTreePanel
            onSelect={(id) => {
              // When user selects a molecule block, offer to open Ketcher
              if (id.startsWith("mol-")) {
                void handleOpenKetcher(id);
              }
            }}
          />

          {/* Middle: Editor */}
          <div className="workspace-panel workspace-panel-editor panel-stack min-h-0">
            {/* OCR status bar */}
            {(ocrState.phase !== "idle" || ocrMessage) && (
              <div
                className="ocr-status-bar shrink-0"
                data-phase={ocrState.phase === "error" ? "error" : ocrState.phase === "success" || ocrMessage ? "success" : "loading"}
              >
                {ocrState.phase === "loading" && "🔍 Recognising structure…"}
                {ocrState.phase === "error" && `⚠ ${ocrState.message}`}
                {ocrState.phase === "success" && ocrMessage}
                {ocrState.phase === "idle" && ocrMessage}
              </div>
            )}
            <EditorShell
              source={source}
              lineCount={source.split(/\r?\n/).length}
              profileId={result.renderOptions.profileId}
              onSourceChange={setSource}
              toolbar={
                <OcrImportButton
                  onFile={handleOcrFile}
                  loading={ocrState.phase === "loading"}
                />
              }
            />
            <OcrPasteListener onFile={handleOcrFile} enabled={ocrState.phase !== "loading"} />
          </div>

          {/* Right: Preview */}
          <PreviewShell
            html={result.html}
            json={result.json}
            docxBridge={result.docxBridge}
            source={source}
            documentId={DOCUMENT_ID}
            onEditStructure={handleOpenKetcher}
          />
        </section>
      </div>

      {/* Ketcher modal */}
      <KetcherDialog
        open={ketcherOpen}
        documentId={DOCUMENT_ID}
        blockId={ketcherBlockId}
        initialMolfile={ketcherMolfile}
        initialSmiles={ketcherSmiles}
        onSave={handleKetcherSave}
        onClose={() => setKetcherOpen(false)}
      />
    </main>
  );
};

export default Page;

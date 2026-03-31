import React, { useState } from "react";

import { useRenderedPreview } from "../../chem-preview/hooks/useRenderedPreview";

interface PreviewShellProps {
  html: string;
  json: string;
  docxBridge: string;
  source: string;
  documentId?: string;
  onEditStructure?: (blockId: string, smiles?: string) => void;
}

type OutputTab = "preview" | "inspect" | "json" | "docxBridge";

// ─── Molecule block parser ────────────────────────────────────────────────────

interface MoleculeBlockInfo {
  blockId: string;
  smiles?: string;
}

const parseMoleculeBlocks = (source: string): MoleculeBlockInfo[] => {
  const lines = source.split(/\r?\n/);
  const blocks: MoleculeBlockInfo[] = [];
  let inBlock = false;
  let currentId = "";
  let currentSmiles: string | undefined;

  for (const line of lines) {
    if (!inBlock) {
      const openMatch = /^:::molecule(?:\s+#(\S+))?/.exec(line);
      if (openMatch) {
        inBlock = true;
        currentId = openMatch[1] ?? `mol-${blocks.length + 1}`;
        currentSmiles = undefined;
      }
    } else {
      const smilesMatch = /^\s*smiles\s*:\s*(.+)/.exec(line);
      if (smilesMatch) {
        currentSmiles = smilesMatch[1]?.trim();
      }
      if (/^:::$/.test(line)) {
        blocks.push({ blockId: currentId, smiles: currentSmiles });
        inBlock = false;
      }
    }
  }

  return blocks;
};

// ─── Structure card ───────────────────────────────────────────────────────────

const StructureCard = ({
  blockId,
  smiles,
  onEdit,
}: {
  blockId: string;
  smiles?: string;
  onEdit?: () => void;
}) => {
  const previewState = useRenderedPreview(smiles);

  return (
    <div className="structure-card">
      <div className="structure-card-toolbar">
        <span style={{ fontSize: "0.72rem", color: "var(--muted)", marginRight: "auto" }}>
          #{blockId}
        </span>
        {onEdit && (
          <button
            type="button"
            className="structure-edit-btn"
            onClick={onEdit}
            title="Open Ketcher to edit this structure"
          >
            ✏ Edit structure
          </button>
        )}
      </div>
      <div className="structure-card-body">
        {!smiles && (
          <p className="structure-card-placeholder">No SMILES – add a smiles: field to the block</p>
        )}
        {smiles && previewState.phase === "loading" && (
          <p className="structure-card-placeholder">Rendering…</p>
        )}
        {smiles && previewState.phase === "error" && (
          <p className="structure-card-placeholder" style={{ color: "var(--warning)" }}>
            Render failed: {previewState.errorMessage}
          </p>
        )}
        {smiles && previewState.phase === "success" && previewState.svg && (
          // eslint-disable-next-line react/no-danger
          <div dangerouslySetInnerHTML={{ __html: previewState.svg }} />
        )}
        {smiles && previewState.phase === "idle" && (
          <p className="structure-card-placeholder">{smiles}</p>
        )}
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PREVIEW_FRAME_STYLE = `
  :root {
    color-scheme: light;
    font-family: "Inter", "Segoe UI Variable Text", Aptos, "PingFang SC", sans-serif;
  }
  * { box-sizing: border-box; }
  html, body {
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: rgba(15, 23, 42, 0.14) transparent;
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }
  html::-webkit-scrollbar-track,
  body::-webkit-scrollbar-track {
    background: transparent;
  }
  html::-webkit-scrollbar-thumb,
  body::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.12);
  }
  html::-webkit-scrollbar-thumb:hover,
  body::-webkit-scrollbar-thumb:hover {
    background: rgba(15, 23, 42, 0.2);
  }
  body {
    margin: 0;
    padding: 0;
    color: #1f2937;
    background: #ffffff;
    line-height: 1.68;
  }
  .chemd-document { padding: 1.2rem 1.3rem; }
  .chemd-markdown { margin: 0 0 0.9rem; }
  .chemd-block {
    margin: 0 0 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }
  .chemd-graphic {
    margin: 0.6rem 0 0.25rem;
    padding: 0.75rem;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 10px;
    background: #f8fafc;
    overflow: hidden;
  }
  .chemd-graphic svg { width: 100%; height: auto; }
  .chem-inline {
    display: inline-block;
    padding: 0.05rem 0.38rem;
    border-radius: 6px;
    background: rgba(59, 130, 246, 0.12);
    color: #245dd8;
    font-weight: 600;
  }
`;

const toSandboxedSrcDoc = (html: string): string =>
  `<!doctype html><html><head><meta charset="utf-8" /><style>${PREVIEW_FRAME_STYLE}</style></head><body>${html}</body></html>`;

const parseFileNameFromContentDisposition = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (!match || !match[1]) {
    return undefined;
  }

  const raw = match[1].trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

// ─── Main component ───────────────────────────────────────────────────────────

const PreviewShell = ({
  html,
  json,
  docxBridge,
  source,
  documentId = "default",
  onEditStructure,
}: PreviewShellProps) => {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const moleculeBlocks = parseMoleculeBlocks(source);

  const handleExportDocx = async () => {
    setExportingDocx(true);
    setExportMessage(null);

    try {
      const response = await fetch("/api/export/docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ source })
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorPayload.message ?? `DOCX export failed (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const serverFileName = parseFileNameFromContentDisposition(
        response.headers.get("Content-Disposition")
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      if (serverFileName) {
        anchor.download = serverFileName;
      }
      globalThis.document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60000);
      setExportMessage("DOCX export downloaded.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "DOCX export failed");
    } finally {
      setExportingDocx(false);
    }
  };

  const activeCode = activeTab === "json" ? json : docxBridge;

  return (
    <section className="workspace-panel workspace-panel-output panel-stack min-h-0">
      <div className="panel-header panel-toolbar shrink-0 items-center">
        <div className="panel-heading-cluster">
          <p className="panel-kicker">Preview</p>
          <div className="tab-strip" role="tablist" aria-label="Output views">
            <button
              type="button"
              className="tab-button"
              data-active={activeTab === "preview"}
              onClick={() => setActiveTab("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              className="tab-button"
              data-active={activeTab === "inspect"}
              onClick={() => setActiveTab("inspect")}
            >
              Structures
            </button>
            <button
              type="button"
              className="tab-button"
              data-active={activeTab === "json"}
              onClick={() => setActiveTab("json")}
            >
              JSON
            </button>
            <button
              type="button"
              className="tab-button"
              data-active={activeTab === "docxBridge"}
              onClick={() => setActiveTab("docxBridge")}
            >
              DOCX
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportDocx}
          disabled={exportingDocx}
          className="button-primary"
        >
          {exportingDocx ? "Exporting..." : "Export"}
        </button>
      </div>

      {exportMessage ? <p className="status-text shrink-0">{exportMessage}</p> : null}

      <div className="detail-card min-h-0 flex-1">
        {activeTab === "preview" && (
          <div className="detail-card-body preview-canvas h-full">
            <iframe
              title="chemd-preview"
              sandbox="allow-popups"
              referrerPolicy="no-referrer"
              className="preview-frame"
              srcDoc={toSandboxedSrcDoc(html)}
            />
          </div>
        )}

        {activeTab === "inspect" && (
          <div className="detail-card-body h-full scroll-area" style={{ padding: "1rem" }}>
            {moleculeBlocks.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.84rem" }}>
                No molecule blocks in the current document.
              </p>
            ) : (
              moleculeBlocks.map((block) => (
                <StructureCard
                  key={block.blockId}
                  blockId={block.blockId}
                  smiles={block.smiles}
                  onEdit={
                    onEditStructure
                      ? () => onEditStructure(block.blockId, block.smiles)
                      : undefined
                  }
                />
              ))
            )}
          </div>
        )}

        {(activeTab === "json" || activeTab === "docxBridge") && (
          <div className="detail-card-body h-full">
            <div className="code-surface h-full">
              <pre className="code-block scroll-area">
                <code>{activeCode}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default PreviewShell;

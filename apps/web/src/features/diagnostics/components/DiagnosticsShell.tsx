import React, { useState } from "react";
import type { Diagnostic } from "@chemd/core";
import type { RenderOptions } from "@chemd/render-profile";

interface DiagnosticsShellProps {
  diagnostics: Diagnostic[];
  json: string;
  docxBridge: string;
  source: string;
  renderOptions: RenderOptions;
}

type InspectTab = "json" | "docxBridge";

const formatBoolean = (value: boolean) => (value ? "true" : "false");

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

export const DiagnosticsShell = ({
  diagnostics,
  json,
  docxBridge,
  source,
  renderOptions
}: DiagnosticsShellProps) => {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InspectTab>("json");

  const handleExportDocx = async () => {
    setExportingDocx(true);
    setExportMessage(null);

    try {
      const response = await fetch("/api/export/docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source,
          profileId: renderOptions.profileId
        })
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
      document.body.append(anchor);
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

  const activePayload = activeTab === "json" ? json : docxBridge;

  return (
    <section className="workspace-panel panel-stack px-0 py-4 md:py-5 xl:pl-5">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Diagnostics</p>
          <h2 className="panel-title">Inspect</h2>
          <p className="panel-copy">
            Keep compile health, render settings, export actions, and payload inspection in one
            narrower side rail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="status-pill"
            data-state={diagnostics.length === 0 ? "success" : "warning"}
          >
            {diagnostics.length === 0 ? "No diagnostics" : `${diagnostics.length} diagnostics`}
          </span>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-header">
          <div>
            <p className="panel-section-title">DOCX Export</p>
            <p className="panel-section-copy">
              Export the current source and selected render profile through the server bridge.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportDocx}
            disabled={exportingDocx}
            className="button-primary"
          >
            {exportingDocx ? "Exporting..." : "Export DOCX"}
          </button>
        </div>
        {exportMessage ? (
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{exportMessage}</p>
        ) : null}
      </div>

      <div className="panel-section">
        <p className="panel-section-title">Diagnostics</p>
        {diagnostics.length === 0 ? (
          <p className="panel-section-copy">
            当前没有诊断信息，说明这份示例文档已通过当前阶段的 parser/resolver 校验。
          </p>
        ) : (
          <ul className="mt-4">
            {diagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}-${diagnostic.message}`} className="flat-item">
                <p className="text-sm font-semibold text-[var(--ink)]">{diagnostic.code}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{diagnostic.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel-section">
        <p className="panel-section-title">Render Options</p>
        <div className="mt-4">
          <div className="summary-item">
            <div>
              <strong>Profile</strong>
              <span>{renderOptions.profileId}</span>
            </div>
            <span>{renderOptions.export.imageFormat.toUpperCase()}</span>
          </div>
          <div className="summary-item">
            <div>
              <strong>Structure</strong>
              <span>
                Bond {renderOptions.structure.bondLength} · Line {renderOptions.structure.bondLineWidth}
              </span>
            </div>
            <span>{formatBoolean(renderOptions.structure.monochrome)}</span>
          </div>
          <div className="summary-item">
            <div>
              <strong>Export</strong>
              <span>Arrow {renderOptions.reaction.arrowLength}</span>
            </div>
            <span>{renderOptions.export.dpi} DPI</span>
          </div>
        </div>
      </div>

      <div className="panel-section flex-1">
        <div className="panel-header">
          <div>
            <p className="panel-section-title">Inspect Payload</p>
            <p className="panel-section-copy">
              Toggle between the normalized compiler output and the DOCX bridge payload.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="tab-button"
              data-active={activeTab === "json"}
              onClick={() => setActiveTab("json")}
            >
              Normalized JSON
            </button>
            <button
              type="button"
              className="tab-button"
              data-active={activeTab === "docxBridge"}
              onClick={() => setActiveTab("docxBridge")}
            >
              DOCX Bridge Payload
            </button>
          </div>
        </div>

        <div className="flat-code-wrap flex-1">
          <div className="code-surface">
            <pre className="code-block">
              <code>{activePayload}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
};

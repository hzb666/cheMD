import type { ChemdLanguageCompileOutput } from "@chemd/language-service";
import { toSandboxedPreviewDocument } from "@chemd/renderer-html";
import { useMemo } from "react";
import { useRenderedPreview } from "../../hooks/use-rendered-preview";

interface HtmlPreviewProps {
  output: ChemdLanguageCompileOutput;
}

const PREVIEW_BACKGROUND_FALLBACK = "#f8fafc";

const readCssColorToken = (name: string, fallback: string): string => {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

export const HtmlPreview = ({ output }: HtmlPreviewProps) => {
  const baseHtml = output.status === "ok" ? output.result.html : "";
  const hydratedHtml = useRenderedPreview(
    baseHtml,
    output.status === "ok" ? output.result.renderOptions : undefined
  );
  const previewBackground = useMemo(
    () => readCssColorToken("--reference-surface-bg", PREVIEW_BACKGROUND_FALLBACK),
    []
  );

  if (output.status === "failed") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-4 text-destructive" role="alert">
        <strong className="text-sm text-foreground">Compile failed</strong>
        <p className="m-0 text-[13px] leading-6">{output.error.message}</p>
      </div>
    );
  }

  if (!hydratedHtml.trim()) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-4 text-muted-foreground">
        <strong className="text-sm text-foreground">No HTML output</strong>
        <p className="m-0 text-[13px] leading-6">The current Chemd document compiled without a previewable HTML body.</p>
      </div>
    );
  }

  return (
    <iframe
      key={`${output.documentUri ?? "document"}:${output.compiledAt}:${hydratedHtml.length}`}
      title="Chemd HTML preview"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="reference-html-preview-frame block h-full w-full border-0 bg-[var(--reference-surface-bg)]"
      srcDoc={toSandboxedPreviewDocument(hydratedHtml, "light", {
        backgroundColor: previewBackground
      })}
    />
  );
};

"use client";

import React from "react";
import type { RenderOptions } from "@chemd/render-profile";
import type { DiagnosticQuickFix, DiagnosticWithQuickFixes } from "@chemd/compiler";
import type { ChemEditorDraftWithBlockId } from "../../chem-editor/types";

import { CopyIconButton } from "../../../components/copy-icon-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { DiagnosticQuickFixPanel } from "../../diagnostics/components/DiagnosticQuickFixPanel";
import { DocumentPreview } from "./DocumentPreview";
import {
  type OutputTab,
  type PreviewCompilerOutputCode,
  usePreviewShellController
} from "../hooks/usePreviewShellController";

interface PreviewShellProps {
  html: string;
  json: string;
  docxBridge: string;
  compilerOutputCode?: PreviewCompilerOutputCode;
  source: string;
  documentId?: string;
  sessionId?: string;
  renderOptions?: RenderOptions;
  previewIsFresh?: boolean;
  onEditChemd?: (draft: ChemEditorDraftWithBlockId) => void | Promise<void>;
  diagnostics?: DiagnosticWithQuickFixes[];
  onApplyQuickFix?: (
    diagnostic: DiagnosticWithQuickFixes,
    quickFix: DiagnosticQuickFix
  ) => void;
}

interface PreviewTabConfig {
  value: OutputTab;
  label: string;
  description: string;
}

interface CodeOutputPanelProps {
  value: string;
  surface: string;
}

interface PreviewTabsHeaderProps {
  activeTab: OutputTab;
  activeCode: string;
}

interface PreviewTabPanelsProps {
  hydratedHtml: string;
  previewFrameRef: React.RefObject<HTMLIFrameElement | null>;
  json: string;
  docxBridge: string;
  compilerOutputCode: PreviewCompilerOutputCode;
  diagnostics: DiagnosticWithQuickFixes[];
  previewIsFresh: boolean;
  onApplyQuickFix?: (
    diagnostic: DiagnosticWithQuickFixes,
    quickFix: DiagnosticQuickFix
  ) => void;
}

interface CodeTabContentConfig {
  value: OutputTab;
  surface: string;
  code: string;
}

const PREVIEW_TABS: PreviewTabConfig[] = [
  {
    value: "preview",
    label: "Preview",
    description: "Rendered document preview"
  },
  {
    value: "json",
    label: "JSON",
    description: "Normalized JSON export"
  },
  {
    value: "docxBridge",
    label: "DOCX",
    description: "DOCX bridge payload"
  },
  {
    value: "diagnostics",
    label: "Diagnostics",
    description: "Diagnostics and quick fixes"
  },
  {
    value: "semantic",
    label: "Semantic",
    description: "Typed and step graphs"
  },
  {
    value: "runtime",
    label: "Runtime",
    description: "Run plan and preflight"
  },
  {
    value: "lnf",
    label: "LNF",
    description: "Canonical LNF export"
  },
  {
    value: "training",
    label: "Training",
    description: "Training export record"
  }
];

const CODE_OUTPUT_TABS = new Set<OutputTab>([
  "json",
  "docxBridge",
  "semantic",
  "runtime",
  "lnf",
  "training"
]);

const EMPTY_COMPILER_OUTPUT_CODE: PreviewCompilerOutputCode = {
  semantic: "{}",
  runtime: "{}",
  lnf: "{}",
  training: "{}"
};

const findTabConfig = (value: OutputTab): PreviewTabConfig =>
  PREVIEW_TABS.find((tab) => tab.value === value) ?? PREVIEW_TABS[0];

const CodeOutputPanel = ({ value, surface }: CodeOutputPanelProps) => (
  <div className="absolute inset-0 p-6 overflow-auto bg-background" data-preview-code-surface={surface}>
    <pre className="font-mono text-[0.85rem] leading-relaxed text-foreground opacity-90">
      <code>{value}</code>
    </pre>
  </div>
);

const PreviewTabTrigger = ({ value, label, description }: PreviewTabConfig) => {
  const tooltipId = `preview-tab-tooltip-${value}`;

  return (
    <TabsTrigger
      value={value}
      title={description}
      aria-describedby={tooltipId}
      className="group relative playground-tab-trigger notion-font-ui h-8 px-3 py-0 text-[13px] data-[state=active]:font-semibold"
    >
      {label}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+0.5rem)] z-50 hidden w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-left text-[12px] font-normal leading-4 text-popover-foreground shadow-md group-hover:block group-focus-visible:block"
      >
        {description}
      </span>
    </TabsTrigger>
  );
};

const PreviewTabsHeader = ({ activeTab, activeCode }: PreviewTabsHeaderProps) => (
  <div className="flex flex-row items-center justify-between gap-3 shrink-0 min-h-11 px-4 py-1 border-b border-border bg-background">
    <div className="flex min-w-0 items-center gap-3">
      <TabsList className="playground-tab-list notion-font-ui flex h-auto flex-wrap justify-start gap-1">
        {PREVIEW_TABS.map((tab) => (
          <PreviewTabTrigger key={tab.value} {...tab} />
        ))}
      </TabsList>
    </div>
    <div className="flex items-center gap-2">
      {CODE_OUTPUT_TABS.has(activeTab) ? (
        <CopyIconButton
          copyText={activeCode}
          label={`Copy ${findTabConfig(activeTab).label} output`}
          className="playground-topbar-button notion-font-ui h-8 w-8 p-0"
        />
      ) : null}
    </div>
  </div>
);

const buildCodeTabContents = (
  json: string,
  docxBridge: string,
  compilerOutputCode: PreviewCompilerOutputCode
): CodeTabContentConfig[] => [
  { value: "json", surface: "json", code: json },
  { value: "docxBridge", surface: "docxBridge", code: docxBridge },
  { value: "semantic", surface: "semantic", code: compilerOutputCode.semantic },
  { value: "runtime", surface: "runtime", code: compilerOutputCode.runtime },
  { value: "lnf", surface: "lnf", code: compilerOutputCode.lnf },
  { value: "training", surface: "training", code: compilerOutputCode.training }
];

const CodeTabContents = ({
  json,
  docxBridge,
  compilerOutputCode
}: Pick<PreviewTabPanelsProps, "json" | "docxBridge" | "compilerOutputCode">) => (
  <>
    {buildCodeTabContents(json, docxBridge, compilerOutputCode).map((tab) => (
      <TabsContent key={tab.value} value={tab.value} className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full">
        <CodeOutputPanel value={tab.code} surface={tab.surface} />
      </TabsContent>
    ))}
  </>
);

const PreviewTabPanels = ({
  hydratedHtml,
  previewFrameRef,
  json,
  docxBridge,
  compilerOutputCode,
  diagnostics,
  previewIsFresh,
  onApplyQuickFix
}: PreviewTabPanelsProps) => (
  <div className="flex min-h-0 flex-1 flex-col w-full relative">
    <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full overflow-auto">
      <div className="relative w-full min-h-full bg-background">
        <DocumentPreview html={hydratedHtml} frameRef={previewFrameRef} />
      </div>
    </TabsContent>

    <CodeTabContents
      json={json}
      docxBridge={docxBridge}
      compilerOutputCode={compilerOutputCode}
    />

    <TabsContent value="diagnostics" className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none absolute inset-0 w-full h-full">
      <DiagnosticQuickFixPanel
        diagnostics={diagnostics}
        quickFixesEnabled={previewIsFresh}
        onApplyQuickFix={onApplyQuickFix}
      />
    </TabsContent>
  </div>
);

const PreviewShell = ({
  html,
  json,
  docxBridge,
  compilerOutputCode = EMPTY_COMPILER_OUTPUT_CODE,
  source,
  documentId,
  sessionId,
  renderOptions,
  previewIsFresh = true,
  onEditChemd,
  diagnostics = [],
  onApplyQuickFix
}: PreviewShellProps) => {
  const {
    activeTab,
    setActiveTab,
    previewFrameRef,
    hydratedHtml,
    activeCode
  } = usePreviewShellController({
    html,
    json,
    docxBridge,
    compilerOutputCode,
    source,
    documentId,
    sessionId,
    renderOptions,
    previewIsFresh,
    onEditChemd
  });

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as OutputTab)}
      className="flex flex-col h-full min-h-[500px] w-full"
    >
      <div
        data-playground-panel="preview"
        className="flex flex-col h-full bg-background relative z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-border"
      >
        <PreviewTabsHeader activeTab={activeTab} activeCode={activeCode} />

        <div className="flex-1 min-h-0 p-0 flex flex-col relative bg-background">
          <PreviewTabPanels
            hydratedHtml={hydratedHtml}
            previewFrameRef={previewFrameRef}
            json={json}
            docxBridge={docxBridge}
            compilerOutputCode={compilerOutputCode}
            diagnostics={diagnostics}
            previewIsFresh={previewIsFresh}
            onApplyQuickFix={onApplyQuickFix}
          />
        </div>
      </div>
    </Tabs>
  );
};

export default PreviewShell;

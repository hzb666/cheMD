"use client";

import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState
} from "react";
import { compileChemd, type CompileResult } from "@chemd/compiler";

import logoMark from "../../../../vision/logo-03.png";

import { EditorShell } from "../features/editor/components/EditorShell";
import { createCompileScheduler } from "../features/editor/lib/compile-scheduler";
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

Water marker: :chem[H2O]
Yield: @res-main.yield
`;

const compilePreview = (source: string): CompileResult => compileChemd(source);

const Page = () => {
  const [source, setSource] = useState(sampleSource);
  const [result, setResult] = useState<CompileResult>(() => compilePreview(sampleSource));
  const deferredSource = useDeferredValue(source);
  const schedulerRef = useRef(createCompileScheduler(compilePreview));

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

  return (
    <main className="workspace-page min-h-screen overflow-auto xl:h-screen xl:overflow-hidden">
      <div className="playground-shell flex min-h-0 flex-col xl:h-full">
        <header className="workspace-header shrink-0">
          <div className="workspace-toolbar">
            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
              <img src={logoSrc} alt="chemd logo" className="workspace-logo shrink-0 object-contain" />
              <p className="workspace-title truncate">{result.document.meta.title}</p>
            </div>
            <span
              className="status-pill shrink-0"
              data-state={diagnosticCount === 0 ? "success" : "warning"}
            >
              {compileState}
            </span>
          </div>
        </header>

        <section className="workspace-grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden">
          <EditorShell
            source={source}
            lineCount={source.split(/\r?\n/).length}
            profileId={result.renderOptions.profileId}
            onSourceChange={setSource}
          />
          <PreviewShell
            html={result.html}
            json={result.json}
            docxBridge={result.docxBridge}
            source={source}
          />
        </section>
      </div>
    </main>
  );
};

export default Page;


import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChemdLanguageCompileOutput } from "@chemd/language-service";

import type { InsightPaneProps } from "../../types";
import { ReferenceBottomPanel, ReferenceBottomPanelResizeHandle } from "./bottom-panel";

const failedCompileOutput: ChemdLanguageCompileOutput = {
  status: "failed",
  documentUri: "experiments/bad.chemd",
  compiledAt: "2026-05-16T12:00:00.000Z",
  diagnostics: [{
    code: "E_TEST",
    severity: "error",
    message: "Missing required field",
    range: {
      startLine: 4,
      startColumn: 3,
      endLine: 4,
      endColumn: 10
    },
    quickFixes: []
  }]
} as unknown as ChemdLanguageCompileOutput;

describe("ReferenceBottomPanel", () => {
  it("renders diagnostics and exposes the active panel button to assistive tech", () => {
    const html = renderToStaticMarkup(
      <ReferenceBottomPanel
        panel="diagnostics"
        props={{} as InsightPaneProps}
        compileOutput={failedCompileOutput}
        compileError="Compiler crashed before rendering."
        onSelectPanel={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("Terminal and diagnostics");
    expect(html).toContain("Compile failed");
    expect(html).toContain("1 errors / 0 warnings / 0 info");
    expect(html).toContain("Missing required field");
    expect(html).toContain("L4:C3");
    expect(html).toContain('data-control="close"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders a terminal placeholder without requiring runtime panel data", () => {
    const html = renderToStaticMarkup(
      <ReferenceBottomPanel
        panel="terminal"
        props={{} as InsightPaneProps}
        compileOutput={{ ...failedCompileOutput, diagnostics: [] }}
        onSelectPanel={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('role="log"');
    expect(html).toContain("Terminal output is not attached yet.");
    expect(html).toContain("Runtime logs are available from the Runtime tab.");
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders a top resize separator for bottom panel resizing", () => {
    const html = renderToStaticMarkup(
      <ReferenceBottomPanelResizeHandle onPointerDown={vi.fn()} />
    );

    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="Resize bottom panel"');
    expect(html).toContain('aria-orientation="horizontal"');
  });
});

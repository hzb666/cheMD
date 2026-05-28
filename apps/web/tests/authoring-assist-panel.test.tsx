import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AuthoringAssistPanel } from "../src/features/editor/components/AuthoringAssistPanel";

describe("AuthoringAssistPanel", () => {
  it("renders minimum sets, grouped templates, and grouped suggestions", () => {
    const html = renderToStaticMarkup(
      <AuthoringAssistPanel
        assistance={{
          minimal_sets: [{
            checklist_id: "basic-experiment-record",
            title: "最小实验记录",
            description: "Reaction 和 result 至少要成对出现。",
            status: "fixable_by_suggestion",
            missing_items: [],
            inferable_items: ["res-main.ref"],
            suggestion_ids: ["suggest-result-ref-res-main"]
          }],
          templates: [{
            template_id: "scaffold-reaction-support-rxn-main",
            title: "为 rxn-main 插入记录 Scaffold",
            description: "补齐 result / TLC / observation。",
            category: "scaffold",
            patch: {
              kind: "batch",
              patches: [{
                kind: "append_document_text",
                text: ":::result #res-main"
              }]
            }
          }],
          suggestions: [{
            suggestion_id: "suggest-result-ref-res-main",
            title: "为 res-main 补 ref",
            description: "当前文档只有一个 reaction。",
            category: "reference",
            confidence: "high",
            target: { kind: "declaration", declarationId: "res-main" },
            patch: {
              kind: "insert_declaration_field",
              declarationId: "res-main",
              line: "reaction: @rxn-main"
            }
          }]
        }}
        actionsEnabled
        onApplySuggestion={vi.fn()}
        onApplyTemplate={vi.fn()}
      />
    );

    expect(html).toContain("Minimum Set");
    expect(html).toContain("Scaffolds");
    expect(html).toContain("为 rxn-main 插入记录 Scaffold");
    expect(html).toContain("Reference");
    expect(html).toContain("为 res-main 补 ref");
    expect(html).toContain("res-main.ref");
    expect(html).toContain("Apply");
  });
});

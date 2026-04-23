"use client";

import React from "react";

import type {
  AuthoringAssistance,
  AuthoringSuggestion,
  AuthoringTemplate
} from "@chemd/compiler";

interface AuthoringAssistPanelProps {
  assistance: AuthoringAssistance;
  actionsEnabled?: boolean;
  onApplySuggestion?: (suggestion: AuthoringSuggestion) => void;
  onApplyTemplate?: (template: AuthoringTemplate) => void;
}

const TEMPLATE_CATEGORY_ORDER: AuthoringTemplate["category"][] = [
  "starter",
  "scaffold",
  "optimization",
  "companion"
];

const TEMPLATE_CATEGORY_LABELS: Record<AuthoringTemplate["category"], string> = {
  starter: "Starter",
  scaffold: "Scaffolds",
  optimization: "Optimization",
  companion: "Companions"
};

const SUGGESTION_CATEGORY_ORDER: AuthoringSuggestion["category"][] = [
  "reference",
  "inheritance",
  "structure"
];

const SUGGESTION_CATEGORY_LABELS: Record<AuthoringSuggestion["category"], string> = {
  reference: "Reference",
  inheritance: "Inheritance",
  structure: "Structure"
};

const readStatusTone = (status: AuthoringAssistance["minimal_sets"][number]["status"]): string => {
  if (status === "complete") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300";
  }

  return status === "fixable_by_suggestion"
    ? "bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-300"
    : "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300";
};

const readStatusLabel = (status: AuthoringAssistance["minimal_sets"][number]["status"]): string => {
  if (status === "complete") {
    return "Complete";
  }

  return status === "fixable_by_suggestion" ? "Fixable" : "Needs input";
};

const Section = ({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) => (
  <section className="border-b border-border px-4 py-3 last:border-b-0">
    <div className="mb-2">
      <h3 className="notion-font-label text-[13px] text-foreground">{title}</h3>
      <p className="notion-font-caption text-[12px] text-muted-foreground">{subtitle}</p>
    </div>
    {children}
  </section>
);

const groupByCategory = <T extends { category: string }>(
  items: T[],
  order: string[]
): Array<{ category: string; items: T[] }> =>
  order.flatMap((category) => {
    const groupedItems = items.filter((item) => item.category === category);
    return groupedItems.length > 0
      ? [{ category, items: groupedItems }]
      : [];
  });

export const AuthoringAssistPanel = ({
  assistance,
  actionsEnabled = true,
  onApplySuggestion,
  onApplyTemplate
}: AuthoringAssistPanelProps) => {
  const templateGroups = groupByCategory(assistance.templates, TEMPLATE_CATEGORY_ORDER);
  const suggestionGroups = groupByCategory(assistance.suggestions, SUGGESTION_CATEGORY_ORDER);
  const isEmpty = assistance.minimal_sets.length === 0
    && assistance.templates.length === 0
    && assistance.suggestions.length === 0;

  if (isEmpty) {
    return (
      <div className="border-b border-border px-4 py-3">
        <p className="notion-font-caption text-[12px] text-muted-foreground">
          No authoring guidance for the current document.
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-muted/20">
      <Section
        title="Minimum Set"
        subtitle="作者最少需要补哪些信息，哪些可以一键补齐。"
      >
        <ul className="space-y-2">
          {assistance.minimal_sets.map((item) => (
            <li key={item.checklist_id} className="rounded-md border border-border bg-background px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="notion-font-ui text-[13px] text-foreground">{item.title}</div>
                  <div className="notion-font-caption text-[12px] text-muted-foreground">{item.description}</div>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[11px] notion-font-badge ${readStatusTone(item.status)}`}>
                  {readStatusLabel(item.status)}
                </span>
              </div>
              {item.missing_items.length > 0 ? (
                <div className="notion-font-caption text-[12px] text-muted-foreground">
                  Missing: {item.missing_items.join(" | ")}
                </div>
              ) : null}
              {item.inferable_items.length > 0 ? (
                <div className="notion-font-caption text-[12px] text-muted-foreground">
                  Inferable: {item.inferable_items.join(" | ")}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Templates"
        subtitle="常见实验模板，直接插入到当前文档。"
      >
        {templateGroups.length === 0 ? (
          <p className="notion-font-caption text-[12px] text-muted-foreground">
            No scaffold or starter templates.
          </p>
        ) : (
          <div className="space-y-3">
            {templateGroups.map((group) => (
              <div key={group.category} className="space-y-2">
                <div className="notion-font-label text-[12px] text-muted-foreground">
                  {TEMPLATE_CATEGORY_LABELS[group.category as AuthoringTemplate["category"]]}
                </div>
                <ul className="space-y-2">
                  {group.items.map((template) => (
                    <li
                      key={template.template_id}
                      className="rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div className="notion-font-ui text-[13px] text-foreground">{template.title}</div>
                      <div className="notion-font-caption text-[12px] text-muted-foreground">
                        {template.description}
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          disabled={!actionsEnabled}
                          className="playground-topbar-button notion-font-ui h-8 rounded-md border border-border px-3 text-[13px]"
                          onClick={() => onApplyTemplate?.(template)}
                        >
                          Apply
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Suggestions"
        subtitle="仅在目标唯一、无歧义时给出保守自动补全。"
      >
        {suggestionGroups.length === 0 ? (
          <p className="notion-font-caption text-[12px] text-muted-foreground">
            No conservative authoring suggestions.
          </p>
        ) : (
          <div className="space-y-3">
            {suggestionGroups.map((group) => (
              <div key={group.category} className="space-y-2">
                <div className="notion-font-label text-[12px] text-muted-foreground">
                  {SUGGESTION_CATEGORY_LABELS[group.category as AuthoringSuggestion["category"]]}
                </div>
                <ul className="space-y-2">
                  {group.items.map((suggestion) => (
                    <li key={suggestion.suggestion_id} className="rounded-md border border-border bg-background px-3 py-2">
                      <div className="notion-font-ui text-[13px] text-foreground">{suggestion.title}</div>
                      <div className="notion-font-caption text-[12px] text-muted-foreground">
                        {suggestion.description}
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          disabled={!actionsEnabled}
                          className="playground-topbar-button notion-font-ui h-8 rounded-md border border-border px-3 text-[13px]"
                          onClick={() => onApplySuggestion?.(suggestion)}
                        >
                          Apply
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

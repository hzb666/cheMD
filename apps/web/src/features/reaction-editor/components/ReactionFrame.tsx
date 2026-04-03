import React, { type ReactNode } from "react";

import { parseReactionListFromEditor } from "../lib/reaction-list";
import type { ReactionEditorDraft, ReactionFrameValue } from "../types";

export interface ReactionFrameRenderProps {
  draft: ReactionEditorDraft;
  value: ReactionFrameValue;
  onChange: (next: ReactionFrameValue) => void;
}

interface ReactionFrameProps {
  value: ReactionFrameValue;
  onChange: (next: ReactionFrameValue) => void;
  renderSurface?: (props: ReactionFrameRenderProps) => ReactNode;
  renderFields?: (props: ReactionFrameRenderProps) => ReactNode;
}

const renderDefaultSurface = ({ draft }: ReactionFrameRenderProps): ReactNode => (
  <div className="detail-card" style={{ marginBottom: "0.8rem" }}>
    <div className="detail-card-body" style={{ padding: "0.8rem" }}>
      <p className="panel-kicker">Reaction sketch surface</p>
      <p className="panel-meta">
        Ketcher-ready reaction shell. Replace this surface with the real editor bridge in the next step.
      </p>
      <div className="panel-inline-meta" style={{ marginTop: "0.6rem", marginBottom: "0.6rem" }}>
        <span className="toolbar-chip">Bridge ready</span>
        <span className="toolbar-chip">Reactants {draft.reactants.length}</span>
        <span className="toolbar-chip">Products {draft.products.length}</span>
        <span className="toolbar-chip">Conditions {draft.conditions.length}</span>
      </div>
      <div className="code-surface">
        <pre className="code-block scroll-area" style={{ minHeight: "7rem" }}>
          <code>
            {draft.reactants.length > 0 ? draft.reactants.join(" + ") : "Reactants"}
            {"\n"}
            {"=>"}
            {"\n"}
            {draft.products.length > 0 ? draft.products.join(" + ") : "Products"}
            {draft.conditions.length > 0 ? `\n[${draft.conditions.join(" | ")}]` : ""}
          </code>
        </pre>
      </div>
    </div>
  </div>
);

const renderDefaultFields = ({ value, onChange }: ReactionFrameRenderProps): ReactNode => (
  <>
    <p className="panel-meta">Use one item per line or separate items with |.</p>

    <label className="panel-meta" htmlFor="reaction-reactants-input">
      Reactants
    </label>
    <textarea
      id="reaction-reactants-input"
      className="editor-textarea playground-editor-textarea scroll-area"
      value={value.reactantsText}
      onChange={(event) =>
        onChange({
          ...value,
          reactantsText: event.target.value
        })
      }
    />

    <label className="panel-meta" htmlFor="reaction-products-input">
      Products
    </label>
    <textarea
      id="reaction-products-input"
      className="editor-textarea playground-editor-textarea scroll-area"
      value={value.productsText}
      onChange={(event) =>
        onChange({
          ...value,
          productsText: event.target.value
        })
      }
    />

    <label className="panel-meta" htmlFor="reaction-conditions-input">
      Conditions
    </label>
    <textarea
      id="reaction-conditions-input"
      className="editor-textarea playground-editor-textarea scroll-area"
      value={value.conditionsText}
      onChange={(event) =>
        onChange({
          ...value,
          conditionsText: event.target.value
        })
      }
    />
  </>
);

export const ReactionFrame = ({ value, onChange, renderSurface, renderFields }: ReactionFrameProps) => {
  const { reactantsText, productsText, conditionsText } = value;
  const draft: ReactionEditorDraft = {
    reactants: parseReactionListFromEditor(reactantsText),
    products: parseReactionListFromEditor(productsText),
    conditions: parseReactionListFromEditor(conditionsText)
  };
  const renderProps: ReactionFrameRenderProps = {
    draft,
    value,
    onChange
  };

  return (
    <div className="reaction-frame" data-reaction-editor-shell="ketcher-ready">
      {(renderSurface ?? renderDefaultSurface)(renderProps)}
      {(renderFields ?? renderDefaultFields)(renderProps)}
    </div>
  );
};

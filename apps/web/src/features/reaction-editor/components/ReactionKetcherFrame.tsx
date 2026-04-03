import React from "react";

import { ReactionFrame, type ReactionFrameRenderProps } from "./ReactionFrame";
import type { ReactionKetcherShellValue } from "../lib/reaction-ketcher-shell";

interface ReactionKetcherFrameProps {
  value: ReactionKetcherShellValue;
  onChange: (next: ReactionKetcherShellValue) => void;
}

const renderReactionHostSurface = (
  shellValue: ReactionKetcherShellValue,
  { draft, value }: ReactionFrameRenderProps
) => (
  <div className="detail-card" data-reaction-ketcher-shell="ketcher-ready" style={{ marginBottom: "0.8rem" }}>
    <div className="detail-card-body" style={{ padding: "0.8rem" }}>
      <p className="panel-kicker">Reaction sketch host</p>
      <p className="panel-meta">
        Ketcher-ready reaction host shell. Replace this surface with the real reaction editor bridge next.
      </p>
      <div className="panel-inline-meta" style={{ marginTop: "0.6rem", marginBottom: "0.6rem" }}>
        <span className="toolbar-chip">Bridge ready</span>
        <span className="toolbar-chip">Bridge mode {shellValue.bridgeMode}</span>
        <span className="toolbar-chip">Reaction editor</span>
        <span className="toolbar-chip">Reactants {draft.reactants.length}</span>
        <span className="toolbar-chip">Products {draft.products.length}</span>
      </div>
      <p className="panel-meta" id="reaction-ketcher-sync-token">
        Sync token: {shellValue.syncToken}
      </p>
      <div className="code-surface">
        <pre className="code-block scroll-area" style={{ minHeight: "7rem" }}>
          <code>
            {draft.reactants.length > 0 ? draft.reactants.join(" + ") : "Reactants"}
            {"\n"}
            {"=>"}
            {"\n"}
            {draft.products.length > 0 ? draft.products.join(" + ") : "Products"}
            {draft.conditions.length > 0 ? `\n[${draft.conditions.join(" | ")}]` : ""}
            {"\n\n"}
            {"# bridge payload"}
            {"\n"}
            {value.reactantsText || "(reactants)"}
            {"\n---\n"}
            {value.productsText || "(products)"}
            {"\n---\n"}
            {value.conditionsText || "(conditions)"}
          </code>
        </pre>
      </div>
    </div>
  </div>
);

const renderReactionHostFields = (
  shellValue: ReactionKetcherShellValue,
  onShellChange: (next: ReactionKetcherShellValue) => void,
  { value }: ReactionFrameRenderProps
) => (
  <>
    <p className="panel-meta">
      This shell keeps the current text payload contract so the real reaction editor can replace the host later.
    </p>

    <label className="panel-meta" htmlFor="reaction-ketcher-reactants-input">
      Reactants payload
    </label>
    <textarea
      id="reaction-ketcher-reactants-input"
      className="editor-textarea playground-editor-textarea scroll-area"
      value={value.reactantsText}
      onChange={(event) =>
        onShellChange({
          ...shellValue,
          editorValue: {
            ...value,
            reactantsText: event.target.value
          }
        })
      }
    />

    <label className="panel-meta" htmlFor="reaction-ketcher-products-input">
      Products payload
    </label>
    <textarea
      id="reaction-ketcher-products-input"
      className="editor-textarea playground-editor-textarea scroll-area"
      value={value.productsText}
      onChange={(event) =>
        onShellChange({
          ...shellValue,
          editorValue: {
            ...value,
            productsText: event.target.value
          }
        })
      }
    />

    <label className="panel-meta" htmlFor="reaction-ketcher-conditions-input">
      Conditions payload
    </label>
    <textarea
      id="reaction-ketcher-conditions-input"
      className="editor-textarea playground-editor-textarea scroll-area"
      value={value.conditionsText}
      onChange={(event) =>
        onShellChange({
          ...shellValue,
          editorValue: {
            ...value,
            conditionsText: event.target.value
          }
        })
      }
    />
  </>
);

export const ReactionKetcherFrame = ({ value, onChange }: ReactionKetcherFrameProps) => (
  <ReactionFrame
    value={value.editorValue}
    onChange={(next) =>
      onChange({
        ...value,
        editorValue: next
      })
    }
    renderSurface={(props) => renderReactionHostSurface(value, props)}
    renderFields={(props) => renderReactionHostFields(value, onChange, props)}
  />
);

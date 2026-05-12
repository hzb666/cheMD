import type {
  ChemdRenderableNodeV1,
  ChemdRenderStateV1,
  ChemdShellAttributesV1
} from "./types";

const setAttribute = (
  attrs: ChemdShellAttributesV1,
  key: keyof ChemdShellAttributesV1,
  value: string | undefined
): void => {
  if (value !== undefined && value !== "") {
    attrs[key] = value;
  }
};

export const buildChemdShellAttributes = (
  node: ChemdRenderableNodeV1,
  renderState: ChemdRenderStateV1 = "placeholder"
): ChemdShellAttributesV1 => {
  const attrs: ChemdShellAttributesV1 = {
    "data-chemd-node-id": node.node_id,
    "data-chemd-type": node.node_type,
    "data-chemd-component": node.render.component,
    "data-chemd-hydrate": node.render.hydrate,
    "data-chemd-render-state": renderState
  };

  setAttribute(attrs, "data-chemd-document-id", node.document_id);
  setAttribute(attrs, "data-chemd-entity-id", node.entity_id);
  setAttribute(attrs, "data-chemd-semantic-id", node.semantic_id);
  setAttribute(attrs, "data-chemd-data-ref", node.render.data_ref);

  return attrs;
};

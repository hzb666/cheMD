import {
  classifyReactionConditions,
  type ChemdDocument,
  type ChemdNode,
  type StructuredNode,
  type TemplateNode
} from "@chemd/core";

const serializeStructuredNode = (node: StructuredNode): unknown => {
  if (node.type === "reaction") {
    return {
      ...node,
      normalized_conditions: classifyReactionConditions(node)
    };
  }

  if (node.type === "template") {
    return {
      ...node,
      body: node.body.map(serializeNode)
    };
  }

  if (node.type === "col") {
    return {
      ...node,
      children: node.children.map(serializeNode)
    };
  }

  return node;
};

const serializeNode = (node: ChemdNode): unknown =>
  node.type === "markdown" ? node : serializeStructuredNode(node);

export const renderJson = (document: ChemdDocument): string =>
  JSON.stringify(
    {
      document: {
        meta: document.meta,
        children: document.children.map(serializeNode)
      },
      diagnostics: document.diagnostics
    },
    null,
    2
  );

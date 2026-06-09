import { compileChemd } from "@chemd/compiler";
import type { ChemdProgramDeclarationKind } from "@chemd/core";

export interface TreeNode {
  id: string;
  kind:
    | "document"
    | "material"
    | "molecule"
    | "batch"
    | "reaction"
    | "reaction_template"
    | "result"
    | "analysis"
    | "condition_screen"
    | "procedure"
    | "observation"
    | "sample"
    | "artifact"
    | "trace"
    | "agent_run";
}

const TREE_DECLARATION_KINDS = new Set<TreeNode["kind"]>([
  "material",
  "molecule",
  "batch",
  "reaction",
  "reaction_template",
  "result",
  "analysis",
  "condition_screen",
  "procedure",
  "observation",
  "sample",
  "artifact",
  "trace",
  "agent_run"
]);

const isTreeDeclarationKind = (
  kind: ChemdProgramDeclarationKind
): kind is Exclude<TreeNode["kind"], "document"> =>
  TREE_DECLARATION_KINDS.has(kind as TreeNode["kind"]);

export const buildMockTreeFromSource = (source: string): TreeNode[] => {
  const program = compileChemd(source).program;
  const nodes: TreeNode[] = [
    {
      id: program.meta.id,
      kind: "document"
    }
  ];

  return [
    ...nodes,
    ...program.declarations
      .filter((declaration) => isTreeDeclarationKind(declaration.kind))
      .map((declaration) => ({
        id: declaration.id,
        kind: declaration.kind
      }))
  ];
};

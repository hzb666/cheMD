import type {
  ChemdDeclaration,
  ChemdProgramDeclarationKind,
  ReferenceTargetKind
} from "@chemd/core";
import type { ReferenceOrLiteral } from "@chemd/typechecker";

import type {
  LinkChemdModulesResult,
  LinkedChemdModule
} from "./module-linker";

export interface ResolvedGraphReference {
  documentId: string;
  entityId: string;
  nodeId: string;
  targetKind: ReferenceTargetKind;
}

const NODE_PREFIX_BY_DECLARATION: Partial<Record<ChemdProgramDeclarationKind, string>> = {
  analysis: "ana",
  artifact: "art",
  batch: "bat",
  condition_screen: "condition_screen",
  material: "mat",
  molecule: "mol",
  procedure: "proc",
  reaction: "rxn",
  reaction_template: "template",
  result: "res",
  sample: "sam",
  trace: "trace"
};

const NODE_TYPE_BY_DECLARATION: Partial<Record<ChemdProgramDeclarationKind, string>> = {
  condition_screen: "condition_screen",
  reaction_template: "reaction_template"
};

export const hasWorkspaceGraphNode = (declaration: ChemdDeclaration): boolean =>
  Boolean(NODE_PREFIX_BY_DECLARATION[declaration.kind]);

export const nodeTypeForDeclaration = (declaration: ChemdDeclaration): string =>
  NODE_TYPE_BY_DECLARATION[declaration.kind] ?? declaration.kind;

export const declarationNodeId = (
  documentId: string,
  declaration: ChemdDeclaration
): string => {
  const prefix = NODE_PREFIX_BY_DECLARATION[declaration.kind] ?? declaration.kind;
  return entityNodeId(prefix, documentId, declaration.id);
};

export const entityNodeId = (
  prefix: string,
  documentId: string,
  entityId: string
): string => `${prefix}::${documentId}::${entityId}`;

export const docNodeId = (documentId: string): string => `doc::${documentId}`;

export const readDeclarationLabel = (declaration: ChemdDeclaration): string =>
  "fields" in declaration && declaration.fields.name?.type === "string"
    ? declaration.fields.name.value
    : declaration.id;

export const findModule = (
  linked: LinkChemdModulesResult,
  moduleName: string
): LinkedChemdModule | undefined =>
  linked.modules.find((module) => module.moduleName === moduleName);

export const resolveReference = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult,
  reference: ReferenceOrLiteral
): ResolvedGraphReference | undefined => {
  if (reference.kind !== "reference" || !reference.resolved) return undefined;
  const parts = reference.refId.split(".");
  if (parts.length > 1) {
    const moduleName = parts[0]!;
    const targetId = parts[1]!;
    const targetModule = resolveImportedModule(module, linked, moduleName);
    return targetModule ? resolveDeclarationReference(targetModule, targetId) : undefined;
  }
  return resolveDeclarationReference(module, reference.refId);
};

const resolveImportedModule = (
  module: LinkedChemdModule,
  linked: LinkChemdModulesResult,
  moduleNameOrAlias: string
): LinkedChemdModule | undefined => {
  const importEdge = linked.importGraph.edges.find((edge) =>
    edge.fromModule === module.moduleName
    && edge.status === "resolved"
    && (edge.importModuleName === moduleNameOrAlias || edge.alias === moduleNameOrAlias)
  );
  return importEdge?.toModule
    ? findModule(linked, importEdge.toModule)
    : findModule(linked, moduleNameOrAlias);
};

const resolveDeclarationReference = (
  module: LinkedChemdModule,
  declarationId: string
): ResolvedGraphReference | undefined => {
  const declaration = module.coreResult.program.declarations.find((item) => item.id === declarationId);
  if (!declaration) return undefined;
  return {
    documentId: module.documentId,
    entityId: declaration.id,
    nodeId: declarationNodeId(module.documentId, declaration),
    targetKind: toReferenceTargetKind(declaration.kind)
  };
};

const toReferenceTargetKind = (kind: ChemdProgramDeclarationKind): ReferenceTargetKind => {
  if (kind === "condition_screen") return "condition_varies";
  if (kind === "reaction_template") return "template";
  if (kind === "agent_run") return "unknown";
  return kind as ReferenceTargetKind;
};

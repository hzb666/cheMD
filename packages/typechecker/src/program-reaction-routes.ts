import {
  parseReferenceId,
  stripReferencePrefix,
  type ChemdProgramDeclarationKind
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { createExternalTargetIndex } from "./references";
import {
  buildCycleDiagnostics,
  buildOrphanDiagnostics,
  buildRouteMismatchDiagnostics,
  buildRouteReferenceDiagnostics,
  isResolvedReactionReference,
  type ExternalReactionIndex
} from "./program-reaction-route-diagnostics";
import type { ProgramSymbolTable } from "./program-utils";
import type {
  ExternalTargetIndex,
  ReferenceOrLiteral,
  ReferenceType,
  TypedReactionNode,
  TypedSemanticNode,
  TypecheckOptions
} from "./types";

interface ProgramRouteAugmentationInput {
  documentId: string;
  nodes: TypedSemanticNode[];
  symbols: ProgramSymbolTable;
  options: TypecheckOptions;
}

interface ProgramRouteAugmentationResult {
  nodes: TypedSemanticNode[];
  diagnostics: V03Diagnostic[];
}

export const augmentProgramReactionRouteGraph = (
  input: ProgramRouteAugmentationInput
): ProgramRouteAugmentationResult => {
  const externalTargetIndex = createExternalTargetIndex(
    input.options.referenceContext,
    input.options.reactionRouteContext
  );
  const reactions = input.nodes.filter((node): node is TypedReactionNode => node.kind === "reaction");
  const reactionById = new Map(reactions.map((reaction) => [reaction.nodeId, reaction]));
  const externalReactionIndex = createExternalReactionIndex(externalTargetIndex);
  const prevByReactionId = new Map(reactions.map((reaction) => [
    reaction.nodeId,
    resolvePrevList(reaction, input.symbols, externalTargetIndex)
  ]));
  const nextByReactionId = buildNextByReactionId(
    input.documentId,
    reactions,
    prevByReactionId,
    input.symbols,
    externalReactionIndex
  );
  const diagnostics = [
    ...buildRouteReferenceDiagnostics(reactions, prevByReactionId),
    ...buildRouteMismatchDiagnostics(reactions, prevByReactionId, reactionById, externalReactionIndex),
    ...buildCycleDiagnostics(
      buildDependencyGraph(input.documentId, reactions, prevByReactionId, input.symbols, externalReactionIndex),
      new Set(reactions.map((reaction) => reaction.nodeId))
    ),
    ...buildOrphanDiagnostics(reactions, prevByReactionId, nextByReactionId, externalReactionIndex)
  ];

  return {
    nodes: input.nodes.map((node) =>
      node.kind === "reaction"
        ? {
            ...node,
            prev: prevByReactionId.get(node.nodeId) ?? node.prev,
            next: nextByReactionId.get(node.nodeId) ?? []
          }
        : node
    ),
    diagnostics
  };
};

const createExternalReactionIndex = (
  externalTargetIndex: ExternalTargetIndex
): ExternalReactionIndex =>
  new Map(
    Array.from(externalTargetIndex.values())
      .filter((target) => target.targetKind === "reaction")
      .map((target) => [target.refId, target] as const)
  );

const resolvePrevList = (
  reaction: TypedReactionNode,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): ReferenceOrLiteral[] =>
  reaction.prev.map((reference) => resolvePrevReference(reference, symbols, externalTargetIndex));

const resolvePrevReference = (
  reference: ReferenceOrLiteral,
  symbols: ProgramSymbolTable,
  externalTargetIndex: ExternalTargetIndex
): ReferenceOrLiteral => {
  if (reference.kind !== "reference" || reference.resolved) return reference;
  const target = externalTargetIndex.get(stripReferencePrefix(reference.refId));
  if (target) {
    return {
      kind: "reference",
      refId: target.refId,
      targetKind: target.targetKind,
      resolved: true
    };
  }
  const declaration = symbols.get(stripReferencePrefix(reference.refId));
  return declaration
    ? {
        kind: "reference",
        refId: stripReferencePrefix(reference.refId),
      targetKind: targetKindForDeclaration(declaration.kind),
        resolved: true
      }
    : reference;
};

const buildNextByReactionId = (
  documentId: string,
  reactions: TypedReactionNode[],
  prevByReactionId: Map<string, ReferenceOrLiteral[]>,
  symbols: ProgramSymbolTable,
  externalReactionIndex: ExternalReactionIndex
): Map<string, ReferenceType[]> => {
  const nextByReactionId = new Map<string, ReferenceType[]>(
    reactions.map((reaction) => [reaction.nodeId, []])
  );
  for (const reaction of reactions) {
    for (const reference of prevByReactionId.get(reaction.nodeId) ?? []) {
      const targetId = resolveLocalReactionId(reference, symbols);
      if (targetId) appendUniqueReference(nextByReactionId, targetId, createReactionReference(reaction.nodeId));
    }
  }
  for (const target of externalReactionIndex.values()) {
    for (const prevRefId of target.prevRefIds ?? []) {
      const localId = findLocalReactionIdForReference(documentId, prevRefId, reactions);
      if (localId) appendUniqueReference(nextByReactionId, localId, createReactionReference(target.refId));
    }
  }
  return nextByReactionId;
};

const buildDependencyGraph = (
  documentId: string,
  reactions: TypedReactionNode[],
  prevByReactionId: Map<string, ReferenceOrLiteral[]>,
  symbols: ProgramSymbolTable,
  externalReactionIndex: ExternalReactionIndex
): Map<string, string[]> => {
  const graph = new Map<string, string[]>();
  for (const reaction of reactions) {
    graph.set(
      reaction.nodeId,
      (prevByReactionId.get(reaction.nodeId) ?? [])
        .filter(isResolvedReactionReference)
        .map((reference) => resolveLocalReactionId(reference, symbols) ?? reference.refId)
    );
  }
  for (const [refId, target] of externalReactionIndex) {
    graph.set(refId, (target.prevRefIds ?? []).flatMap((prevRefId) => {
      const localId = findLocalReactionIdForReference(documentId, prevRefId, reactions);
      if (localId) return [localId];
      const normalized = stripReferencePrefix(prevRefId);
      return externalReactionIndex.has(normalized) ? [normalized] : [];
    }));
  }
  return graph;
};

const resolveLocalReactionId = (
  reference: ReferenceOrLiteral,
  symbols: ProgramSymbolTable
): string | undefined => {
  if (reference.kind !== "reference") return undefined;
  const declaration = symbols.get(stripReferencePrefix(reference.refId));
  return declaration?.kind === "reaction" ? declaration.id : undefined;
};

const findLocalReactionIdForReference = (
  documentId: string,
  refId: string,
  reactions: TypedReactionNode[]
): string | undefined => {
  const normalized = stripReferencePrefix(refId);
  const parsed = parseReferenceId(normalized);
  if (parsed?.documentId && parsed.documentId !== documentId) return undefined;
  const objectId = parsed?.objectId ?? normalized;
  return reactions.some((reaction) => reaction.nodeId === objectId) ? objectId : undefined;
};

const appendUniqueReference = (
  nextByReactionId: Map<string, ReferenceType[]>,
  reactionId: string,
  reference: ReferenceType
): void => {
  const existing = nextByReactionId.get(reactionId) ?? [];
  if (!existing.some((item) => item.refId === reference.refId)) {
    nextByReactionId.set(reactionId, [...existing, reference]);
  }
};

const createReactionReference = (refId: string): ReferenceType => ({
  kind: "reference",
  refId,
  targetKind: "reaction",
  resolved: true
});

const targetKindForDeclaration = (
  kind: ChemdProgramDeclarationKind
): ReferenceType["targetKind"] =>
  kind === "condition_screen"
    ? "condition_varies"
    : kind === "reaction_template"
      ? "template"
    : kind === "agent_run"
      ? "unknown"
      : kind;

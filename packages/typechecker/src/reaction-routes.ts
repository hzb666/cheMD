import {
  type ExternalReferenceTarget,
  parseReferenceId,
  stripReferencePrefix
} from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

import { toReferenceOrLiteral } from "./references";
import type {
  ExternalTargetIndex,
  ObjectNode,
  ReferenceOrLiteral,
  ReferenceType,
  TypedReactionNode,
  TypedSemanticNode
} from "./types";

interface ResolveReactionPrevInput {
  documentId: string;
  objectIndex: Map<string, ObjectNode>;
  externalTargetIndex: ExternalTargetIndex;
  rawValues: string[];
  sourceNodeId?: string;
}

interface ReactionRouteAugmentationInput {
  documentId: string;
  nodes: TypedSemanticNode[];
  objectIndex: Map<string, ObjectNode>;
  externalTargetIndex: ExternalTargetIndex;
}

interface ReactionRouteAugmentationResult {
  nodes: TypedSemanticNode[];
  diagnostics: V03Diagnostic[];
}

type ExternalReactionIndex = Map<string, ExternalReferenceTarget>;

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values));

const createExternalReactionIndex = (
  externalTargetIndex: ExternalTargetIndex
): ExternalReactionIndex =>
  new Map(
    Array.from(externalTargetIndex.values())
      .filter((target) => target.targetKind === "reaction")
      .map((target) => [target.refId, target] as const)
  );

const createRouteReferenceDiagnostic = (
  reference: ReferenceType,
  sourceNodeId: string | undefined
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_TYPED_REFERENCE_MISMATCH",
    severity: "error",
    message: `Invalid prev reference: ${reference.refId}`,
    sourceLayer: "typechecker",
    sourceNodeType: "reaction",
    sourceNodeId,
    sourceField: "prev",
    facts: {
      field: "prev",
      ref_id: reference.refId,
      expected_target_kind: "reaction",
      actual_target_kind: reference.targetKind,
      resolved: reference.resolved
    }
  });

const isResolvedReactionReference = (
  reference: ReferenceOrLiteral
): reference is ReferenceType =>
  reference.kind === "reference"
  && reference.resolved
  && reference.targetKind === "reaction";

const createResolvedReactionReference = (refId: string): ReferenceType => ({
  kind: "reference",
  refId,
  targetKind: "reaction",
  resolved: true
});

const resolveReactionPrevReference = (
  raw: string,
  objectIndex: Map<string, ObjectNode>,
  externalTargetIndex: ExternalTargetIndex
): ReferenceType => {
  const normalized = stripReferencePrefix(raw);
  const local = toReferenceOrLiteral(`@${normalized}`, objectIndex, externalTargetIndex);
  if (local.kind === "reference" && local.resolved) {
    return local;
  }

  return local.kind === "reference"
    ? local
    : {
        kind: "reference",
        refId: normalized,
        targetKind: "unknown",
        resolved: false
      };
};

const findLocalReactionIdForReference = (
  documentId: string,
  refId: string,
  reactionById: Map<string, TypedReactionNode>
): string | undefined => {
  const normalized = stripReferencePrefix(refId);
  const parsed = parseReferenceId(normalized);
  if (parsed?.documentId && parsed.documentId !== documentId) {
    return undefined;
  }

  const objectId = parsed?.objectId ?? normalized;
  return reactionById.has(objectId) ? objectId : undefined;
};

const toRouteDependencyKey = (
  reference: ReferenceType,
  objectIndex: Map<string, ObjectNode>
): string => {
  const target = objectIndex.get(reference.refId);
  return target?.type === "reaction" && target.id
    ? target.id
    : stripReferencePrefix(reference.refId);
};

const appendUniqueReference = (
  nextByReactionId: Map<string, ReferenceType[]>,
  reactionId: string,
  reference: ReferenceType
): void => {
  const existing = nextByReactionId.get(reactionId) ?? [];
  if (existing.some((item) => item.refId === reference.refId)) {
    return;
  }

  nextByReactionId.set(reactionId, [...existing, reference]);
};

const buildRouteMismatchDiagnostics = (
  reactions: TypedReactionNode[],
  objectIndex: Map<string, ObjectNode>,
  externalReactionIndex: ExternalReactionIndex
): V03Diagnostic[] =>
  reactions.flatMap((reaction) =>
    reaction.prev.flatMap((reference) => {
      if (!isResolvedReactionReference(reference) || !reaction.route) {
        return [];
      }

      const localTarget = objectIndex.get(reference.refId);
      const prevRouteId = localTarget?.type === "reaction"
        ? localTarget.route
        : externalReactionIndex.get(reference.refId)?.routeId;

      return prevRouteId && prevRouteId !== reaction.route
        ? [createV03Diagnostic({
            code: "W_REACTION_ROUTE_MISMATCH",
            severity: "warning",
            message: `Reaction route ${reaction.route} conflicts with prev route ${prevRouteId}.`,
            sourceLayer: "typechecker",
            sourceNodeType: "reaction",
            sourceNodeId: reaction.nodeId,
            sourceField: "prev",
            facts: {
              route_id: reaction.route,
              prev_route_id: prevRouteId,
              prev_ref_id: reference.refId
            }
          })]
        : [];
    })
  );

const buildDependencyGraph = (
  documentId: string,
  reactions: TypedReactionNode[],
  objectIndex: Map<string, ObjectNode>,
  externalReactionIndex: ExternalReactionIndex
): Map<string, string[]> => {
  const graph = new Map<string, string[]>();
  const reactionById = new Map(reactions.map((reaction) => [reaction.nodeId, reaction]));

  reactions.forEach((reaction) => {
    graph.set(
      reaction.nodeId,
      reaction.prev
        .filter(isResolvedReactionReference)
        .map((reference) => toRouteDependencyKey(reference, objectIndex))
    );
  });

  externalReactionIndex.forEach((target, key) => {
    const dependencies = (target.prevRefIds ?? []).flatMap((prevRefId) => {
      const localReactionId = findLocalReactionIdForReference(documentId, prevRefId, reactionById);
      if (localReactionId) {
        return [localReactionId];
      }

      const normalized = stripReferencePrefix(prevRefId);
      return externalReactionIndex.has(normalized) ? [normalized] : [];
    });
    graph.set(key, dependencies);
  });

  return graph;
};

const buildCycleDiagnostics = (
  graph: Map<string, string[]>,
  localReactionIds: Set<string>
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const seenCycles = new Set<string>();

  const visit = (nodeId: string) => {
    const status = state.get(nodeId);
    if (status === "visited") {
      return;
    }
    if (status === "visiting") {
      return;
    }

    state.set(nodeId, "visiting");
    stack.push(nodeId);

    for (const dependencyId of graph.get(nodeId) ?? []) {
      const dependencyStatus = state.get(dependencyId);
      if (dependencyStatus === "visiting") {
        const cycle = stack.slice(stack.indexOf(dependencyId)).concat(dependencyId);
        const localMembers = cycle.filter((member) => localReactionIds.has(member));
        if (localMembers.length > 0) {
          const signature = uniqueStrings(localMembers).sort().join("|");
          if (!seenCycles.has(signature)) {
            seenCycles.add(signature);
            diagnostics.push(createV03Diagnostic({
              code: "E_REACTION_ROUTE_CYCLE",
              severity: "error",
              message: `Reaction route cycle detected: ${cycle.join(" -> ")}.`,
              sourceLayer: "typechecker",
              sourceNodeType: "reaction",
              sourceNodeId: localMembers[0],
              sourceField: "prev",
              facts: {
                cycle: cycle,
                local_reactions: localMembers
              }
            }));
          }
        }
        continue;
      }

      visit(dependencyId);
    }

    stack.pop();
    state.set(nodeId, "visited");
  };

  Array.from(graph.keys()).forEach(visit);
  return diagnostics;
};

const buildOrphanDiagnostics = (
  reactions: TypedReactionNode[],
  nextByReactionId: Map<string, ReferenceType[]>,
  externalReactionIndex: ExternalReactionIndex
): V03Diagnostic[] => {
  const routeSizes = new Map<string, number>();
  reactions.forEach((reaction) => {
    if (reaction.route) {
      routeSizes.set(reaction.route, (routeSizes.get(reaction.route) ?? 0) + 1);
    }
  });
  externalReactionIndex.forEach((target) => {
    if (target.routeId) {
      routeSizes.set(target.routeId, (routeSizes.get(target.routeId) ?? 0) + 1);
    }
  });

  return reactions.flatMap((reaction) => {
    if (!reaction.route || (routeSizes.get(reaction.route) ?? 0) <= 1) {
      return [];
    }

    const prevCount = reaction.prev.filter(isResolvedReactionReference).length;
    const nextCount = nextByReactionId.get(reaction.nodeId)?.length ?? 0;

    return prevCount === 0 && nextCount === 0
      ? [createV03Diagnostic({
          code: "W_REACTION_ROUTE_ORPHAN",
          severity: "warning",
          message: `Reaction is isolated inside route ${reaction.route}.`,
          sourceLayer: "typechecker",
          sourceNodeType: "reaction",
          sourceNodeId: reaction.nodeId,
          sourceField: "route",
          facts: {
            route_id: reaction.route,
            route_size: routeSizes.get(reaction.route)
          }
        })]
      : [];
  });
};

export const resolveReactionPrevReferences = (
  input: ResolveReactionPrevInput
): { values: ReferenceOrLiteral[]; diagnostics: V03Diagnostic[] } => {
  const values = input.rawValues.map((raw) =>
    resolveReactionPrevReference(raw, input.objectIndex, input.externalTargetIndex)
  );

  return {
    values,
    diagnostics: values.flatMap((reference) =>
      isResolvedReactionReference(reference) ? [] : [createRouteReferenceDiagnostic(reference, input.sourceNodeId)]
    )
  };
};

export const augmentReactionRouteGraph = (
  input: ReactionRouteAugmentationInput
): ReactionRouteAugmentationResult => {
  const reactions = input.nodes.filter((node): node is TypedReactionNode => node.kind === "reaction");
  const reactionById = new Map(reactions.map((reaction) => [reaction.nodeId, reaction]));
  const externalReactionIndex = createExternalReactionIndex(input.externalTargetIndex);
  const nextByReactionId = new Map<string, ReferenceType[]>(reactions.map((reaction) => [reaction.nodeId, []]));

  reactions.forEach((reaction) => {
    reaction.prev
      .filter(isResolvedReactionReference)
      .forEach((reference) => {
        const localTarget = input.objectIndex.get(reference.refId);
        if (localTarget?.type === "reaction" && localTarget.id) {
          appendUniqueReference(nextByReactionId, localTarget.id, createResolvedReactionReference(reaction.nodeId));
        }
      });
  });

  externalReactionIndex.forEach((target) => {
    (target.prevRefIds ?? []).forEach((prevRefId) => {
      const localReactionId = findLocalReactionIdForReference(input.documentId, prevRefId, reactionById);
      if (!localReactionId) {
        return;
      }

      appendUniqueReference(nextByReactionId, localReactionId, createResolvedReactionReference(target.refId));
    });
  });

  const graph = buildDependencyGraph(
    input.documentId,
    reactions,
    input.objectIndex,
    externalReactionIndex
  );
  const diagnostics = [
    ...buildRouteMismatchDiagnostics(reactions, input.objectIndex, externalReactionIndex),
    ...buildCycleDiagnostics(graph, new Set(reactions.map((reaction) => reaction.nodeId))),
    ...buildOrphanDiagnostics(reactions, nextByReactionId, externalReactionIndex)
  ];

  return {
    nodes: input.nodes.map((node) =>
      node.kind === "reaction"
        ? {
            ...node,
            next: nextByReactionId.get(node.nodeId) ?? []
          }
        : node
    ),
    diagnostics
  };
};

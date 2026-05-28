import type { ExternalReferenceTarget } from "@chemd/core";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

import type {
  ReferenceOrLiteral,
  ReferenceType,
  TypedReactionNode
} from "./types";

export type ExternalReactionIndex = Map<string, ExternalReferenceTarget>;

export const buildRouteReferenceDiagnostics = (
  reactions: TypedReactionNode[],
  prevByReactionId: Map<string, ReferenceOrLiteral[]>
): V03Diagnostic[] =>
  reactions.flatMap((reaction) =>
    (prevByReactionId.get(reaction.nodeId) ?? []).flatMap((reference) =>
      isResolvedReactionReference(reference)
        ? []
        : [createRouteReferenceDiagnostic(reference, reaction.nodeId)]
    )
  );

export const buildRouteMismatchDiagnostics = (
  reactions: TypedReactionNode[],
  prevByReactionId: Map<string, ReferenceOrLiteral[]>,
  reactionById: Map<string, TypedReactionNode>,
  externalReactionIndex: ExternalReactionIndex
): V03Diagnostic[] =>
  reactions.flatMap((reaction) =>
    (prevByReactionId.get(reaction.nodeId) ?? []).flatMap((reference) => {
      if (!isResolvedReactionReference(reference) || !reaction.route) return [];
      const prevRouteId = reactionById.get(reference.refId)?.route
        ?? externalReactionIndex.get(reference.refId)?.routeId;
      return prevRouteId && prevRouteId !== reaction.route
        ? [createV03Diagnostic({
            code: "W_REACTION_ROUTE_MISMATCH",
            severity: "error",
            message: `Reaction route ${reaction.route} conflicts with prev route ${prevRouteId}.`,
            sourceLayer: "typechecker",
            sourceNodeType: "reaction",
            sourceNodeId: reaction.nodeId,
            sourceField: "prev",
            facts: { route_id: reaction.route, prev_route_id: prevRouteId, prev_ref_id: reference.refId }
          })]
        : [];
    })
  );

export const buildCycleDiagnostics = (
  graph: Map<string, string[]>,
  localReactionIds: Set<string>
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const seenCycles = new Set<string>();
  const visit = (nodeId: string): void => {
    if (state.get(nodeId) === "visited") return;
    if (state.get(nodeId) === "visiting") return;
    state.set(nodeId, "visiting");
    stack.push(nodeId);
    for (const dependencyId of graph.get(nodeId) ?? []) {
      if (state.get(dependencyId) === "visiting") {
        const cycle = stack.slice(stack.indexOf(dependencyId)).concat(dependencyId);
        const localMembers = cycle.filter((member) => localReactionIds.has(member));
        const signature = Array.from(new Set(localMembers)).sort().join("|");
        if (localMembers.length > 0 && !seenCycles.has(signature)) {
          seenCycles.add(signature);
          diagnostics.push(createV03Diagnostic({
            code: "E_REACTION_ROUTE_CYCLE",
            severity: "error",
            message: `Reaction route cycle detected: ${cycle.join(" -> ")}.`,
            sourceLayer: "typechecker",
            sourceNodeType: "reaction",
            sourceNodeId: localMembers[0],
            sourceField: "prev",
            facts: { cycle, local_reactions: localMembers }
          }));
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

export const buildOrphanDiagnostics = (
  reactions: TypedReactionNode[],
  prevByReactionId: Map<string, ReferenceOrLiteral[]>,
  nextByReactionId: Map<string, ReferenceType[]>,
  externalReactionIndex: ExternalReactionIndex
): V03Diagnostic[] => {
  const routeSizes = new Map<string, number>();
  reactions.forEach((reaction) => {
    if (reaction.route) routeSizes.set(reaction.route, (routeSizes.get(reaction.route) ?? 0) + 1);
  });
  externalReactionIndex.forEach((target) => {
    if (target.routeId) routeSizes.set(target.routeId, (routeSizes.get(target.routeId) ?? 0) + 1);
  });
  return reactions.flatMap((reaction) => {
    if (!reaction.route || (routeSizes.get(reaction.route) ?? 0) <= 1) return [];
    const prevCount = (prevByReactionId.get(reaction.nodeId) ?? []).filter(isResolvedReactionReference).length;
    const nextCount = nextByReactionId.get(reaction.nodeId)?.length ?? 0;
    return prevCount === 0 && nextCount === 0
      ? [createV03Diagnostic({
          code: "W_REACTION_ROUTE_ORPHAN",
          severity: "error",
          message: `Reaction is isolated inside route ${reaction.route}.`,
          sourceLayer: "typechecker",
          sourceNodeType: "reaction",
          sourceNodeId: reaction.nodeId,
          sourceField: "route",
          facts: { route_id: reaction.route, route_size: routeSizes.get(reaction.route) }
        })]
      : [];
  });
};

export const isResolvedReactionReference = (
  reference: ReferenceOrLiteral
): reference is ReferenceType =>
  reference.kind === "reference"
  && reference.resolved
  && reference.targetKind === "reaction";

const createRouteReferenceDiagnostic = (
  reference: ReferenceOrLiteral,
  sourceNodeId: string
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_TYPED_REFERENCE_MISMATCH",
    severity: "error",
    message: `Invalid prev reference: ${reference.kind === "reference" ? reference.refId : reference.raw}`,
    sourceLayer: "typechecker",
    sourceNodeType: "reaction",
    sourceNodeId,
    sourceField: "prev",
    facts: {
      field: "prev",
      ref_id: reference.kind === "reference" ? reference.refId : reference.raw,
      expected_target_kind: "reaction",
      actual_target_kind: reference.kind === "reference" ? reference.targetKind : "literal",
      resolved: reference.kind === "reference" ? reference.resolved : false
    }
  });

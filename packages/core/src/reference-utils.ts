import type { ObjectSemanticKind } from "./ast";

export type ReferenceTargetKind =
  | ObjectSemanticKind
  | "condition_variation_attempt"
  | "template"
  | "unknown";

export interface ExternalReactionRouteTarget {
  refId: string;
  routeId?: string;
  prevRefIds?: string[];
  label?: string;
}

export interface ReactionRouteContext {
  externalReactions?: ExternalReactionRouteTarget[];
}

export interface ParsedReferenceId {
  lookupKey: string;
  documentId?: string;
  objectId: string;
  childId?: string;
  baseObjectLookupKey: string;
}

export const stripReferencePrefix = (value: string): string =>
  value.startsWith("@") ? value.slice(1).trim() : value.trim();

export const buildScopedReferenceId = (documentId: string, objectId: string): string =>
  `${documentId}#${objectId}`;

export const parseReferenceId = (value: string): ParsedReferenceId | undefined => {
  const lookupKey = stripReferencePrefix(value);
  if (!lookupKey) {
    return undefined;
  }

  const hashIndex = lookupKey.indexOf("#");
  const documentId = hashIndex >= 0 ? lookupKey.slice(0, hashIndex).trim() : undefined;
  const objectAndChild = hashIndex >= 0 ? lookupKey.slice(hashIndex + 1).trim() : lookupKey;
  if (!objectAndChild) {
    return undefined;
  }

  const dotIndex = objectAndChild.indexOf(".");
  const objectId = (dotIndex >= 0 ? objectAndChild.slice(0, dotIndex) : objectAndChild).trim();
  const childId = dotIndex >= 0 ? objectAndChild.slice(dotIndex + 1).trim() : undefined;
  if (!objectId) {
    return undefined;
  }

  return {
    lookupKey,
    ...(documentId ? { documentId } : {}),
    objectId,
    ...(childId ? { childId } : {}),
    baseObjectLookupKey: documentId ? buildScopedReferenceId(documentId, objectId) : objectId
  };
};

export const buildReactionEntityIdFromReference = (reference: string): string | undefined => {
  const parsed = parseReferenceId(reference);
  return parsed?.documentId
    ? `rxn::${parsed.documentId}::${parsed.objectId}`
    : undefined;
};

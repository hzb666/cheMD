import type { ChemdReactionIntelligenceArtifactV1 } from "@chemd/reaction-map";

import type {
  DesktopCommandError,
  DesktopCommandMap,
  LocalReactionIntelligenceArtifactEntry
} from "./desktop-contracts";
import { toSafeLocalDisplaySummary } from "./desktop-local-store";

export type ListLocalReactionIntelligenceArtifacts = (
  input: DesktopCommandMap["list_local_reaction_intelligence_artifacts"]["input"]
) => Promise<DesktopCommandMap["list_local_reaction_intelligence_artifacts"]["output"]>;

export type LocalReactionIntelligenceArtifactState =
  | {
    state: "ready";
    artifact: ChemdReactionIntelligenceArtifactV1;
    entry: LocalReactionIntelligenceArtifactEntry;
    error: null;
  }
  | {
    state: "empty" | "failed";
    artifact: null;
    entry: null;
    error: string | null;
  };

export interface ReadLatestLocalReactionIntelligenceArtifactInput {
  listArtifacts: ListLocalReactionIntelligenceArtifacts;
  graphIndexId?: string | null;
}

export const initialLocalReactionIntelligenceArtifactState: LocalReactionIntelligenceArtifactState = {
  state: "empty",
  artifact: null,
  entry: null,
  error: null
};

const toTimestamp = (value: string): number => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const entryTimestamp = (entry: LocalReactionIntelligenceArtifactEntry): number =>
  Math.max(toTimestamp(entry.updatedAt), toTimestamp(entry.createdAt));

const errorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  if (typeof commandError?.message === "string") {
    return commandError.message;
  }
  return error instanceof Error ? error.message : String(error);
};

export const selectLatestLocalReactionIntelligenceArtifactEntry = (
  entries: readonly LocalReactionIntelligenceArtifactEntry[]
): LocalReactionIntelligenceArtifactEntry | null =>
  [...entries].sort((left, right) => entryTimestamp(right) - entryTimestamp(left))[0] ?? null;

export const buildListLocalReactionIntelligenceArtifactsInput = (
  graphIndexId?: string | null
): DesktopCommandMap["list_local_reaction_intelligence_artifacts"]["input"] => ({
  ...(graphIndexId && graphIndexId.trim().length > 0 ? { graphIndexId: graphIndexId.trim() } : {}),
  limit: 1
});

export const reactionIntelligenceArtifactHasReactionOverlap = (
  artifact: ChemdReactionIntelligenceArtifactV1 | null,
  reactionIds: readonly string[]
): boolean => {
  if (!artifact) return false;
  const expectedIds = new Set(reactionIds.filter((id) => id.trim().length > 0));
  if (expectedIds.size === 0) return false;
  const artifactIds = new Set([
    ...artifact.reaction_features.map((feature) => feature.reaction_entity_id),
    ...artifact.similarity_edges.flatMap((edge) => [
      edge.from_reaction_entity_id,
      edge.to_reaction_entity_id
    ])
  ]);
  return [...expectedIds].some((id) => artifactIds.has(id));
};

export const readLatestLocalReactionIntelligenceArtifact = async ({
  listArtifacts,
  graphIndexId
}: ReadLatestLocalReactionIntelligenceArtifactInput): Promise<LocalReactionIntelligenceArtifactState> => {
  try {
    const entries = await listArtifacts(buildListLocalReactionIntelligenceArtifactsInput(graphIndexId));
    const entry = selectLatestLocalReactionIntelligenceArtifactEntry(entries);
    return entry
      ? { state: "ready", artifact: entry.artifact, entry, error: null }
      : initialLocalReactionIntelligenceArtifactState;
  } catch (error: unknown) {
    return {
      state: "failed",
      artifact: null,
      entry: null,
      error: toSafeLocalDisplaySummary(errorMessage(error))
        ?? "Local reaction intelligence artifact command failed."
    };
  }
};

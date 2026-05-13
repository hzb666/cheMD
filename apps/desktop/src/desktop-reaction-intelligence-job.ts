import {
  type ChemdReactionIntelligenceJobInputV1,
  type ChemdReactionIntelligenceProviderKindV1
} from "@chemd/reaction-map";
import { createSourceHash, type ChemdLanguageCompileOutput } from "@chemd/language-service";

export type DesktopReactionIntelligenceJobBuildState = "ready" | "skipped";

export interface DesktopReactionIntelligenceJobBuildInput {
  compileOutput: ChemdLanguageCompileOutput;
  source: string;
  documentUri: string;
  requestedProviders?: ChemdReactionIntelligenceProviderKindV1[];
}

export interface DesktopReactionIntelligenceJobBuildResult {
  state: DesktopReactionIntelligenceJobBuildState;
  job: ChemdReactionIntelligenceJobInputV1 | null;
  message: string;
  reactionCount: number;
  skippedReactionIds: string[];
}

const DEFAULT_PROVIDERS: ChemdReactionIntelligenceProviderKindV1[] = [
  "rdkit_fingerprint",
  "hybrid_graph",
  "tmap_layout"
];

const normalizeDocumentUri = (value: string): string =>
  value.trim().length > 0 ? value.trim() : "desktop-document";

const sourceHashForReaction = (source: string, reactionId: string): string =>
  `fnv1a:${createSourceHash(`${source}\n${reactionId}`)}`;

const participantSmiles = (
  participants: readonly { canonical_smiles?: string; smiles?: string }[]
): string[] | null => {
  const values = participants.map((participant) =>
    participant.canonical_smiles?.trim() || participant.smiles?.trim() || ""
  );
  return values.length > 0 && values.every((value) => value.length > 0)
    ? values
    : null;
};

const joinParticipantIds = (
  participants: readonly { target_original_id?: string; raw: string }[]
): string =>
  participants.map((participant) =>
    participant.target_original_id?.trim() || participant.raw.trim()
  ).filter(Boolean).join("+");

export const buildDesktopReactionIntelligenceJob = ({
  compileOutput,
  source,
  documentUri,
  requestedProviders = DEFAULT_PROVIDERS
}: DesktopReactionIntelligenceJobBuildInput): DesktopReactionIntelligenceJobBuildResult => {
  if (compileOutput.status === "failed") {
    return {
      state: "skipped",
      job: null,
      message: "Compile failed; reaction intelligence job was not created.",
      reactionCount: 0,
      skippedReactionIds: []
    };
  }

  const documentId = normalizeDocumentUri(compileOutput.result.trainingExport.document.document_id || documentUri);
  const sourceHash = createSourceHash(source);
  const skippedReactionIds: string[] = [];
  const reactions = compileOutput.result.trainingExport.semantic_layer.reactions.flatMap((reaction) => {
    const reactionId = reaction.original_id ?? reaction.entity_id;
    const reactants = participantSmiles(reaction.reactants);
    const products = participantSmiles(reaction.products);
    if (!reactants || !products) {
      skippedReactionIds.push(reactionId);
      return [];
    }

    return [{
      reaction_entity_id: reactionId,
      document_id: documentId,
      source_range: reaction.field_source_spans,
      canonical_rxn_smiles: `${reactants.join(".")}>>${products.join(".")}`,
      participant_signature: `${joinParticipantIds(reaction.reactants)}=>${joinParticipantIds(reaction.products)}`,
      reaction_family: reaction.name ?? reaction.caption,
      procedure_signature: reaction.route_raw,
      condition_signature: reaction.conditions_raw?.join(" | "),
      source_hash: sourceHashForReaction(source, reactionId)
    }];
  });

  if (reactions.length === 0) {
    return {
      state: "skipped",
      job: null,
      message: skippedReactionIds.length > 0
        ? "Reaction intelligence requires reactant/product SMILES for at least one reaction."
        : "No reactions were available for reaction intelligence.",
      reactionCount: 0,
      skippedReactionIds
    };
  }

  return {
    state: "ready",
    job: {
      schema_version: "chemd-reaction-intelligence-job/v0.1",
      job_id: `desktop-reaction-intelligence-job::${sourceHash}`,
      graph_index_id: `desktop-knowledge-map::${documentId}`,
      source_compile_run_ids: [`desktop-compile::${sourceHash}`],
      reactions,
      requested_providers: requestedProviders,
      provider_policy: {
        missing_dependency: "skip",
        per_reaction_failure: "warn",
        allow_network: false
      }
    },
    message: skippedReactionIds.length > 0
      ? `Reaction intelligence job is ready with ${reactions.length} reaction(s); ${skippedReactionIds.length} reaction(s) lack structure data.`
      : `Reaction intelligence job is ready with ${reactions.length} reaction(s).`,
    reactionCount: reactions.length,
    skippedReactionIds
  };
};

import {
  buildEditorGraphRagRecords,
  createSourceHash,
  type EditorGraphRagCitationCandidate,
  type EditorGraphRagSourceRange
} from "@chemd/language-service";
import type { WorkspaceDocumentInput } from "@chemd/workspace-index";

export type DesktopWorkspaceRagGateState = "empty" | "blocked" | "ready";

export interface DesktopWorkspaceRagGate {
  state: DesktopWorkspaceRagGateState;
  message: string;
}

export interface DesktopWorkspaceRagResult {
  id: string;
  citationId: string;
  revisionId: string;
  chunkId: string;
  sourceRange: EditorGraphRagSourceRange;
  documentPath: string;
  documentUri: string;
  label: string;
  detail: string;
  locator: string;
}

interface CitationBuildInput {
  documentPath: string;
  documentUri: string;
  candidates: readonly EditorGraphRagCitationCandidate[];
  chunkTextById: ReadonlyMap<string, string>;
}

const nonBlank = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const hasUsableRange = (range: EditorGraphRagSourceRange): boolean =>
  typeof range.startLine === "number" && typeof range.endLine === "number";

const isUsableCitationCandidate = (
  candidate: EditorGraphRagCitationCandidate
): boolean =>
  nonBlank(candidate.citationId)
  && nonBlank(candidate.revisionId)
  && nonBlank(candidate.chunkId)
  && hasUsableRange(candidate.sourceRange);

const rangeLocator = (range: EditorGraphRagSourceRange): string => {
  if (range.startLine === range.endLine) {
    return `L${range.startLine}`;
  }
  return `L${range.startLine}-L${range.endLine}`;
};

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

export const buildDesktopWorkspaceRagResultsFromCitationCandidates = ({
  documentPath,
  documentUri,
  candidates,
  chunkTextById
}: CitationBuildInput): DesktopWorkspaceRagResult[] =>
  candidates.flatMap((candidate) => {
    if (!isUsableCitationCandidate(candidate)) {
      return [];
    }
    const text = chunkTextById.get(candidate.chunkId) ?? candidate.chunkId;
    const locator = `${candidate.citationId} ${rangeLocator(candidate.sourceRange)}`;
    return [{
      id: `rag-${candidate.citationId}`,
      citationId: candidate.citationId,
      revisionId: candidate.revisionId,
      chunkId: candidate.chunkId,
      sourceRange: candidate.sourceRange,
      documentPath,
      documentUri,
      label: truncate(text.replace(/\s+/g, " ").trim() || candidate.chunkId, 96),
      detail: `${documentPath} ${locator}`,
      locator
    }];
  });

const stablePart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "") || "item";

const documentIdFromPath = (path: string): string =>
  path
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.chemd(?:\.md)?$/u, "")
  || "document";

const createdAtFromDocument = (document: WorkspaceDocumentInput): string => {
  const modifiedAtMs = document.metadata?.modifiedAtMs;
  if (typeof modifiedAtMs === "number" && Number.isFinite(modifiedAtMs)) {
    return new Date(modifiedAtMs).toISOString();
  }
  return "1970-01-01T00:00:00.000Z";
};

const buildDocumentRagResults = (
  workspaceId: string,
  document: WorkspaceDocumentInput
): DesktopWorkspaceRagResult[] => {
  try {
    const documentPath = document.path ?? document.uri;
    const sourceHash = createSourceHash(document.source);
    const records = buildEditorGraphRagRecords({
      source: document.source,
      documentUri: document.uri,
      experimentId: stablePart(`${workspaceId}-${documentIdFromPath(documentPath)}`),
      revisionId: stablePart(`rev-${workspaceId}-${documentPath}-${sourceHash}`),
      createdAt: createdAtFromDocument(document),
      options: { strictChemdKind: true }
    });
    const chunkTextById = records.compileOutput.status === "ok"
      ? new Map(records.compileOutput.result.ragExport.chunks.map((chunk) => [
        chunk.chunk_id,
        chunk.text
      ]))
      : new Map<string, string>();

    return buildDesktopWorkspaceRagResultsFromCitationCandidates({
      documentPath,
      documentUri: document.uri,
      candidates: records.ragCitationCandidates,
      chunkTextById
    });
  } catch {
    return [];
  }
};

const messageForGate = (
  documentCount: number,
  resultCount: number
): DesktopWorkspaceRagGate => {
  if (documentCount === 0) {
    return {
      state: "empty",
      message: "RAG search is citation-backed only; load Chemd documents to enable results."
    };
  }
  if (resultCount === 0) {
    return {
      state: "blocked",
      message: "RAG search is citation-backed only; no usable citations are available."
    };
  }
  return {
    state: "ready",
    message: "RAG search is citation-backed only; every result includes a locator."
  };
};

export const buildDesktopWorkspaceRagView = (
  workspaceId: string,
  documents: readonly WorkspaceDocumentInput[]
): { ragResults: DesktopWorkspaceRagResult[]; ragGate: DesktopWorkspaceRagGate } => {
  const ragResults = documents.flatMap((document) =>
    buildDocumentRagResults(workspaceId, document)
  );
  return {
    ragResults,
    ragGate: messageForGate(documents.length, ragResults.length)
  };
};

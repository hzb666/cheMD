export { buildWorkspaceSymbolIndex } from "./build";
export {
  findReferences,
  findSymbolDefinitions,
  listWorkspaceSymbols,
  summarizeWorkspaceIndex,
  type WorkspaceSymbolQuery,
  type WorkspaceSymbolTarget
} from "./queries";
export type {
  WorkspaceDocumentInput,
  WorkspaceIndexCompileFn,
  WorkspaceIndexCompileInput,
  WorkspaceIndexDiagnostic,
  WorkspaceIndexedDocument,
  WorkspaceIndexSummary,
  WorkspaceIndexVersion,
  WorkspaceReference,
  WorkspaceReferenceStatus,
  WorkspaceSymbol,
  WorkspaceSymbolIndex
} from "./types";

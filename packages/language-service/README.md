# @chemd/language-service

`@chemd/language-service` adapts the Chemd compiler pipeline for editor and
desktop runtime consumers. It exposes diagnostics, outline, symbols, Monaco
payload adapters, quick-fix proposals, and Graph/RAG record DTO builders.

## Graph/RAG Record Helper

`buildEditorGraphRagRecords(input)` builds persistable Graph/RAG DTOs from the
current editor source and compile output. The helper:

- calls `compileChemdForEditor()` when a compile output is not supplied;
- emits a graph snapshot, graph nodes, graph edges, and RAG citation candidates;
- aligns field names with the PostgreSQL Graph/RAG storage contract where useful;
- keeps DTO types local to this package to avoid depending on
  `@chemd/storage-postgres`;
- performs no database IO, file IO, embedding generation, or runtime writes.

The graph is evidence-first. It maps document, outline/block, semantic entity,
and diagnostic nodes, then adds only relationships available from editor/compiler
evidence: document order, block containment, route links, result evidence links,
and diagnostic source-range links. It does not infer real chemistry beyond the
compiler outputs.

RAG citation candidates include `documentUri`, `revisionId`, `chunkId`,
`entityId`/`blockId` when available, and a source range so a storage layer can
later write `chemd_rag_chunk_citations`.

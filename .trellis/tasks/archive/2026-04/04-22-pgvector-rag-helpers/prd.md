# Implement pgvector RAG helpers

## Goal

Add a runtime helper layer for Chemd RAG chunk embeddings and pgvector search.
The layer should connect compiled RAG chunks to embedding generation and vector
retrieval while keeping database clients and embedding providers injected.

## Requirements

- Add web server-side helpers for embedding Chemd RAG chunks and storing vectors.
- Add server-side helper for pgvector similarity search over stored RAG chunks.
- Keep the helper free of global database pools, environment reads, and concrete
  embedding SDKs.
- Validate vector shape before SQL writes or search.
- Reuse `PostgresQueryClient` and `RagChunkRecord` contracts from existing
  storage work.
- Preserve storage package purity; no runtime DB IO in
  `@chemd/storage-postgres`.
- Update storage contract spec with pgvector helper signatures and behavior.

## Acceptance Criteria

- [x] Embedding model metadata is upserted before chunk embeddings are written.
- [x] Chunk embeddings are written with `$n::vector` casts and keyed by
  `chunk_id + embedding_model`.
- [x] Invalid or mismatched vector dimensions fail before SQL execution.
- [x] Similarity search uses pgvector distance ordering and supports limit,
  experiment, revision, and chunk-type filters.
- [x] Unit tests cover write, validation, search SQL, and row mapping.
- [x] Relevant Trellis storage spec documents are updated.
- [x] Targeted web tests, typecheck, and lint pass.

## Technical Notes

- Use pgvector textual vector literals as query parameters and cast with
  `::vector`.
- Keep provider interface minimal: `embed(text) -> number[]`.
- Do not add `pg`, OpenAI, or other provider dependencies in this stage.
- The app composition layer will later supply concrete database and embedding
  clients.

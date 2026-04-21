# Implement PostgreSQL ingest service

## Goal

Add a backend composition service that can install the Chemd storage schema,
compile and persist one experiment, and optionally write pgvector embeddings for
the resulting RAG chunks.

## Requirements

- Compose existing runtime pieces without moving their responsibilities.
- Support an injected `PostgresQueryClient` for tests, API routes, and jobs.
- Support a runtime-client wrapper that creates and closes a PostgreSQL client.
- Allow optional schema installation before ingest.
- Allow optional embedding write after core experiment records are persisted.
- Preserve experiment records even if later embedding work fails.
- Update Trellis storage contract spec for the ingest service boundary.

## Acceptance Criteria

- [x] Schema installation can run before experiment persistence.
- [x] Core experiment persistence uses `saveCompiledExperiment()`.
- [x] Optional embedding writes use `writeRagChunkEmbeddings()` after RAG chunks exist.
- [x] Runtime wrapper closes the PostgreSQL client on success and failure.
- [x] Tests cover schema install, embedding skip, embedding write, and runtime close.
- [x] No concrete embedding SDK is introduced.
- [x] Tests, typecheck, and lint pass.

## Technical Notes

- This service is orchestration only; it does not create SQL strings itself.
- It should not bind OpenAI or any model provider.
- `postgres-storage.ts` and `postgres-rag.ts` remain the lower-level helpers.

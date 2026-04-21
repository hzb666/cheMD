# Postgres embedding backfill job

## Goal

Add a server-side embedding backfill path that can generate pgvector embeddings
for RAG chunks already persisted in PostgreSQL.

## Requirements

- Add a runtime service that selects RAG chunks by `revisionId`,
  `experimentId`, or an explicit `limit`.
- Use the existing HTTP embedding gateway provider and
  `writeRagChunkEmbeddings()` helper.
- Support rerunning a model by upserting the same `embeddingModel` rows.
- Return a compact progress summary with selected, embedded, and skipped counts.
- Add a POST route for local/admin tooling to trigger the backfill.
- Keep API route thin and avoid binding embedding SDKs directly.
- Add tests with fake database client and fake embedding provider behavior.

## Acceptance Criteria

- [ ] Backfill service reads eligible chunks from PostgreSQL.
- [ ] Service validates filter and model inputs before writing vectors.
- [ ] Service writes embeddings through existing pgvector helper.
- [ ] Route validates JSON input and maps config/database errors clearly.
- [ ] Tests cover success, empty result, invalid filters, and failures.
- [ ] Targeted tests, lint, typecheck, and full tests pass.

## Technical Notes

- Candidate route:
  `POST /api/chem/postgres/rag/backfill`
- The core service should accept injected `PostgresQueryClient` and
  `EmbeddingProvider` so unit tests do not require PostgreSQL or network.
- Runtime wrapper composes `createPostgresRuntimeClient()` and
  `createRuntimeEmbeddingProvider()`.
- This stage does not implement a queue worker yet; it creates the reusable
  backfill unit that a future worker can call.

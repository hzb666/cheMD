# Postgres RAG search API route

## Goal

Expose a minimal Next.js API route for pgvector-backed RAG chunk similarity
search using the existing PostgreSQL runtime client and RAG helper.

## Requirements

- Add a `POST` route under `/api/chem/postgres/rag/search`.
- Parse JSON request bodies with existing route parser helpers.
- Require `embedding`, `embeddingModel`, and `embeddingDim`.
- Accept optional `distanceMetric`, `limit`, `experimentId`, `revisionId`, and
  `chunkTypes`.
- Validate vector dimension, finite vector values, distance metric, limit, and
  chunk type values before running PostgreSQL queries.
- Keep query embedding generation out of this route; callers must provide the
  already computed query embedding.
- Use a runtime PostgreSQL client and always close it after search.
- Return stable JSON with ranked chunk results and model metadata.

## Acceptance Criteria

- [ ] Route rejects invalid JSON and missing required model/vector fields.
- [ ] Route rejects invalid dimensions, non-finite vectors, limit, metric, and
  chunk types.
- [ ] Route forwards accepted filters to pgvector search.
- [ ] Runtime clients are closed on success and failure.
- [ ] Route tests cover success and error branches without opening PostgreSQL.
- [ ] Targeted web tests, web typecheck, and eslint pass.

## Technical Notes

- This route is a retrieval boundary over existing stored chunks.
- It intentionally accepts a vector instead of a query string so provider
  binding can remain a separate task.
- The route must use Node.js runtime because PostgreSQL uses `pg.Pool`.

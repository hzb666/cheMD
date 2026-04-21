# Postgres RAG query API route

## Goal

Expose a text-query RAG search API route by binding the existing pgvector search
flow to a configurable HTTP embedding provider.

## Requirements

- Add a reusable server-only embedding provider that reads runtime env and calls
  a configured HTTP embedding endpoint.
- Add a `POST` route under `/api/chem/postgres/rag/query`.
- Parse JSON request bodies with existing route parser helpers.
- Require `query`.
- Accept optional `limit`, `experimentId`, `revisionId`, and `chunkTypes`.
- Generate the query embedding through the provider, then call pgvector search
  with the generated vector and configured model metadata.
- Keep database code, embedding provider code, and route parsing separated.
- Never hard-code credentials in source.
- Return stable JSON with model metadata, result count, and ranked chunks.

## Acceptance Criteria

- [ ] Provider validates base URL, model, dimension, timeout, and response vector.
- [ ] Provider supports a simple Chemd gateway response and OpenAI-compatible
  `{ data: [{ embedding }] }` response shape.
- [ ] Query route rejects invalid JSON, missing query, invalid limit, and invalid
  chunk types.
- [ ] Query route maps missing embedding config to `500`.
- [ ] Query route maps provider/search failures to `502`.
- [ ] Runtime PostgreSQL clients are closed through the existing search wrapper.
- [ ] Targeted web tests, web typecheck, and eslint pass.

## Technical Notes

- Environment keys:
  - `CHEMD_EMBEDDING_BASE_URL`
  - `CHEMD_EMBEDDING_MODEL`
  - `CHEMD_EMBEDDING_DIM`
  - `CHEMD_EMBEDDING_PATH`
  - `CHEMD_EMBEDDING_API_KEY`
  - `CHEMD_EMBEDDING_TIMEOUT_MS`
  - `CHEMD_EMBEDDING_DISTANCE_METRIC`
- The provider request body is `{ input, model }`.
- The provider response may be `{ embedding }` or `{ data: [{ embedding }] }`.

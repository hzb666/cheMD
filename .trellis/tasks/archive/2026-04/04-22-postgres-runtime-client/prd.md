# Implement PostgreSQL runtime client

## Goal

Add an application-layer PostgreSQL runtime client for Chemd storage so future
API routes, import jobs, and embedding jobs can use the existing storage
writer and pgvector helpers with a real `pg` pool.

## Requirements

- Add a minimal `pg` pool adapter in `apps/web/src/server/chem`.
- Parse PostgreSQL runtime configuration from injected environment-like input.
- Keep pool creation outside `postgres-storage.ts` and `postgres-rag.ts`.
- Expose a helper that adapts `pg.Pool` to the existing `PostgresQueryClient`.
- Avoid reading secrets at module import time except through an explicit
  factory for the app composition layer.
- Add focused tests for config parsing, missing config, pool query forwarding,
  and shutdown.
- Update Trellis storage contract spec with runtime client boundaries.

## Acceptance Criteria

- [x] `DATABASE_URL` or equivalent config can create a runtime PostgreSQL pool.
- [x] Missing database URL fails with a clear error before pool creation.
- [x] The runtime client implements the existing `PostgresQueryClient` shape.
- [x] Pool query forwarding preserves SQL text and parameter values.
- [x] Shutdown calls `pool.end()`.
- [x] No concrete `pg` import is added to storage writer or RAG helper files.
- [x] Tests, typecheck, and lint pass.

## Technical Notes

- Concrete dependency belongs in `@chemd/web`, not `@chemd/storage-postgres`.
- Keep the adapter small; schema install, record writes, and pgvector RAG remain
  in their current modules.
- Do not introduce API routes in this stage.

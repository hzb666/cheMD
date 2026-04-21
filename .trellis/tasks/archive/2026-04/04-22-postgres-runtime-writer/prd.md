# Implement PostgreSQL Runtime Writer

## Goal
Implement the runtime writer for Chemd PostgreSQL storage using the existing `@chemd/storage-postgres` contract.

## Requirements
- Add a server-only writer under `apps/web/src/server/chem`.
- Accept an injected PostgreSQL-like client instead of creating a connection or reading env vars.
- Compile Chemd source with `compileChemd()` and convert outputs with `buildExperimentStorageRecords()`.
- Execute transactional writes in a deterministic order.
- Add tests for transaction order, rollback on failure, and compile-to-record integration.
- Keep pgvector embedding generation out of this step.

## Acceptance Criteria
- [x] Writer begins transaction, writes all core record groups, and commits.
- [x] Writer rolls back and rethrows when any SQL operation fails.
- [x] Writer exposes schema migration SQL execution helper.
- [x] Tests verify insert/upsert order and payload preservation.
- [x] Web targeted tests, typecheck, and eslint pass.

## Verification

- [x] `pnpm --filter @chemd/web test -- src/server/chem/postgres-storage.spec.ts`
- [x] `pnpm --filter @chemd/web typecheck`
- [x] `pnpm exec eslint apps/web/src/server/chem/postgres-storage.ts apps/web/src/server/chem/postgres-storage.spec.ts --ext .ts`

## Technical Notes
- No `pg` dependency in this step.
- A later step can bind this writer to a real `pg.PoolClient` or app-level DB client.

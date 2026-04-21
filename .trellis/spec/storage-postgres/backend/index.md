# Backend Development Guidelines - @chemd/storage-postgres

Status: Filled from the current codebase.

## Scope

`@chemd/storage-postgres` defines the PostgreSQL storage contract for compiled
Chemd experiment records. Treat this package as a pure TypeScript contract
library: it may export SQL migration text, record types, and value-to-record
mapping functions, but it must not open database connections or read runtime
configuration.

## Guideline Index

| Guide | Status | Purpose |
|-------|--------|---------|
| [Storage Contract](./storage-contract.md) | Filled | SQL schema, mapping signatures, data contracts, and tests |

## Pre-Development Checklist

- Read `AGENTS.md` and this package's relevant guideline file before editing.
- Read [Storage Contract](./storage-contract.md) before changing table names,
  record fields, migration SQL, or `buildExperimentStorageRecords()`.
- Keep runtime database IO outside this package.
- Preserve `trainingExport`, `ragExport`, and `trainingUnderstanding` as
  separate storage artifacts.
- Add or update tests in `packages/storage-postgres/src/*.spec.ts` for every
  contract change.
- Run `pnpm --filter @chemd/storage-postgres test` and
  `pnpm --filter @chemd/storage-postgres typecheck`.

## Examples To Follow

- `packages/storage-postgres/src/schema.ts`
- `packages/storage-postgres/src/types.ts`
- `packages/storage-postgres/src/records.ts`
- `packages/storage-postgres/src/records.spec.ts`

## Architectural Contract

`@chemd/storage-postgres` consumes already compiled Chemd exports. It must not
parse source, run the compiler internally, generate embeddings, or execute SQL.
Runtime services own transactions, upsert ordering, embedding generation,
pgvector retrieval, and database connection management.

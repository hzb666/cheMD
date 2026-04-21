# Postgres migration runner and smoke script

## Goal

Add command-line scripts that install the Chemd PostgreSQL schema and run a real
database smoke test against the configured PostgreSQL/pgvector connection.

## Requirements

- Add a migration runner command that reads `CHEMD_POSTGRES_DATABASE_URL` from
  env files or process env and installs `@chemd/storage-postgres` schema SQL.
- Add a smoke command that verifies database connectivity, pgvector extension,
  schema installation, and a minimal Chemd ingest flow.
- Keep scripts outside Next.js route code and reusable from the repository root.
- Do not require embedding provider configuration for the smoke path.
- Add package scripts for easy execution.
- Add script tests that do not require a real database.
- Document local/SSH tunnel usage and required env keys.

## Acceptance Criteria

- [ ] `pnpm postgres:migrate` installs schema with the configured database URL.
- [ ] `pnpm postgres:smoke` runs migration and persists a sample experiment.
- [ ] Missing database URL fails with a clear message.
- [ ] Env loading supports `apps/web/.env.local` and root `.env.local`.
- [ ] Script tests cover env parsing and command behavior with a fake pg pool.
- [ ] Targeted script tests, storage/web checks, and full tests pass.

## Technical Notes

- Use Node ESM scripts under `scripts/`.
- Use the existing `pg` dependency from `apps/web/node_modules`.
- Use `@chemd/storage-postgres` schema SQL and `@chemd/compiler` outputs rather
  than duplicating schema or compile logic.

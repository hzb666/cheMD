# Postgres ingest API route

## Goal

Expose a minimal Next.js API route that persists a compiled Chemd experiment
through the existing PostgreSQL runtime ingest service.

## Requirements

- Add a `POST` route under `/api/chem/*` for PostgreSQL experiment ingest.
- Parse JSON request bodies with the existing route parser helpers.
- Require `source` and `revisionId`.
- Accept optional revision metadata: `sourceKind`, `sourceUri`,
  `parentRevisionId`, `commitSha`, `createdAt`, `compileRunId`,
  `compilerVersion`, and `installSchema`.
- Keep embedding generation out of this API route until a provider binding is
  explicitly added.
- Use `persistChemdExperimentWithRuntime()` as the only persistence entry point.
- Return stable JSON containing experiment id, revision id, compile run id,
  schema install flag, embedding count, and persisted record counts.
- Map validation errors to `400`, missing database configuration to `500`, and
  persistence failures to `502`.

## Acceptance Criteria

- [ ] Route rejects invalid JSON and missing required fields.
- [ ] Route validates `sourceKind` and boolean `installSchema`.
- [ ] Route forwards accepted fields to the runtime ingest service.
- [ ] Route closes runtime clients through the existing service wrapper.
- [ ] Route tests cover success and error branches without opening PostgreSQL.
- [ ] Targeted web tests, web typecheck, and eslint pass.

## Technical Notes

- This task touches an API boundary and a database-backed service boundary.
- The route must use Node.js runtime because PostgreSQL uses `pg.Pool`.
- The first API version intentionally excludes embedding providers; the caller
  can persist core records now, while embedding jobs remain a separate step.

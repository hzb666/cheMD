# Postgres training export API

## Goal

Add a server-side training export path that reads persisted PostgreSQL records
and produces training-ready JSON artifacts for model fine-tuning and evaluation.

## Requirements

- Add an API/service that exports `trainingExport` by `experimentId` or
  `revisionId`.
- Include optional export modes for correction patterns and
  Experiment Pattern Memory when data exists.
- Keep route validation thin and reusable for future job/CLI callers.
- Preserve source revision metadata such as `revisionId`, `experimentId`,
  `commitSha`, and `createdAt`.
- Return bounded, deterministic output ordered by revision creation time.
- Add tests using fake PostgreSQL clients; do not require real DB in CI.

## Acceptance Criteria

- [x] Route rejects unbounded export requests.
- [x] Service reads compile artifacts and revision metadata from PostgreSQL.
- [x] Export response includes training records and provenance metadata.
- [x] Optional pattern memory export is represented in a stable payload shape.
- [x] Tests cover success, empty result, invalid input, and DB failure mapping.
- [x] Targeted tests, lint, typecheck, and full tests pass.

## Implementation Notes

- Implemented `POST /api/chem/postgres/training/export`.
- Request must provide exactly one of `experimentId` or `revisionId`.
- `limit` is optional, defaults to 50, and is capped at 100.
- Optional fields:
  - `includeCorrectionPatterns`
  - `includeExperimentPatternMemory`
- Compile artifacts are read from latest `success` or `warning` compile runs.
  Error compile runs are excluded.
  Revisions are ordered by `created_at ASC, revision_id ASC`.

## Technical Notes

- Candidate route:
  `POST /api/chem/postgres/training/export`
- This stage should not implement git history import yet; it creates the export
  surface that later git-derived records can feed.
- Use parameterized SQL only and avoid streaming until payload size demands it.

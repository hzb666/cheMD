# Implement PostgreSQL Storage Contract

## Goal
Implement the first backend storage layer for Chemd experiment persistence using PostgreSQL and pgvector-oriented contracts.

## Requirements
- Add a pure TypeScript storage package for PostgreSQL persistence contracts.
- Provide versioned SQL schema for experiments, revisions, compile artifacts, semantic facts, RAG chunks, embeddings, semantic diffs, Training Experience Memory, and Experiment Pattern Memory.
- Provide typed records and a pure mapper from compiled Chemd outputs into insertable storage records.
- Keep database IO outside the package; no ORM, connection pool, env reads, or hidden persistence.
- Add tests for artifact mapping, semantic fact extraction, RAG chunk records, and storage schema exports.

## Acceptance Criteria
- [x] New package builds with TypeScript strict mode.
- [x] Tests cover good/base storage mapping cases.
- [x] SQL schema includes pgvector extension and core tables.
- [x] Mapping preserves source revision, compile artifacts, training understanding, and RAG chunks without losing provenance.

## Verification
- [x] `pnpm --filter @chemd/storage-postgres test`
- [x] `pnpm --filter @chemd/storage-postgres typecheck`
- [x] `pnpm exec eslint packages/storage-postgres/src --ext .ts`
- [x] `pnpm typecheck`
- [x] `pnpm test`

## Technical Notes
- Storage package name: @chemd/storage-postgres.
- Current implementation is a contract and pure transform layer.
- Runtime DB execution can be added later under app/server or service code.

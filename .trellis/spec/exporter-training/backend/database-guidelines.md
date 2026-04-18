# Database Guidelines - @chemd/exporter-training

## Overview

`@chemd/exporter-training` does not own a database, ORM, migrations, Redis, or durable cache. Package logic should be deterministic and testable from input values.

## Persistence Boundary

- Keep database and cache concerns outside `packages/*`.
- Web runtime persistence and upstream service calls belong in `apps/web/src/server/chem/*`.
- Chemistry runtime persistence belongs in `services/chem-service`, not in TypeScript library packages.
- If a new feature needs storage, define the data contract at the boundary first and keep this package pure.

## External IO

- Default rule: no `fetch`, `fs`, process env reads, timers, or subprocesses in package core paths.
- Exception: `packages/compiler/src/node.ts` may use Node APIs for Pandoc/DOCX export and must keep that surface under `@chemd/compiler/node`.
- Renderers should return strings or typed payloads; they should not write files.

## Examples

- `packages/compiler/src/index.ts` compiles source to in-memory HTML, JSON, and DOCX bridge strings.
- `packages/compiler/src/node.ts` isolates Pandoc subprocess and temp-file behavior behind explicit Node-only APIs.
- `packages/renderer-json/src/index.ts` serializes a document without writing to disk.

## Forbidden Patterns

```ts
// Do not add hidden persistence to a package helper.
const cache = await fetch('/api/cache');
```

Instead, pass already-fetched data into the package or put the IO in `apps/web/src/server/chem/*`.

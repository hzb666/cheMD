# Desktop IDE Production Implementation

## Goal

Build the first production-oriented implementation slice for Chemd Desktop IDE on top of the `desktop-ide` architecture baseline.

## Requirements

- Keep `desktop-ide` as the integration branch.
- Use isolated worktrees and branches for parallel implementation.
- Keep `apps/web` and existing playground behavior intact.
- Do not wrap the current Next.js runtime as the desktop product.
- Preserve `compileChemd()` as the semantic source of truth.
- Preserve PostgreSQL as the durable knowledge backend.
- Keep `chem-service` as a managed sidecar boundary.
- Require Agent changes to use patch proposals and approval gates.

## Parallel Slices

1. `desktop-ide-shell`
   - Owns `apps/desktop/**`.
   - Creates the Tauri/Vite/React shell skeleton.

2. `desktop-ide-language-service`
   - Owns `packages/language-service/**`.
   - Creates the compiler-backed language service contract.

3. `desktop-ide-postgres-graph-rag`
   - Owns `packages/storage-postgres/**`.
   - Extends pure storage contracts for Graph/RAG/revisions/audit.

4. `desktop-ide-agent-tools`
   - Owns `packages/agent-tools/**`.
   - Creates pure Agent tool contracts and safety gates.

## Acceptance Criteria

- Each slice compiles or reports exact environment blockers.
- Each slice runs `git diff --check`.
- Each slice commits to its branch with a Chinese commit message.
- Integration branch merges reviewed slices only.
- Shared root config or lockfile changes are reviewed centrally.
- Final integration reports targeted verification and remaining gaps.

## Non-Goals

- No production UI polish pass beyond shell skeleton.
- No real LLM provider integration.
- No real sidecar packaging finalization.
- No PostgreSQL runtime connection implementation in `@chemd/storage-postgres`.
- No silent Agent file writes.

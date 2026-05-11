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

## Second-Wave Productionization Slices

The first wave established the production boundaries. The second wave turns
those boundaries into directly usable local IDE behavior while keeping ownership
isolated.

1. `desktop-ide-workspace-io`
   - Owns `apps/desktop/src-tauri/**`.
   - Replaces placeholder workspace commands with safe local directory, file
     listing, read, and write commands.
   - Rejects path traversal and reports structured frontend-displayable errors.

2. `desktop-ide-workbench-ui`
   - Owns `apps/desktop/src/App.tsx` and `apps/desktop/src/styles/**`.
   - Connects the shell to `@chemd/language-service` diagnostics, outline, and
     quick-fix data.
   - Keeps the UI close to the web product language: dense, calm, and
     workbench-first.

3. `desktop-ide-postgres-graph-repository`
   - Owns `packages/storage-postgres/src/graph-rag-*`.
   - Adds repository/query helpers for graph snapshots, RAG chunk citations,
     agent runs, tool calls, and patch proposals.
   - Must keep the schema generic and reuse `chemd_experiments`,
     `chemd_experiment_revisions`, and `chemd_rag_chunks`.

4. `desktop-ide-agent-orchestration`
   - Owns `packages/agent-tools/**`.
   - Adds deterministic local orchestration helpers and an audit timeline.
   - Does not connect a real LLM provider or require secrets.

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

## Updated Acceptance Criteria

- Desktop workspace commands perform real local file operations safely.
- The React workbench can display a real or sample document with language-service
  diagnostics and outline data.
- Graph/RAG repository helpers use parameterized SQL and do not introduce
  `desktop_*` or `chemd_desktop_*` tables.
- Agent orchestration blocks illegal state transitions and uncited patch apply
  decisions.
- Final integration runs targeted package tests, desktop build/typecheck, Rust
  checks, root `pnpm typecheck`, root `pnpm test`, and `git diff --check`.

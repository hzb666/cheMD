# PRD: Reaction Intelligence Kernel

## Background

Chemd 的反应关联与聚类目前主要依赖语义图、reaction family、procedure signature、condition signature 和 external chemistry feature refs。生产可用的反应聚类需要真实计算层：reaction fingerprint、RXNFP embedding、atom mapping/reaction center，以及可选的大规模布局。

## Requirements

1. Define a stable reaction intelligence contract across TypeScript graph index and Python chem-service worker.
2. Add optional local providers for RDKit fingerprint, RXNMapper atom mapping/reaction center, RXNFP embeddings, and TMAP layout.
3. Add DRFP as the default deterministic reaction fingerprint provider for production clustering.
4. Build hybrid similarity edges and deterministic clusters with explicit basis and warnings.
5. Keep all heavy dependencies optional and lazily loaded.
6. Never claim computed chemistry when a provider is unavailable or skipped.
7. Keep implementation componentized; no business logic in app entrypoints or service main files.

## Non-goals

- No remote API dependency as the default production path.
- No required app-level TMAP display in this task.
- No dependency lockfile upgrade unless strictly required and approved.
- No change to Chemd language syntax for reaction templates.

## Acceptance Criteria

- TypeScript tests cover artifact merge, DRFP contract, and warning behavior.
- Python tests cover provider availability, fake provider execution, DRFP fallback, hybrid scoring, deterministic clustering, and TMAP skip/layout behavior.
- `services/chem-service` can run the worker/CLI against a JSON job.
- Docs explain provider policy, graph semantics, DRFP worker policy, clustering thresholds, and TMAP display decision.
- Relevant package/service validation commands are run and recorded.

## Parallel Ownership

See `docs/chemd-reaction-intelligence-kernel-implementation-plan.zh-CN.md`.

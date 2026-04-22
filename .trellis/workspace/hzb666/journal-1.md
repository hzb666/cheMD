# Journal - hzb666 (Part 1)

> AI development session journal
> Started: 2026-04-16

---



## Session 1: Record PR11 editor and experiment workflow merge

**Date**: 2026-04-17
**Task**: Record PR11 editor and experiment workflow merge
**Package**: web
**Branch**: `develop`

### Summary

Recorded the committed PR11 merge in `a832632`, including the chemd edit, preview, OCR, save, and experiment-recording flow plus parser, renderer, and chem-service extensions.

### Main Changes

| Area | Summary |
|------|---------|
| Web app | Completed the main chemd edit, preview, OCR, save, and experiment-recording flow, including theme sync, document writeback, and draft APIs. |
| Server | Added and organized chem render, save, inventory, reaction OCR, JSON export, and DOCX export services and routes. |
| Parser/Renderer | Refactored frontmatter/body parsing and several block parsers, and expanded HTML/JSON/DOCX rendering behavior. |
| Chem service | Extended molecule/reaction OCR, rendering, layout, remote provider, and structure storage implementations. |
| Repo docs | Updated README, wiki outputs, workflow notes, and repository configuration to capture the current implementation state. |

**Commit**: `a832632`

**Notes**:
- The working tree was clean and there were no active tasks.
- This record covered an existing development-branch commit and did not include later local uncommitted changes.


### Git Commits

| Hash | Message |
|------|---------|
| `a832632` | (see git log) |

### Testing

- `pnpm typecheck` passed.
- `pnpm lint` failed because the repository baseline still had 36 ESLint errors.
- `pnpm test` failed because `@chemd/parser` had no committed test files and Vitest reported `No test files found`.
- `pnpm run lint:py` passed.
- `pnpm run format:check:py` failed because 17 Python files still needed `ruff format`.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: Implement chemd-lang v0.3 semantic core

**Date**: 2026-04-17
**Task**: Implement chemd-lang v0.3 semantic core
**Package**: web
**Branch**: `develop`

### Summary

Implemented the chemd-lang v0.3 semantic core and connected the new semantic outputs into the compiler pipeline.

### Main Changes

| Area | Details |
|------|---------|
| Language v0.3 | Implemented diagnostics, step ontology lowering, typechecker typed semantic graph, runtime run plan/preflight, runtime trace, and LNF v0.3 output. |
| Compiler integration | `compileChemd` now returns `typedSemanticGraph`, `stepGraph`, `runPlan`, `runtimePreflight`, `lnf`, and `trainingExport` while preserving legacy render outputs. |
| Training export | Added optional `semantic_layer.v03_lnf`, `learning_layer.procedure_to_steps`, and `learning_layer.observation_to_events`. |
| Compatibility | Preserved raw reaction `conditions_text` in normalized reaction conditions to keep OCR/export expectations stable. |
| Tests | Added focused package tests for compiler v0.3, diagnostics, step ontology, typechecker, runtime lab, runtime trace, LNF, exporter training, and baseline package smoke tests. |
| Verification | `pnpm typecheck` passed; `pnpm test` passed; v0.3 scoped eslint passed. |
| Known blocker | Full `pnpm lint` still fails on existing unrelated complexity/React lint issues outside the v0.3 change scope. |
| Code-spec | Added `.trellis/spec/compiler/backend/language-v03-contracts.md` and linked it from compiler backend index. |

**Commit**:
- `97d3151 feat(lang)：实现 chemd-lang v0.3 语义内核`

**Primary Files**:
- `packages/compiler/src/index.ts`
- `packages/diagnostics/src/index.ts`
- `packages/step-ontology/src/index.ts`
- `packages/typechecker/src/index.ts`
- `packages/runtime-lab/src/index.ts`
- `packages/runtime-trace/src/index.ts`
- `packages/lnf/src/index.ts`
- `packages/exporter-training/src/export-record.ts`
- `packages/core/src/reaction-conditions.ts`


### Git Commits

| Hash | Message |
|------|---------|
| `97d3151` | (see git log) |

### Testing

- [OK] `pnpm typecheck`
- [OK] `pnpm test`
- [OK] v0.3 scoped ESLint checks
- [WARN] Full `pnpm lint` still failed on unrelated existing complexity and React lint issues outside the v0.3 scope.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Lint complexity cleanup

**Date**: 2026-04-17
**Task**: Lint complexity cleanup
**Package**: web
**Branch**: `develop`

### Summary

Cleared the current TypeScript lint complexity backlog and kept Python Ruff checks clean while preserving existing behavior.

### Main Changes

| Area | Description |
|------|------|
| Goal | Cleared the current TypeScript lint errors and kept Python Ruff checks clean based on the complexity remediation plan. |
| Package cleanup | Split parser, renderer-docx, render-profile, and exporter-training hotspots while preserving package boundaries. |
| Web cleanup | Split complex chem editor, OCR, preview hydration, preview bridge, preview shell controller, page, component, and controller logic. |
| Comments | Added concise comments for non-obvious Markdown link parsing, RDKit adapter mapping, preview postMessage constraints, OCR fallback block IDs, and reaction hydration behavior. |
| Regression fixes | Fixed reviewed risks around empty reaction draft arrays, inventory iframe remount delivery, and malformed reaction OCR payloads. |
| Tests | Added and reorganized web regression tests for routes, preview hydration, inventory iframe switching, replaceChemBlock, and OCR actions. |
| Docs | Updated docs/2026-04-10-chemd-lint-complexity-refactor-plan.md with the 2026-04-17 baseline, batch progress, review fixes, and validation evidence. |

**Key Validation**

- `pnpm lint`: exit 0
- `pnpm typecheck`: 16 successful / 16 total
- `pnpm test`: 16 successful / 16 total; `@chemd/web` reported 32 files / 108 tests passed
- `pnpm lint:py`: All checks passed
- `cd services/chem-service && poetry run ruff check app.py chem_service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`: All checks passed
- `git diff --cached --check`: exit 0

**Commit**

- `1044638cc965a13b8f2f21bf691e22453023293f`: `refactor：重构部分函数，降低复杂度`

**Follow-up Notes**

- No active Trellis task needed archiving.
- Work was committed on `develop`; no push was performed.


### Git Commits

| Hash | Message |
|------|---------|
| `1044638cc965a13b8f2f21bf691e22453023293f` | (see git log) |

### Testing

- [OK] `pnpm lint`
- [OK] `pnpm typecheck`
- [OK] `pnpm test`
- [OK] `pnpm lint:py`
- [OK] `poetry run ruff check app.py chem_service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: 完成 chemd DSL 语义闭环与提交拆分

**Date**: 2026-04-19
**Task**: 完成 chemd DSL 语义闭环与提交拆分
**Package**: web
**Branch**: `develop`

### Summary

(Add summary)

### Main Changes

## Summary

Completed the staged chemd DSL language package work and split the implementation into six topic-focused commits.

| Area | Result |
|------|--------|
| Parser/Core/Resolver | Canonicalized `:::chemd` authoring with explicit semantic `kind`, AST origin tracking, template parameter validation, and legacy surface migration diagnostics. |
| Typechecker | Added typed graph nodes, reference rules, explicit step and observation semantics, derived expression parsing, and normalized graph contracts. |
| Export/Runtime/Renderers | Added LNF v0.4 and training export layers, threaded typed graph output through compiler/renderers, and aligned JSON/HTML/DOCX/runtime trace behavior. |
| Web | Added diagnostics quick fix UI, canonical OCR block kind handling, stricter JSON export validation, chem-service timeout handling, and safer preview hydration. |
| Chem Service | Improved reaction OCR payload compatibility, reaction render fallback behavior, and molecule/reaction structure cache handling. |
| Tooling/Docs | Added legacy surface audit and migration scripts, script tests, lint coverage updates, and README DSL documentation updates. |

## Commits

- `ba7fff5` feat(parser)：收紧 chemd DSL 语义契约
- `ac2d500` feat(typechecker)：补齐 typed graph 语义规则
- `3bd576c` feat(export)：接入 LNF v0.4 与训练导出层
- `5f105e3` feat(web)：强化 Web 化学编辑与服务边界
- `8248e37` feat(chem-service)：完善 reaction 服务与结构缓存
- `8a2d6ba` chore(tooling)：补充 legacy surface 工具和文档

## Validation Notes

- `pnpm lint` passed.
- `node node_modules\turbo\bin\turbo run typecheck` passed.
- `poetry run ruff check app.py chem_service tests` passed.
- `poetry run python -m unittest discover -s tests -v` passed.
- `pnpm --filter @chemd/web typecheck` passed.
- `pnpm --filter @chemd/compiler typecheck` passed.
- `pnpm exec eslint packages/compiler/src/quick-fix.ts packages/compiler/tests/quick-fix.test.ts` passed.
- User-reported web preview hydration regression was fixed by allowing safe local render-error markup while continuing to reject unsafe markup.
- Local Vitest execution in Codex remained blocked by environment `spawn EPERM` / mounted node_modules resolution behavior, so root Vitest was not re-run locally after the final fix.

## Notes

- Did not use `git add -f` when creating commits.
- Restored `.gitignore` to the prior strategy for `docs/`, `tests/`, and `.trellis/`.
- Final non-ignored working tree was clean before recording this session.


### Git Commits

| Hash | Message |
|------|---------|
| `ba7fff5` | (see git log) |
| `ac2d500` | (see git log) |
| `3bd576c` | (see git log) |
| `5f105e3` | (see git log) |
| `8248e37` | (see git log) |
| `8a2d6ba` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: 对齐 canonical LNF 与训练导出契约

**Date**: 2026-04-19
**Task**: 对齐 canonical LNF 与训练导出契约
**Package**: web
**Branch**: `develop`

### Summary

(Add summary)

### Main Changes

| Area | Summary |
|------|---------|
| LNF | Split canonical LNF types/builders and removed old V03/V04 compatibility outputs. |
| Training export | Updated export schema to chemd-training-export/v0.2 and stores semantic_layer.lnf. |
| Compiler | compileChemd now returns one canonical lnf plus ChemdTrainingExportV2. |
| Renderer HTML | Restored human-readable related/uses/produces/after step details without machine metadata. |
| Web preview | Preferred render error markup over fallback SVG payloads and fixed SVG hydration edge cases. |
| Local tooling | Repaired Windows pnpm workspace package resolution and expanded Next transpilePackages. |
| React build | Removed setState-in-effect from ChemEditorDialog by remounting per edit-session key. |
| Docs/tests | Updated Trellis specs, README files, and affected package/web tests. |

**Verification**:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `git diff --check`

**Notes**:
- `pnpm type-check` is not a repo script; `pnpm typecheck` is the canonical command.
- Next build still emits a non-blocking warning about missing Next.js ESLint plugin detection.
- Historical v0.1 docs remain as archived planning material; current code/spec/README/v0.2 docs are aligned.


### Git Commits

| Hash | Message |
|------|---------|
| `b396143` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: Chemd CLI MVP and training export context

**Date**: 2026-04-20
**Task**: Chemd CLI MVP and training export context
**Package**: web
**Branch**: `develop`

### Summary

Implemented local Chemd CLI, improved training export semantic context, fixed workbench UI issues, and archived the completed task.

### Main Changes

| Area | Details |
|------|---------|
| CLI | Added local validate/export/diff/changed commands under packages/cli. |
| Training Export | Added semantic fact links and extra LLM/RAG retrieval chunks. |
| Web Workbench | Fixed compile badge state, line count typography, sample title, and preview banner placement. |
| Specs | Added CLI contracts and training export contract docs under .trellis/spec. |
| Verification | pnpm lint, pnpm typecheck, pnpm test, and git diff --check completed before commit. |
| Notes | docs/ remains git-ignored, so docs alignment edits were intentionally not committed. |


### Git Commits

| Hash | Message |
|------|---------|
| `179be6c` | (see git log) |
| `349051f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: Playground LSM status header

**Date**: 2026-04-20
**Task**: Playground LSM status header
**Package**: web
**Branch**: `develop`

### Summary

Added a playground LSM status indicator and refined the compact header label styling.

### Main Changes

| Area | Details |
|------|---------|
| LSM status | Added a lightweight LabStorageManager status endpoint and surfaced ready/disconnect state in the playground header. |
| Header UI | Added compact hover/focus expanding LSM and YAML pills with no wrapping. |
| Dark mode | Lowered YAML pill brightness in dark mode. |
| Layout | Adjusted header tag spacing and removed the tag container right margin. |
| Verification | Ran targeted web eslint, typecheck, route/client tests, and status endpoint smoke check during the session. |


### Git Commits

| Hash | Message |
|------|---------|
| `ac52175` | (see git log) |
| `ff2906a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: 实验决策训练理解阶段 1

**Date**: 2026-04-21
**Task**: 实验决策训练理解阶段 1
**Package**: web
**Branch**: `develop`

### Summary

完成 README 与测试索引整理；阶段 1 补强 trainingUnderstanding 的设计上下文、结果质量、预测特征和实验决策类 LoRA hints，并通过 typecheck/test/lint 验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c3ffdd4` | (see git log) |
| `b43a0db` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: 实验决策训练理解阶段 2

**Date**: 2026-04-21
**Task**: 实验决策训练理解阶段 2
**Package**: web
**Branch**: `develop`

### Summary

从 trainingUnderstanding 派生实验决策训练样本，新增 JSONL/SFT messages 数据集 API，补充来源实体、派生监督质量、任务 contract，并归档任务。验证通过：exporter-training typecheck/test/eslint、git diff --check、pnpm typecheck、pnpm test。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `36e1a4d` | (see git log) |
| `63efbe3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: 实验内涵训练投影阶段 1

**Date**: 2026-04-21
**Task**: 实验内涵训练投影阶段 1
**Package**: web
**Branch**: `develop`

### Summary

补充 trainingUnderstanding 实验内涵标签：反应分类、专家路由、优化轨迹、失败信号，并同步 LoRA 任务提示和训练导出 contract。保持 Chemd 作者语法不变；验证通过 exporter-training typecheck/test/eslint、git diff --check、pnpm typecheck、pnpm test。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `cf81aad` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: 实验内涵训练投影阶段 2

**Date**: 2026-04-21
**Task**: 实验内涵训练投影阶段 2
**Package**: web
**Branch**: `develop`

### Summary

扩展 trainingUnderstanding 派生任务数据：新增 reaction classification 与 expert routing messages 样本，补充 SFT/eval/holdout 适用性元数据，增加人工 annotation/correction 回流类型，并归档任务。验证通过 exporter-training typecheck/test/eslint、git diff --check、pnpm typecheck、pnpm test。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `04996bb` | (see git log) |
| `7c8e9d7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: PostgreSQL storage backend

**Date**: 2026-04-22
**Task**: PostgreSQL storage backend
**Package**: web
**Branch**: `develop`

### Summary

Implemented PostgreSQL storage schema, runtime ingest/RAG APIs, migration scripts, real pgvector smoke validation, and storage spec updates.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `627a596` | (see git log) |
| `fd0d0fa` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: PostgreSQL embedding backfill

**Date**: 2026-04-22
**Task**: PostgreSQL embedding backfill
**Package**: web
**Branch**: `develop`

### Summary

Added RAG embedding backfill service and API route with bounded filters, skip/overwrite behavior, tests, and storage spec coverage.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `51725be` | (see git log) |
| `62189bd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 14: Postgres 训练记忆循环 MVP

**Date**: 2026-04-22
**Task**: Postgres 训练记忆循环 MVP
**Package**: web
**Branch**: `develop`

### Summary

实现 Postgres training memory loop MVP，并补齐 support_count 重算、stale cleanup、索引、测试和文档。

### Main Changes

| 项目 | 内容 |
| --- | --- |
| Memory Loop | 新增从 persisted revisions 派生 semantic diff、training events、correction patterns、Experiment Pattern Memory 和 dataset projection 的 MVP。 |
| Postgres Runtime | 新增 `POST /api/chem/postgres/memory/loop`，读取 latest success/warning compile artifact 并写入 memory records。 |
| Support Recompute | 从 `chemd_training_experience_events` 全量重算 aggregate correction pattern 的 `support_count`，并清理 stale rows。 |
| Quality | 补充聚合索引、stale cleanup、upsert 派生字段更新、回归测试和 README。 |

**验证**:
- `pnpm --filter @chemd/web exec eslint ...`
- `pnpm --filter @chemd/web test -- postgres-training-memory-storage.spec.ts postgres-correction-pattern-aggregation.spec.ts postgres-memory-loop-service.spec.ts`
- `pnpm --filter @chemd/storage-postgres test`
- `pnpm --filter @chemd/web typecheck`
- `pnpm --filter @chemd/storage-postgres typecheck`
- `pnpm typecheck`
- `pnpm test`
- `git diff --check`


### Git Commits

| Hash | Message |
|------|---------|
| `1c31bac` | (see git log) |

### Testing

- [OK] ESLint, targeted tests, package typecheck, root typecheck,
  root test, and `git diff --check` passed.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 15: 完善实验逻辑训练导出

**Date**: 2026-04-23
**Task**: 完善实验逻辑训练导出
**Package**: web
**Branch**: `develop`

### Summary

补齐 artifact、sample lineage、训练理解投影和存储映射，并完成全量验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `9fa181f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

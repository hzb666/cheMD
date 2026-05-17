<p align="center">
  <img src="vision/logo-01.png" alt="chemd logo" width="520" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white" alt="pnpm 10" />
  <img src="https://img.shields.io/badge/Flask-3.1-111111?logo=flask&logoColor=white" alt="Flask 3.1" />
  <img src="https://img.shields.io/badge/RDKit-2025.9-0B7285" alt="RDKit" />
</p>

# chemd

[简体中文](./README.zh-CN.md) | [English](./README.md)

`chemd` 将化学实验记录转成接近代码的、可由编译器检查的文档，同时保留研究人员可读的叙述，并为 LLM 系统提供结构化输入。它从实验记录中抽取实体、引用、步骤逻辑、观察、证据关系和知识图谱边，用于检索、训练和下游推理。系统由类型化化学文档语言、TypeScript 编译流水线、Next.js playground 和本地 Flask/RDKit chemistry service 组成。

## 产品范围

- 接近代码的 Chemd 专用文档写作模型，覆盖 frontmatter、Markdown 风格正文、行内化学、引用、分子、反应、结果、分析、样品、步骤、观察、模板和列布局。
- 实验逻辑增强：将原始记录连接到 typed entities、resolved references、procedure steps、observations、field evidence、normalization facts 和 knowledge-graph edges。
- 浏览器工作台，支持源码编辑、渲染预览、diagnostics、结构化输出、导出动作、OCR 入口和 chemistry editor 集成。
- 编译输出覆盖 HTML 预览、规范化 JSON、DOCX bridge Markdown、canonical LNF、runtime preflight、RAG 检索数据、training understanding 数据和 full audit 数据。
- repo 级 graph index 与 reaction clustering：从现有实验事实推断路线、步骤复用、条件签名、campaign trajectory 和语义 reaction-similarity edges。
- 面向 LLM 的导出边界：检索数据与训练理解数据分离，审计用 source detail 不进入模型训练输入。
- 本地 chemistry API，负责 molecule/reaction 规范化、渲染、OCR provider 适配和结构草稿存储。
- Playground 部署资产支持 web service 与内部 chemistry service 的组合运行。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Workspace | pnpm workspace、Turborepo |
| Web | Next.js 15、React 19、Tailwind CSS 4 |
| 语言包 | TypeScript 5.9 |
| 化学编辑 | Ketcher React、Ketcher standalone |
| Chemistry service | Python 3.14、Flask 3.1、RDKit 2025.9 |
| 验证 | Vitest、TypeScript checks、ESLint、Ruff、Python unittest |
| 文档转换 | Pandoc 生成最终 DOCX 文件 |

## 仓库布局

```text
chemd/
|-- apps/
|   `-- web/                 # Playground UI、route handlers、server facade
|-- deploy/
|   `-- playground/          # Container、reverse proxy 与 service assets
|-- packages/
|   |-- cli/                 # CLI validation、repair、diff 与 agent-loop tools
|   |-- compiler/            # 公开 compile pipeline
|   |-- core/                # AST、diagnostics、共享原语
|   |-- diagnostics/         # Diagnostic model 与 quick-fix metadata
|   |-- exporter-training/   # RAG、training understanding、audit exports
|   |-- lnf/                 # Canonical LNF builder
|   |-- parser/              # Frontmatter、blocks、inline tokens、references
|   |-- render-profile/      # Render profiles 与 override validation
|   |-- renderer-docx/       # DOCX bridge renderer
|   |-- renderer-html/       # HTML preview renderer
|   |-- renderer-json/       # JSON renderer
|   |-- resolver/            # Reference resolution 与 template expansion
|   |-- runtime-lab/         # Runtime plan 与 preflight model
|   |-- runtime-trace/       # Runtime trace events 与 replay helpers
|   |-- step-ontology/       # Procedure、observation、analysis lowering
|   |-- storage-postgres/    # PostgreSQL schema、records、RAG 与 memory tables
|   `-- typechecker/         # Typed semantic graph 与 value diagnostics
|-- scripts/                 # 本地开发与迁移工具
|-- services/
|   `-- chem-service/        # Flask/RDKit chemistry API
`-- vision/                  # 视觉资产
```

## 本地开发

前置要求：

- Node.js 20 或更新版本。
- pnpm 10.x。
- Python `>=3.14,<3.15`。
- Chemistry service 使用 Poetry 管理依赖。
- 生成最终 DOCX 文件需要 Pandoc。
- 容器化部署 playground 需要 Docker。

安装依赖：

```bash
pnpm install

cd services/chem-service
poetry install
```

启动完整本地栈：

```bash
pnpm dev
```

默认本地端点：

| 服务 | URL |
| --- | --- |
| Web playground | `http://127.0.0.1:2436` |
| Chemistry service | `http://127.0.0.1:18081` |

单独启动服务：

```bash
pnpm dev:web
```

```bash
cd services/chem-service
poetry run python app.py
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装 workspace 依赖 |
| `pnpm dev` | 启动 web playground 与 chemistry service |
| `pnpm dev:web` | 只启动 web playground |
| `pnpm build` | 构建 workspace |
| `pnpm lint` | 运行 ESLint |
| `pnpm lint:fix` | 运行 ESLint 自动修复 |
| `pnpm typecheck` | 运行 TypeScript checks |
| `pnpm test` | 运行验证套件 |
| `pnpm lint:py` | 对 chemistry service 运行 Ruff |
| `pnpm format:check:py` | 检查 Python 格式 |

包级命令示例：

```bash
pnpm --filter @chemd/web test
pnpm --filter @chemd/compiler typecheck
pnpm --filter @chemd/exporter-training test
```

Chemistry service 验证：

```bash
cd services/chem-service
poetry run python -m unittest discover
```

## CLI 工作流

根目录通过 `chemd` script 调用 CLI：

```bash
pnpm chemd validate examples/report.chemd
pnpm chemd export examples/report.chemd --format training-full
pnpm chemd diff before.chemd after.chemd --format json
pnpm chemd graph reports/*.chemd --format json
pnpm chemd repair draft.chemd --format text
pnpm chemd agent-loop draft.chemd --format json --max-iterations 3
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `validate <file...>` | 编译文档并输出 diagnostics |
| `export <file> --format json\|lnf\|rag\|training\|training-full` | 输出结构化 compiler/exporter payload |
| `graph <file...> [--format text\|json]` | 从 compiled understandings 构建 repo 级 graph index 与 reaction clusters |
| `diff <old-file> <new-file> [--format text\|json]` | 比较两份记录的语义变化 |
| `changed [--base <ref>] [--format text\|json]` | 基于 git status/diff context 验证变更文件 |
| `repair <file> [--write]` | 应用 compiler-guided safe fixes |
| `agent-loop <file> [--write]` | 对 LLM 生成的 Chemd 执行迭代诊断与修复 |

`graph` 命令不要求作者手写 graph 专用语法。它会先编译一组实验报告，再推断 document nodes、entity/relation edges、route clusters、family/procedure clusters、condition clusters、campaign trajectories 和语义 reaction-similarity edges。没有 computed chemical fingerprint 时，输出会明确标注，而不会把语义相似性伪装成 RDKit/Tanimoto similarity。

## 文档语言

`chemd` 文档是带必需 frontmatter 的 Chemd 专用源码文件：

- `id`
- `title`
- `date`

支持的 metadata 包括 render profile、render overrides、tags，以及 reaction、result、product、sample、molecule、analysis 的 primary alias。

行内语法：

| 语法 | 含义 |
| --- | --- |
| `:chem[H2O]` | 行内化学 token |
| `` `inline code` `` | 行内代码 token |
| `[label](https://example.com)` | 带 safety metadata 的 Markdown link token |
| `@rxn-main` | Entity reference |
| `@res-main.yield` | Entity field reference |
| `@meta.title` | Metadata reference |
| `@result.yield` | Primary alias field reference |
| `@param.amount` | Template parameter reference |

结构化块：

| Block | 作用 |
| --- | --- |
| `:::chemd` | Molecule 或 reaction block；`kind` 可显式写出，也可由稳定反应字段推断 |
| `:::result` | Outcome status、yield、conversion、selectivity、purity、notes |
| `:::analysis` | Analysis records 和 TLC-style lane data |
| `:::sample` | Sample metadata 与 lineage references |
| `:::procedure` | Procedure text 或 explicit steps |
| `:::observation` | Observation text 或 explicit events |
| `:::template` | 可复用文档模板 |
| `:::use` | 模板调用 |
| `:::col-N` | 列布局块 |

示例：

```md
---
id: exp-demo
title: Ethanol oxidation
date: 2026-04-17
render_profile: publication-acs
primary_reaction: rxn-main
primary_result: res-main
tags:
  - demo
  - oxidation
---

:::chemd #rxn-main
kind: reaction
reactants: CCO | O=O
products: CC(=O)O
conditions: THF | -78 C | 30 min | nitrogen
:::

:::procedure #proc-main
step: cool | id=cool-main | target_temperature=-78 C
step: add | id=add-oxidant | dependsOn=cool-main
:::

:::analysis #ana-tlc
type: tlc
ref: rxn-main
result: partial_conversion
data: TLC shows starting material remains
:::

:::result #res-main
ref: rxn-main
status: partial
yield: 23%
purity: 91%
:::

Yield: @res-main.yield
```

更完整的写作规范与 companion fixture 示例见：

- `docs/chemd-syntax-best-practices.zh-CN.md`
- `packages/compiler/fixtures/best-practice-total-synthesis.chemd`
- `packages/compiler/fixtures/best-practice-one-step-synthesis.chemd`
- `packages/compiler/fixtures/best-practice-condition-screen.chemd`

## 编译流水线

`@chemd/compiler` 暴露 `compileChemd(source, options)`。

```text
source markdown
  -> parseChemd()
  -> resolveChemd()
  -> typecheckDocument()
  -> resolveRenderProfileWithDiagnostics()
  -> buildRunPlan()
  -> preflightRun()
  -> buildCanonicalLnf()
  -> exportTrainingRecordFromDocument()
  -> buildRagExportFromTrainingRecord()
  -> buildTrainingUnderstandingFromRecord()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

编译输出包含 diagnostics、resolved document、typed semantic graph、lowered step graph、runtime plan、preflight results、LNF、HTML、JSON、DOCX bridge Markdown、RAG export、training understanding export 和 full audit export。

数据导出职责：

| Export | 用途 |
| --- | --- |
| RAG export | 检索索引与搜索上下文 |
| Training understanding export | LoRA/SFT 数据集生成与实验知识建模 |
| Graph index export | repo/campaign graph indexing、reaction clustering 与 similarity traversal |
| Full audit export | 检查、调试与可追溯性 |

Graph index 是推断式导出。作者只需要写真实实验事实，例如 `reactants`、`products`、`result.ref`、`analysis.ref`、`sample.derived_from`、`route`、`prev` 和 `condition-varies`。导出层会从这些事实生成图索引和聚类视图，而不是要求报告里新增一套 graph 语言。
repo 级 graph index 会在一个或多个文档编译成 training understanding 后，通过 `buildTrainingGraphIndexFromUnderstandings()` 生成。

## Web Playground

Playground 提供：

- source editor 与 rendered document preview
- diagnostics 与 structured compiler output tabs
- render profile selection
- JSON 与 DOCX export actions
- molecule 与 reaction editing
- OCR import flows
- session-scoped draft writes

结构化输出 tabs 包括 semantic output、runtime output、LNF、RAG export、training understanding export 和 full audit export。

## Desktop IDE 规划

生产版 Chemd Desktop IDE 规划以 Tauri 2、React、Monaco、PostgreSQL/pgvector 和受控 `chem-service` sidecar 为核心。桌面版不是 Web playground 的简单封装，而是本地 workspace、语言服务、反应 Graph、RAG 和 Agent 编排的生产级工作台。

相关架构文档：

- `docs/desktop-ide-production-plan.zh-CN.md`
- `docs/desktop-runtime-boundaries.zh-CN.md`
- `docs/desktop-language-service-contract.zh-CN.md`
- `docs/postgres-graph-rag-schema.zh-CN.md`
- `docs/agent-tool-contract.zh-CN.md`
- `docs/desktop-ui-style-guide.zh-CN.md`

## API Surface

Next.js routes：

| Route | Method | 作用 |
| --- | --- | --- |
| `/api/export/json` | `POST` | 编译 source 并返回 normalized JSON |
| `/api/export/docx` | `POST` | 编译 source 并返回 DOCX 文件 |
| `/api/chem/draft` | `GET` | 读取已保存的 structure draft |
| `/api/chem/inventory` | `POST` | 通过已配置服务解析 inventory data |
| `/api/chem/normalize` | `POST` | 规范化 molecule notation |
| `/api/chem/render` | `POST` | 渲染 molecule 或 reaction notation |
| `/api/chem/save` | `POST` | 保存 molecule 或 reaction notation |
| `/api/chem/ocr` | `POST` | 执行 molecule-oriented OCR workflow |
| `/api/chem/reaction/ocr` | `POST` | 执行 reaction OCR workflow |
| `/api/chem/postgres/memory/loop` | `POST` | 从已持久化 revision 派生 semantic diff、training events、pattern memory、dataset projection 和 correction-pattern support |
| `/api/chem/postgres/training/export` | `POST` | 从已持久化 PostgreSQL records 导出有界 training artifacts 和可选 pattern memory |

Chemistry service routes：

| Route | Method | 作用 |
| --- | --- | --- |
| `/healthz` | `GET` | Health 与 provider readiness |
| `/ocr` | `POST` | Molecule OCR provider adapter |
| `/normalize` | `POST` | Molecule normalization |
| `/render` | `POST` | Molecule rendering |
| `/reaction/ocr` | `POST` | Reaction OCR provider adapter |
| `/reaction/render` | `POST` | Reaction rendering |
| `/structure` | `GET`, `POST` | Structure draft lookup 与 storage |

## 包职责

| Package | 职责 |
| --- | --- |
| `@chemd/cli` | CLI validation、graph export、repair loop、semantic diff 与 agent-loop integration |
| `@chemd/core` | 共享 AST、diagnostics、render overrides、chemistry primitives |
| `@chemd/parser` | Frontmatter、Markdown、inline token、block、reference parsing |
| `@chemd/resolver` | References、aliases、template expansion、semantic cleanup |
| `@chemd/diagnostics` | Diagnostic model、bands、quick-fix metadata |
| `@chemd/typechecker` | Typed semantic graph 与 value diagnostics |
| `@chemd/step-ontology` | Procedure、observation、analysis lowering |
| `@chemd/runtime-lab` | Runtime plans 与 preflight checks |
| `@chemd/runtime-trace` | Runtime trace events 与 replay helpers |
| `@chemd/lnf` | Canonical LNF payloads |
| `@chemd/render-profile` | Built-in render profiles 与 override validation |
| `@chemd/renderer-html` | HTML preview rendering |
| `@chemd/renderer-json` | JSON rendering |
| `@chemd/renderer-docx` | DOCX bridge rendering |
| `@chemd/exporter-training` | Retrieval、training understanding、graph index、clustering、audit exports |
| `@chemd/storage-postgres` | PostgreSQL schema、storage records、RAG chunks 与 training memory records |
| `@chemd/compiler` | 公开 compile pipeline |
| `@chemd/web` | Playground UI 与 server-side routes |

## 配置

环境变量可由 shell、进程管理器或部署平台提供。

Web app 变量：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `CHEM_SERVICE_BASE_URL` | `http://127.0.0.1:18081` | 服务端调用 chemistry service |
| `CHEM_SERVICE_ACCESS_KEY` | 未设置 | 可选共享内部访问密钥 |
| `PUBCHEM_PUG_REST_BASE_URL` | 代码默认值 | PubChem metadata lookup |
| `PUBCHEM_PUG_REST_TIMEOUT_MS` | 代码默认值 | PubChem request timeout |
| `PANDOC_PATH` | `pandoc` | DOCX export binary path |
| `LAB_STORAGE_BASE_URL` | 已配置 API base URL | Lab inventory API |
| `LAB_STORAGE_USERNAME` | 未设置 | Lab inventory login |
| `LAB_STORAGE_PASSWORD` | 未设置 | Lab inventory login |
| `LAB_STORAGE_DEVICE_ID` | 代码默认值 | Lab inventory device id |
| `LAB_STORAGE_DEVICE_NAME` | 代码默认值 | Lab inventory device name |

Chemistry service 变量：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `CHEM_SERVICE_HOST` | `127.0.0.1` | Flask bind host |
| `CHEM_SERVICE_PORT` | `18081` | Flask bind port |
| `CHEM_SERVICE_ALLOW_ORIGINS` | local origins | CORS allowlist |
| `CHEM_SERVICE_ACCESS_KEY` | 未设置 | 可选共享内部访问密钥 |
| `CHEM_SERVICE_INTERNAL_ONLY` | 代码默认值 | Internal request protection |
| `CHEM_SERVICE_MAX_CONTENT_LENGTH` | 代码默认值 | Request body limit |
| `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH` | 代码默认值 | OCR image payload limit |
| `CHEM_SERVICE_CACHE_MAX_ENTRIES` | `256` | Structure cache capacity |
| `CHEM_SERVICE_MOLECULE_OCR_PROVIDER` | `placeholder` | Molecule OCR provider |
| `CHEM_SERVICE_REACTION_OCR_PROVIDER` | `placeholder` | Reaction OCR provider |
| `CHEM_SERVICE_DECIMER_API_URL` | 未设置 | DECIMER endpoint |
| `CHEM_SERVICE_DECIMER_API_KEY` | 未设置 | DECIMER key |
| `CHEM_SERVICE_MOLSCRIBE_API_URL` | 未设置 | MolScribe endpoint |
| `CHEM_SERVICE_MOLSCRIBE_API_KEY` | 未设置 | MolScribe key |
| `CHEM_SERVICE_MOLNEXTR_API_URL` | 未设置 | MolNexTR endpoint |
| `CHEM_SERVICE_MOLNEXTR_API_KEY` | 未设置 | MolNexTR key |
| `CHEM_SERVICE_RXNSCRIBE_API_URL` | 未设置 | RxnScribe endpoint |
| `CHEM_SERVICE_RXNSCRIBE_API_KEY` | 未设置 | RxnScribe key |
| `CHEM_SERVICE_RXNIM_API_URL` | 未设置 | RXNIM endpoint |
| `CHEM_SERVICE_RXNIM_API_KEY` | 未设置 | RXNIM key |
| `CHEM_SERVICE_RXNCAPTION_API_URL` | 未设置 | RXNCaption endpoint |
| `CHEM_SERVICE_RXNCAPTION_API_KEY` | 未设置 | RXNCaption key |

## 部署

Playground 部署资产支持 web service、chemistry service 和 reverse-proxy exposure。

Compose 部署：

```bash
cd deploy/playground
docker compose up -d --build
```

Web service 是公网边界。Chemistry service 应位于 web app 后方或可信内部网络中。Public domain routing 与 TLS termination 由 web service 前方的 reverse proxy 处理。

## 运行说明

- RDKit 渲染要求 Python runtime 能成功 import RDKit。
- OCR 默认使用 placeholder providers；生产 OCR 需要配置 provider URLs 与 keys。
- DOCX 文件生成依赖 Pandoc。没有 Pandoc 时 compiler 仍可生成 DOCX bridge Markdown。
- Lab inventory lookup 需要凭证，并且运行环境需要能访问配置的 API。
- Structure drafts 由 chemistry service 存储，用于当前 playground flow。

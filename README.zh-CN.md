# chemd

<p align="center">
  <img src="vision/logo-01.png" alt="chemd logo" width="520" />
</p>

[简体中文](./README.zh-CN.md) | [English](./README.md)

`chemd` 是 program-first 的化学实验记录语言。`.chemd` 文件可用于记录实验、比较差异、审计智能体修改，并导出到多个下游格式。

## 核心

- 声明模型：module、metadata、molecule、reaction、result、procedure、observation、trace 和 agent audit block。
- 语义校验：从源码检查引用、类型化取值、步骤证据和导出就绪状态。
- 实验差分：按反应事实、条件、结果状态、收率和步骤变化比较不同实验尝试。
- 智能体审计：记录修复或写作任务的目标、工具调用、patch 提案、决策、时间线和证据。
- 多格式导出：一份 `.chemd` 源码可导出 JSON、canonical LNF、RAG data、training understanding data 和 full audit export。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Workspace | pnpm workspace、Turborepo |
| Web | Next.js 16、React 19.2、Tailwind CSS 4.3 |
| Desktop | Tauri 2、Vite 8、React 19.2、Monaco Editor |
| Native runtime | Rust、Tauri commands、managed PostgreSQL resources |
| 语言包 | TypeScript 6.0 |
| 化学编辑 | Ketcher React、Ketcher standalone |
| Chemistry service | Python 3.14、Flask 3.1、RDKit 2026.3 |
| 持久化与知识库 | PostgreSQL、面向 pgvector 的 Graph/RAG records、local outbox |
| 验证 | Vitest 4.1、TypeScript checks、ESLint 10.4、Ruff 0.15、Python unittest |
| 文档转换 | Pandoc 生成最终 DOCX 文件 |

## 仓库布局

```text
chemd/
|-- apps/
|   |-- desktop/            # Tauri Desktop IDE、Monaco workbench、native commands
|   `-- web/                 # Playground UI、route handlers、server facade
|-- deploy/
|   `-- playground/          # Container、reverse proxy 与 service assets
|-- examples/
|   `-- basic/               # 小型 .chemd 样例与对应输出
|-- packages/
|   |-- cli/                 # CLI validation、repair、diff 与 agent-loop tools
|   |-- compiler/            # 公开 compile pipeline
|   |-- core/                # AST、diagnostics、共享原语
|   |-- diagnostics/         # Diagnostic model 与 quick-fix metadata
|   |-- exporter-training/   # RAG、training understanding、audit exports
|   |-- agent-tools/         # Agent run、evidence、patch 与 audit primitives
|   |-- language-service/    # Editor diagnostics、outline、completion、hover、Graph/RAG DTOs
|   |-- lnf/                 # Canonical LNF builder
|   |-- parser/              # Program grammar、doc comments、values、references
|   |-- reaction-map/        # Reaction graph layout 与 intelligence contracts
|   |-- render-profile/      # Render profiles 与 override validation
|   |-- renderer-docx/       # DOCX bridge renderer
|   |-- renderer-html/       # HTML preview renderer
|   |-- renderer-json/       # JSON renderer
|   |-- resolver/            # Program symbol tables 与 reference resolution
|   |-- runtime-lab/         # Runtime plan 与 preflight model
|   |-- runtime-trace/       # Runtime trace events 与 replay helpers
|   |-- step-ontology/       # Procedure、observation、analysis lowering
|   |-- storage-postgres/    # PostgreSQL schema、records、RAG 与 memory tables
|   |-- semantic-rendering/  # Semantic preview view models
|   |-- workspace-index/     # Cross-document symbols 与 reference queries
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

启动 Desktop IDE 前端：

```bash
pnpm --filter @chemd/desktop dev
```

启动 Tauri 桌面应用：

```bash
pnpm --filter @chemd/desktop tauri:dev
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
| `pnpm desktop:diagnostics-bundle` | 导出离线 desktop diagnostics bundle |
| `pnpm desktop:offline-core-smoke` | 运行 desktop offline core smoke 脚本 |
| `pnpm desktop:release-readiness` | 运行 desktop release-readiness 分类检查 |
| `pnpm --filter @chemd/desktop tauri:dev` | 启动 Tauri 桌面应用 |
| `pnpm --filter @chemd/desktop tauri:build` | 构建桌面发布产物 |

包级命令示例：

```bash
pnpm --filter @chemd/web test
pnpm --filter @chemd/desktop test
pnpm --filter @chemd/compiler typecheck
pnpm --filter @chemd/exporter-training test
```

Chemistry service 验证：

```bash
cd services/chem-service
poetry run python -m unittest discover
```

## 示例

小型 source-first 示例放在 [`examples/basic`](./examples/basic/)：

- `experiment-before.chemd` 和 `experiment-after.chemd` 展示语义实验差分，并附带已校验的文本输出。
- `agent-audit.chemd` 展示智能体审计块，把工具调用、patch 决策、时间线和证据保留在源码中。

```bash
pnpm chemd validate examples/basic/experiment-before.chemd examples/basic/experiment-after.chemd
pnpm chemd diff examples/basic/experiment-before.chemd examples/basic/experiment-after.chemd
pnpm chemd validate examples/basic/agent-audit.chemd
```

## CLI 工作流

根目录通过 `chemd` script 调用 CLI：

```bash
pnpm chemd validate file.chemd
pnpm chemd export file.chemd --format training-full
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

Chemd program-v1 是 program-first 语言。一个 `.chemd` 文件就是一个
module，declaration 是唯一语义事实来源。Markdown 只通过显式
documentation comments 和 `/*md */` 区域进入编译器；它可以渲染和检索，
但不创建实验事实。

Compiler 只从 program declarations 建立实验事实；Markdown 文档只通过
documentation comments 和 `/*md */` 区域进入渲染与检索链路。

Program 语法：

| 语法 | 含义 |
| --- | --- |
| `module exp_demo` | 文件级 module scope |
| `meta { ... }` | 必需 metadata declaration |
| `import shared as s from "./shared.chemd"` | 外部 program symbols |
| `molecule mol_a { ... }` | 语义 molecule declaration |
| `reaction rxn_main { ... }` | 语义 reaction declaration |
| `result res_main for @rxn_main { ... }` | 绑定到 reaction 的 result |
| `procedure proc_main for @rxn_main { ... }` | declaration-native procedure steps |
| `agent run repair_001 { ... }` | source-level agent audit record |
| `/// ...` 和 `/*md ... */` | Markdown documentation comments |

示例：

```chemd
module exp_demo

meta {
  id: "exp-demo"
  title: "Ethanol oxidation"
  date: 2026-04-17
  primary_reaction: @rxn_main
  primary_result: @res_main
}

/*md
# Ethanol oxidation

This section is documentation. It can be rendered and retrieved, but it does
not create molecule, reaction, result, procedure, or agent facts.
*/

molecule mol_ethanol {
  name: "ethanol"
  smiles: "CCO"
  role: substrate
}

reaction rxn_main {
  reactants: [@mol_ethanol]
  products: ["CC(=O)O"]
  solvent: "THF"
  temperature: -78 C
  atmosphere: nitrogen
}

result res_main for @rxn_main {
  status: success
  yield: 72%
}

procedure proc_main for @rxn_main {
  step charge = charge(inputs: [@mol_ethanol], purpose: "assemble reaction")
  step cool = cool(temperature: -78 C, depends_on: [charge])
}
```

Program-first contracts：

- `/zh/docs/program-v1/language`
- `/zh/docs/program-v1/ast`
- `/zh/docs/program-v1/exports`

## 常用使用流程

创建或打开 Chemd 记录后，可以先运行校验：

```bash
pnpm chemd validate file.chemd
```

导出应用与模型流水线需要的数据：

```bash
pnpm chemd export file.chemd --format json
pnpm chemd export file.chemd --format rag
pnpm chemd export file.chemd --format training
```

查看 workspace 级 reaction graph：

```bash
pnpm chemd graph packages/compiler/fixtures/*.chemd --format json
```

对生成稿执行 compiler-guided repair：

```bash
pnpm chemd repair draft.chemd --write
pnpm chemd agent-loop draft.chemd --write --max-iterations 3
```

## 编译流水线

`@chemd/compiler` 暴露 `compileChemd(source, options)`。

```text
source program
  -> parseChemdProgram()
  -> resolveProgram()
  -> typecheckProgram()
  -> resolveRenderProfileWithDiagnostics()
  -> buildRunPlan()
  -> preflightRun()
  -> buildCanonicalLnf()
  -> exportTrainingRecordFromProgram()
  -> buildRagExportFromTrainingRecord()
  -> buildTrainingUnderstandingFromRecord()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

编译输出包含 diagnostics、resolved program、typed semantic graph、lowered step graph、runtime plan、preflight results、LNF、HTML、JSON、DOCX bridge Markdown、RAG export、training understanding export 和 full audit export。

数据导出职责：

| Export | 用途 |
| --- | --- |
| RAG export | 检索索引与搜索上下文 |
| Training understanding export | LoRA/SFT 数据集生成与实验知识建模 |
| Graph index export | repo/campaign graph indexing、reaction clustering 与 similarity traversal |
| Full audit export | 检查、调试与可追溯性 |

Graph index 是推断式导出。作者只需要在 declarations 中写真实实验事实，例如 `reactants`、`products`、result target、analysis target、sample lineage、route edges 和 condition screens。导出层会从这些事实生成图索引和聚类视图，报告本身保持实验事实写作。
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

典型浏览器使用流程：

1. 运行 `pnpm dev`。
2. 打开 `http://127.0.0.1:2436`。
3. 编辑 Chemd source，或通过 OCR / chemistry editor 入口导入结构。
4. 查看 diagnostics 和 rendered preview。
5. 导出 JSON、DOCX、RAG、training understanding 或 audit payload。

## Desktop IDE

Chemd Desktop IDE 是面向本地 workspace 的日常写作产品。它基于 Tauri、React 和 Monaco，结合 Rust-backed workspace commands 提供本地文件、知识索引和 Agent review 能力。

Desktop 功能：

- 打开本地文件夹，浏览 Chemd 文档和关联 assets。
- 在 Monaco 中编辑 `.chemd` program files，获得来自 `@chemd/language-service` 的 diagnostics、outline、hover、completion、source ranges 和 quick-fix proposals。
- 使用文件标签、breadcrumbs、状态栏、自动保存、`Ctrl+S` / `Cmd+S` 和带冲突保护的保存流程。
- 编辑时查看编译后的文档预览和 semantic tree。
- 构建本地 workspace index，用于 symbols、references、document candidates 和 RAG citation candidates。
- 将 workspace 绑定到 PostgreSQL profile，使用 managed PostgreSQL resources，持久化 Graph/RAG runtime snapshots，查询 connected RAG data，并在配置 provider 后回填 embeddings。
- 运行 reaction intelligence jobs，查看 reaction graph layout、clusters、evidence rows 和 source-jump links。
- 审阅 Agent patch proposals，查看 evidence 和 audit timeline，执行 approve / reject / apply。
- 导出离线 diagnostics bundle，用于支持和发布检查。

Desktop 开发命令：

```bash
pnpm --filter @chemd/desktop dev
pnpm --filter @chemd/desktop tauri:dev
pnpm --filter @chemd/desktop test
pnpm --filter @chemd/desktop typecheck
pnpm desktop:diagnostics-bundle
```

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
| `@chemd/agent-tools` | Agent runs、cited evidence、patch decisions 与 audit timelines |
| `@chemd/core` | 共享 AST、diagnostics、render overrides、chemistry primitives |
| `@chemd/parser` | Program grammar、doc comments、values、references |
| `@chemd/resolver` | Program symbol tables、imports、references、semantic cleanup |
| `@chemd/diagnostics` | Diagnostic model、bands、quick-fix metadata |
| `@chemd/typechecker` | Typed semantic graph 与 value diagnostics |
| `@chemd/step-ontology` | Procedure、observation、analysis lowering |
| `@chemd/runtime-lab` | Runtime plans 与 preflight checks |
| `@chemd/runtime-trace` | Runtime trace events 与 replay helpers |
| `@chemd/lnf` | Canonical LNF payloads |
| `@chemd/language-service` | Editor diagnostics、outline、symbols、completions、hover、quick fixes、Graph/RAG DTOs |
| `@chemd/reaction-map` | Reaction map layout、cluster model 与 reaction intelligence contracts |
| `@chemd/render-profile` | Built-in render profiles 与 override validation |
| `@chemd/renderer-html` | HTML preview rendering |
| `@chemd/renderer-json` | JSON rendering |
| `@chemd/renderer-docx` | DOCX bridge rendering |
| `@chemd/exporter-training` | Retrieval、training understanding、graph index、clustering、audit exports |
| `@chemd/storage-postgres` | PostgreSQL schema、storage records、RAG chunks 与 training memory records |
| `@chemd/semantic-rendering` | 面向 editor products 的 semantic preview view models |
| `@chemd/workspace-index` | Cross-document symbol indexing、references 与 workspace query helpers |
| `@chemd/compiler` | 公开 compile pipeline |
| `@chemd/web` | Playground UI 与 server-side routes |
| `@chemd/desktop` | Tauri Desktop IDE 与 native workspace runtime |

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

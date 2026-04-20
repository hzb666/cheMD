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

`chemd` 是以 Markdown 为源文档的化学文档工作台。它提供结构化实验记录语言、TypeScript 编译流水线、Next.js playground，以及本地 Flask/RDKit chemistry service，用于渲染、规范化、OCR 接入、导出、运行前检查和面向模型的实验数据生成。

## 能力范围

- 结构化化学 Markdown，覆盖 frontmatter、行内化学 token、引用、分子、反应、结果、分析、样品、步骤、观察、模板和列布局。
- 基于 Next.js playground 的浏览器编辑与预览。
- 从 parser、resolver、typechecker、runtime planner、LNF builder、renderer 到 training exporter 的语义编译链。
- HTML 预览、规范化 JSON 导出、DOCX bridge 输出，以及 Pandoc 可用时的服务端 DOCX 生成。
- 基于 Ketcher 的 molecule 与 reaction 编辑流程。
- 可配置 provider 的 molecule 与 reaction OCR 入口。
- 本地 chemistry service，负责规范化、渲染、OCR provider 适配和结构草稿存储。
- 拆分后的检索数据、训练理解数据和完整审计数据导出。

## 技术栈

| 范围 | 实现 |
| --- | --- |
| Workspace | pnpm workspace 与 Turborepo |
| Web | Next.js 15、React 19、Tailwind CSS 4 |
| 语言 | TypeScript 5.9 |
| 化学 UI | Ketcher React 与 standalone packages |
| Chemistry service | Python 3.14、Flask 3.1、RDKit 2025.9 |
| 验证 | Vitest、TypeScript checks、ESLint、Ruff、Python unittest |
| 文档导出 | Pandoc 生成最终 DOCX 文件 |

## 仓库结构

```text
chemd/
|-- apps/
|   `-- web/                 # Playground UI、API routes 与 server facade
|-- deploy/
|   `-- playground/          # Compose、Dockerfile、nginx 与 systemd 资产
|-- packages/
|   |-- compiler/            # 公开 compile/export/render 编排
|   |-- core/                # AST、diagnostics 与共享原语
|   |-- diagnostics/         # Diagnostic model 与 quick-fix metadata
|   |-- exporter-training/   # RAG、training understanding 与 audit exports
|   |-- lnf/                 # Canonical LNF builder
|   |-- parser/              # Frontmatter、block、inline 与 reference parsing
|   |-- render-profile/      # Render profiles 与 override validation
|   |-- renderer-docx/       # DOCX bridge renderer
|   |-- renderer-html/       # HTML renderer
|   |-- renderer-json/       # JSON renderer
|   |-- resolver/            # Reference resolution 与 template expansion
|   |-- runtime-lab/         # Runtime plan 与 preflight model
|   |-- runtime-trace/       # Runtime trace events 与 replay helpers
|   |-- step-ontology/       # Procedure、observation 与 analysis lowering
|   `-- typechecker/         # Typed semantic graph 与 value diagnostics
|-- scripts/
|   `-- dev-demo.mjs         # 本地启动 web 与 chemistry service
|-- services/
|   `-- chem-service/        # Flask/RDKit chemistry API
`-- vision/                  # Logo 与视觉资产
```

## 本地开发

### 前置要求

- Node.js 20 或更新版本。
- pnpm 10.x。
- Python `>=3.14,<3.15`。
- Chemistry service 使用 Poetry 管理 Python 依赖。
- 最终 DOCX 文件生成需要 Pandoc。
- 容器化部署 playground 时需要 Docker。

### 安装依赖

```bash
pnpm install

cd services/chem-service
poetry install
```

### 启动完整 demo

在仓库根目录运行：

```bash
pnpm dev
```

该命令会启动 web app `http://127.0.0.1:2436` 和 chemistry service `http://127.0.0.1:18081`。

### 单独启动进程

```bash
pnpm dev:web
```

```bash
cd services/chem-service
poetry run python app.py
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装 workspace 依赖 |
| `pnpm dev` | 启动 web app 与 chemistry service |
| `pnpm dev:web` | 只启动 web playground |
| `pnpm build` | 通过 Turbo 构建全部 workspace packages |
| `pnpm lint` | 对 TypeScript 与 JavaScript 源码运行 ESLint |
| `pnpm lint:fix` | 运行 ESLint 自动修复 |
| `pnpm typecheck` | 运行 TypeScript checks |
| `pnpm test` | 运行完整验证套件 |
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

## 文档语言模型

`chemd` 文档是带必需 frontmatter 和结构化 fenced blocks 的 Markdown。必需 frontmatter 字段是 `id`、`title` 和 `date`。支持的 metadata 包括 render profile、render overrides、tags，以及 reaction、result、product、sample、molecule、analysis 的 primary alias。

行内语法：

| 语法 | 含义 |
| --- | --- |
| `:chem[H2O]` | 行内化学 token |
| `` `inline code` `` | 行内代码 token |
| `[label](https://example.com)` | 带安全 metadata 的 Markdown link token |
| `@rxn-main` | 实体引用 |
| `@res-main.yield` | 实体字段引用 |
| `@meta.title` | Metadata 引用 |
| `@result.yield` | Primary alias 字段引用 |
| `@param.amount` | 模板参数引用 |

结构化块：

| Block | 作用 |
| --- | --- |
| `:::chemd` | Molecule 或 reaction，新文档应设置 `kind` |
| `:::result` | Result status、yield、conversion、selectivity、purity 和 notes |
| `:::analysis` | Analysis 记录，包括 TLC lane data |
| `:::sample` | Sample metadata 和 lineage reference |
| `:::procedure` | Procedure text 或 explicit step blocks |
| `:::observation` | Observation text 或 explicit event blocks |
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
solvent: THF
temperature: -78 C
time: 30 min
atmosphere: nitrogen
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

编译结果包含 diagnostics、resolved document、typed semantic graph、lowered step graph、runtime plan、runtime preflight output、LNF、HTML、JSON、DOCX bridge Markdown、RAG export、training understanding export 和 full audit export。

Full audit export 用于检查。RAG indexing 使用 RAG export。LoRA/SFT 数据集生成使用 training understanding export。

## Web Playground

Playground 提供编辑器、实时预览、diagnostics、render profile 选择、theme switching、导出动作、OCR 入口和 chemistry editor 集成。

Preview tabs 包括：

- rendered document
- JSON
- diagnostics
- semantic output
- runtime output
- LNF
- RAG export
- training understanding export
- full audit export

会更新 chemistry draft 的写操作使用 cookie 与请求 header 中匹配的 session token。

## API Surface

Next.js routes：

| Route | Method | 作用 |
| --- | --- | --- |
| `/api/export/json` | `POST` | 编译 source 并返回规范化 JSON |
| `/api/export/docx` | `POST` | 编译 source 并返回 DOCX 文件 |
| `/api/chem/draft` | `GET` | 读取已保存的结构草稿 |
| `/api/chem/inventory` | `POST` | 通过已配置服务解析库存数据 |
| `/api/chem/normalize` | `POST` | 规范化 molecule notation |
| `/api/chem/render` | `POST` | 渲染 molecule 或 reaction notation |
| `/api/chem/save` | `POST` | 保存 molecule 或 reaction notation |
| `/api/chem/ocr` | `POST` | 执行 molecule-oriented OCR workflow |
| `/api/chem/reaction/ocr` | `POST` | 执行 reaction OCR workflow |

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
| `@chemd/core` | 共享 AST、diagnostics、render overrides 和 chemistry primitives |
| `@chemd/parser` | Frontmatter、Markdown、inline token、block 和 reference parsing |
| `@chemd/resolver` | References、aliases、template expansion 和 semantic cleanup |
| `@chemd/diagnostics` | Diagnostic model、bands 和 quick-fix metadata |
| `@chemd/typechecker` | Typed semantic graph 和 value diagnostics |
| `@chemd/step-ontology` | Procedure、observation 和 analysis lowering |
| `@chemd/runtime-lab` | Runtime plans 和 preflight checks |
| `@chemd/runtime-trace` | Runtime trace events 和 replay helpers |
| `@chemd/lnf` | Canonical LNF payloads |
| `@chemd/render-profile` | Built-in render profiles 和 override validation |
| `@chemd/renderer-html` | HTML preview rendering |
| `@chemd/renderer-json` | JSON rendering |
| `@chemd/renderer-docx` | DOCX bridge rendering |
| `@chemd/exporter-training` | Retrieval、training understanding 和 audit exports |
| `@chemd/compiler` | 公开 compile pipeline |
| `@chemd/web` | Playground UI 与 server-side routes |

## 配置

通过 shell、进程管理器或部署平台设置环境变量。

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

`deploy/playground` 下的 playground 部署资产支持 web container、chemistry-service container 和反向代理暴露方式。

Compose 部署：

```bash
cd deploy/playground
docker compose up -d --build
```

Web service 是公网边界。Chemistry service 应位于 web app 后方或可信内部网络中。公网域名和 TLS 由 web service 前方的反向代理处理。

## 运行说明

- RDKit 渲染要求 Python 环境能成功 import RDKit。
- OCR routes 默认使用 placeholder providers；生产 OCR 需要配置 provider URLs 和 keys。
- DOCX 文件生成依赖 Pandoc。没有 Pandoc 时 compiler 仍可生成 DOCX bridge Markdown。
- Lab inventory lookup 需要凭证，并且运行环境需要能访问配置的 API。
- Structure drafts 由 chemistry service 存储，用于当前 playground flow。

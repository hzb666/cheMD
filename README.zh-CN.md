<p align="center">
  <img src="vision/logo-01.png" alt="chemd logo" width="520" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Turborepo-2.x-EF4444?logo=turborepo&logoColor=white" alt="Turborepo" />
  <img src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white" alt="pnpm 10" />
  <img src="https://img.shields.io/badge/Flask-3.1-111111?logo=flask&logoColor=white" alt="Flask 3.1" />
  <img src="https://img.shields.io/badge/RDKit-2025.9-0B7285" alt="RDKit" />
  <img src="https://img.shields.io/badge/Vitest-3.2-6E9F18?logo=vitest&logoColor=white" alt="Vitest 3.2" />
</p>

# chemd

[简体中文](./README.zh-CN.md) | [English](./README.md)

`chemd` 是一个以 Markdown 源文档为中心的化学文档工作台和语言运行时。当前代码库由 Next.js playground、TypeScript 文档编译器，以及本地 Flask/RDKit chemistry service 组成，覆盖渲染、OCR 接缝、结构草稿、JSON 导出、DOCX 导出、语义类型检查、实验步骤 lowering、运行前检查和训练数据导出。

## 目录

- [当前可用能力](#当前可用能力)
- [技术栈](#技术栈)
- [仓库结构](#仓库结构)
- [本地启动](#本地启动)
- [开发命令](#开发命令)
- [语言表面](#语言表面)
- [编译流水线](#编译流水线)
- [Web 工作台](#web-工作台)
- [API 面](#api-面)
- [包职责](#包职责)
- [环境变量](#环境变量)
- [测试](#测试)
- [部署](#部署)
- [运行说明](#运行说明)

## 当前可用能力

- `apps/web` 中的 Next.js playground，提供左右分栏的 `Editor + Preview` 工作台。
- 浏览器内通过 `@chemd/compiler` 编译文档。
- 结构化 Markdown 解析：frontmatter、普通 markdown、行内化学表达式、引用、化学块、结果块、分析块、样品块、步骤块、观察块、模板块、模板调用块和列布局块。
- 语义流水线：解析引用、补默认对象 ID、类型检查数值、将 procedure lowering 成 step graph、构建 runtime plan、执行 runtime preflight、生成 LNF payload，并生成训练导出 payload。
- HTML 预览、规范化 JSON 导出，以及通过 Pandoc 完成的 DOCX 导出路径。
- 基于 Ketcher 组件和服务端 save/render routes 的化学编辑闭环。
- molecule 与 reaction 的图片 OCR 入口；真实识别质量取决于外部 provider 配置。
- 本地 Flask `chem-service`，在 RDKit 可用时支持 molecule/reaction 渲染。
- `deploy/playground` 下的 playground 部署资产。

## 技术栈

| 范围 | 当前实现 |
| --- | --- |
| Monorepo | `pnpm` workspace + Turborepo |
| 语言 | TypeScript 5.9，`chem-service` 使用 Python 3.14 |
| Web app | Next.js 15，React 19 |
| 样式与 UI | Tailwind CSS 4，Radix UI primitives，`lucide-react`，本地 UI 组件 |
| 化学编辑器 | `ketcher-react`，`ketcher-standalone` |
| 测试 | TypeScript 包和 web 使用 Vitest，demo launcher 使用 Node test runner，`chem-service` 使用 Python `unittest` |
| Python 服务 | Flask 3.1，RDKit 2025.9 |
| DOCX 导出 | `@chemd/compiler/node` 调用 Pandoc |

## 仓库结构

```text
chemd/
├── apps/
│   └── web/                    # Next.js playground、UI features、API routes、server facade
├── deploy/
│   └── playground/             # Docker Compose、Dockerfile、nginx、systemd、env 示例
├── packages/
│   ├── compiler/               # 串联 parse/resolve/typecheck/render/export/runtime 流水线
│   ├── core/                   # AST 类型、diagnostics、render override helpers、共享原语
│   ├── diagnostics/            # v0.3 diagnostic 结构、band、quick fix
│   ├── exporter-training/      # 从编译文档生成训练导出 payload
│   ├── lnf/                    # LNF v0.3 payload builder
│   ├── parser/                 # Frontmatter、block、行内化学、引用解析
│   ├── render-profile/         # 内置 render profiles 与 override 校验
│   ├── renderer-docx/          # 面向 Pandoc DOCX 导出的 Markdown bridge
│   ├── renderer-html/          # HTML preview renderer
│   ├── renderer-json/          # 编译文档 JSON renderer
│   ├── resolver/               # 引用、primary alias、模板展开、语义整理
│   ├── runtime-lab/            # Runtime plan 与 preflight model
│   ├── runtime-trace/          # Trace event 与 replay helpers
│   ├── step-ontology/          # Procedure/observation/analysis lowering model
│   └── typechecker/            # Typed semantic graph 与 value diagnostics
├── scripts/
│   ├── audit-legacy-surface-usage.mjs
│   ├── dev-demo.mjs            # 启动 web + chem-service
│   ├── dev-demo.test.mjs       # Launcher 契约测试
│   ├── legacy-surface-shared.mjs
│   ├── legacy-surface-tools.test.mjs
│   └── migrate-legacy-surface-to-chemd.mjs
├── services/
│   └── chem-service/           # Flask/RDKit 本地 chemistry service
└── vision/                     # Logo 和视觉资产
```

`pnpm` workspace 包含 `apps/*` 和 `packages/*`。`services/chem-service` 是独立的 Poetry Python 项目，不属于 `pnpm` workspace。

## 本地启动

### 前置要求

- Node.js 20 或更新版本。
- `pnpm` 10.x。根目录 `packageManager` 当前是 `pnpm@10.33.0`。
- 运行 `services/chem-service` 需要 Python `>=3.14,<3.15` 和 Poetry。
- 生成 `.docx` 文件需要 Pandoc。
- 只有使用 playground 部署资产时才需要 Docker。

### 安装 TypeScript workspace 依赖

```bash
pnpm install
```

### 安装 `chem-service`

```bash
cd services/chem-service
poetry install
cp .env.example .env
```

PowerShell:

```powershell
cd services/chem-service
poetry install
Copy-Item .env.example .env
```

`services/chem-service/poetry.toml` 启用了项目内虚拟环境。根目录 demo launcher 会在 Unix-like 系统查找 `services/chem-service/.venv/bin/python`，在 Windows 查找 `services/chem-service/.venv/Scripts/python.exe`。

### 启动完整本地 demo

在仓库根目录运行：

```bash
pnpm dev
```

该命令会启动：

- `@chemd/web`：`http://127.0.0.1:2436`
- `chem-service`：`http://127.0.0.1:18081`

### 只启动 web app

```bash
pnpm dev:web
```

Web-only 模式适合 UI 开发；chemistry-service 相关功能需要单独启动 `chem-service`。

### 只启动 `chem-service`

```bash
cd services/chem-service
poetry run python app.py
```

健康检查：

```bash
curl http://127.0.0.1:18081/healthz
```

## 开发命令

除非特别说明，以下命令都在仓库根目录运行。

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装 workspace 依赖 |
| `pnpm dev` | 通过 `scripts/dev-demo.mjs` 启动 web app 和 `chem-service` |
| `pnpm dev:demo` | 完整 demo launcher 的别名 |
| `pnpm dev:web` | 通过 Turbo 只启动 `@chemd/web` |
| `pnpm build` | 执行 `turbo run build` |
| `pnpm test` | 通过 Turbo 执行全部 workspace Vitest tasks |
| `pnpm typecheck` | 通过 Turbo 执行全部 workspace TypeScript checks |
| `pnpm lint` | 对 `apps`、`packages`、`scripts`、根配置文件和 `vitest.workspace.ts` 运行 ESLint |
| `pnpm lint:fix` | 运行 ESLint 自动修复 |
| `pnpm test:dev-demo` | 运行 demo launcher 的 Node 测试 |
| `node --test scripts/legacy-surface-tools.test.mjs` | 运行 legacy surface 迁移/审计测试 |
| `pnpm lint:py` | 对 `services/chem-service` 运行 Ruff |
| `pnpm format:check:py` | 可选检查 `services/chem-service` 的 Python 格式 |

包级命令示例：

```bash
pnpm --filter @chemd/web test
pnpm --filter @chemd/web typecheck
pnpm --filter @chemd/compiler test
pnpm --filter @chemd/parser test
pnpm --filter @chemd/typechecker test
```

Python 服务测试：

```bash
cd services/chem-service
poetry run python -m unittest discover -s tests -p "test_*.py"
```

## 语言表面

作者编辑的是带结构化块的 Markdown。

### Frontmatter

解析器要求这些 frontmatter keys：

- `id`
- `title`
- `date`

有特殊语义的 keys 包括：

- `render_profile`
- `render_overrides`
- `tags`
- `primary_reaction`
- `primary_result`
- `primary_product`
- `primary_sample`
- `primary_molecule`
- `primary_analysis`

其他 scalar frontmatter keys 会作为 metadata 保留。`tags` 必须是字符串数组。`render_overrides` 必须是一层对象，且 key 必须是支持的 render option path。

当前代码内置的 render profiles：

- `eln-default`
- `publication-acs`
- `slides-large`

### 行内语法

| 语法 | 含义 |
| --- | --- |
| `:chem[H2O]` | 行内化学 token |
| `` `inline code` `` | 行内代码 token |
| `[label](https://example.com)` | 带 safety metadata 的 Markdown link token |
| `@rxn-main` | 对象引用 |
| `@res-main.yield` | 对象字段引用 |
| `@meta.title` | Metadata 引用 |
| `@result.yield` | Primary alias 字段引用 |
| `@param.amount` | 模板参数引用 |

### 结构化块

支持以下 block families：

- `:::chemd`：molecule 或 reaction。新文档应显式声明 `kind: molecule` 或 `kind: reaction`；字段形状推断仅作为兼容 fallback。
- `:::result`：结果字段，例如 `status`、`yield`、`conversion`、`selectivity`、`purity` 和 notes。
- `:::analysis`：分析字段；支持 TLC 风格 lane 字段 `p1`、`p2` 等。
- `:::sample`：样品元数据。
- `:::procedure`：自由文本步骤，可带可选 `ref`。
- `:::observation`：自由文本观察记录，可带可选 `ref`。
- `:::template`：模板定义，支持 `bind`、`params`、`description`。
- `:::use`：模板调用。
- `:::col-N`：列布局块，例如 `:::col-2`。

### 示例文档

```md
---
id: exp-v03
title: v0.3 internal language smoke
date: 2026-04-17
render_profile: publication-acs
primary_reaction: rxn-main
primary_result: res-main
tags:
  - demo
  - oxidation
---

# Ethanol oxidation to acetic acid

:::chemd #rxn-main
kind: reaction
reactants: CCO | O=O
products: CC(=O)O
solvent: THF
temperature: -78 °C
time: 30 min
atmosphere: nitrogen
:::

:::procedure #proc-main
1. Cool the substrate solution to -78 °C.
2. Add reagent under nitrogen.
3. Sample the reaction after 30 min for TLC.
:::

:::observation #obs-main
The mixture became deep red after addition.
:::

:::analysis #ana-tlc
type: tlc
ref: rxn-main
result: partial_conversion
data: TLC shows starting material remains
p1: sm 0.82 ^1(1) | 0.46 ^3(3)
p2: pd 0.80 1(1) | 0.42 3(3)
:::

:::result #res-main
status: partial
yield: 23%
purity: 91%
:::

:::chemd #mol-main
smiles: CCO
name: Ethanol
:::

Water marker: :chem[H2O]
Yield: @res-main.yield
```

## 编译流水线

`@chemd/compiler` 暴露 `compileChemd(source, options)`。当前流水线是：

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
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

返回的 `CompileResult` 包含：

- resolved document 和 diagnostics
- render options 与 render adapter payload
- typed semantic graph
- lowered step graph
- runtime run plan 与 preflight result
- canonical LNF v0.5 payload
- training export payload
- HTML、JSON 和 DOCX bridge 字符串

生成真实 `.docx` 文件时，`@chemd/compiler/node` 提供 `compileChemdToDocx()`，它会通过 Pandoc 把 DOCX bridge Markdown 转为 DOCX。

## Web 工作台

Playground 入口是 `apps/web/src/app/page.tsx`。

当前 UI 能力：

- Sticky header，显示文档 metadata、当前 render profile、compile 状态和 theme toggle。
- Source editor，初始内容来自 `apps/web/src/features/playground/lib/sample-source.ts`。
- 通过 `usePlaygroundDocumentController` 做 deferred compile 和 preview refresh。
- Preview shell 中展示 HTML preview、JSON output 和 DOCX bridge output。
- 通过 `/api/export/docx` 导出 DOCX。
- 支持图片 OCR 导入和粘贴监听。
- 通过 chemistry editor dialog 编辑 molecule/reaction。
- OCR 或 chemistry editor 保存后回写 Markdown source。
- 写操作使用 `chemd-session-token` cookie 与 `x-chemd-session-token` header 做同会话保护。

## API 面

### Next.js routes

Web app 暴露以下 route handlers：

| Route | Method | 作用 |
| --- | --- | --- |
| `/api/export/json` | `POST` | 编译 source 并返回规范化 JSON |
| `/api/export/docx` | `POST` | 编译 source 并通过 Pandoc 流式返回 `.docx` 文件 |
| `/api/chem/draft` | `GET` | 按 document block 和 session 读取 molecule/reaction draft |
| `/api/chem/inventory` | `POST` | 通过 PubChem 与 LabStorageManager 查询 molecule/reaction 库存信息 |
| `/api/chem/normalize` | `POST` | 通过 `chem-service` 规范化 molecule notation |
| `/api/chem/render` | `POST` | 渲染 molecule 或 reaction notation |
| `/api/chem/save` | `POST` | 保存 molecule 或 reaction notation，并缓存结构 draft |
| `/api/chem/ocr` | `POST` | 执行 reaction-first OCR workflow，并返回 source write-back payload |
| `/api/chem/reaction/ocr` | `POST` | 直接执行 reaction OCR |

会修改 chemistry draft 的写路由要求 cookie 和 header 中的 session token 匹配。

### `chem-service` routes

Flask 服务暴露：

| Route | Method | 作用 |
| --- | --- | --- |
| `/healthz` | `GET` | 服务健康状态与 provider readiness |
| `/ocr` | `POST` | Molecule OCR provider seam |
| `/normalize` | `POST` | Molecule normalization |
| `/render` | `POST` | Molecule rendering |
| `/reaction/ocr` | `POST` | Reaction OCR provider seam |
| `/reaction/render` | `POST` | Reaction rendering |
| `/structure` | `GET`, `POST` | Structure draft 查询与存储 |

`chem-service` 作为 web app 后面的内部 chemistry API 运行。

## 包职责

| Package | 主要职责 |
| --- | --- |
| `@chemd/core` | AST 类型、diagnostic 类型、render override 规则、reaction condition helpers、TLC helpers、loading SVG helper |
| `@chemd/parser` | 解析 frontmatter、markdown text、inline tokens、structured blocks、templates 和 column blocks |
| `@chemd/resolver` | 解析 references、primary aliases、默认对象 ID、template expansion 和 semantic diagnostics |
| `@chemd/diagnostics` | 构建 v0.3 diagnostics、diagnostic bands 和 quick-fix metadata |
| `@chemd/typechecker` | 构建 typed semantic graph，校验 values，并产生 semantic diagnostics |
| `@chemd/step-ontology` | 将 procedure/observation/analysis 文本 lowering 成 step-oriented structures |
| `@chemd/runtime-lab` | 构建 runtime plans，并报告缺失 runtime capabilities |
| `@chemd/runtime-trace` | 创建 trace events，并对 runtime steps replay traces |
| `@chemd/lnf` | 构建 Chemd LNF v0.3 payload |
| `@chemd/render-profile` | 解析内置 render profiles 并校验 render overrides |
| `@chemd/renderer-html` | 将编译文档渲染为 preview HTML |
| `@chemd/renderer-json` | 将编译文档渲染为 JSON |
| `@chemd/renderer-docx` | 将编译文档渲染为 DOCX bridge Markdown |
| `@chemd/exporter-training` | 从编译文档创建 training export records |
| `@chemd/compiler` | 完整 compile/export/runtime 路径的公开编排 API |
| `@chemd/web` | Next.js playground UI 和服务端 facade routes |

## 环境变量

配置模板：

- `services/chem-service/.env.example`
- `deploy/playground/.env.example`
- `deploy/playground/env/web.env.example`
- `deploy/playground/env/chem-service.env.example`

### Web app

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `CHEM_SERVICE_BASE_URL` | `http://127.0.0.1:18081` | `apps/web` 服务端调用 `chem-service` |
| `CHEM_SERVICE_ACCESS_KEY` | 未设置 | 可选内部访问密钥，会转发给 `chem-service` |
| `PUBCHEM_PUG_REST_BASE_URL` | 代码内 PubChem 默认值 | CAS/name metadata lookup |
| `PUBCHEM_PUG_REST_TIMEOUT_MS` | 代码默认值 | PubChem request timeout |
| `PANDOC_PATH` | `pandoc` | DOCX export binary path |
| `LAB_STORAGE_BASE_URL` | `https://lab.thejiaogroup.cn/api` | LabStorageManager API base URL |
| `LAB_STORAGE_USERNAME` | 未设置 | LabStorageManager login |
| `LAB_STORAGE_PASSWORD` | 未设置 | LabStorageManager login |
| `LAB_STORAGE_DEVICE_ID` | `chemd-lab-storage-proxy` | LabStorageManager device id |
| `LAB_STORAGE_DEVICE_NAME` | `chemd server proxy` | LabStorageManager device name |

DOCX 导出当前并发上限是 `1`，Pandoc 超时时间是 `15000` ms，请求体上限是 `256 KiB`。

### `chem-service`

| 变量 | 默认值 / 模板值 | 用途 |
| --- | --- | --- |
| `CHEM_SERVICE_HOST` | `127.0.0.1` | Flask bind host |
| `CHEM_SERVICE_PORT` | `18081` | Flask bind port |
| `CHEM_SERVICE_ALLOW_ORIGINS` | 本地 web origins | CORS allowlist |
| `CHEM_SERVICE_ACCESS_KEY` | 未设置 | 可选内部访问密钥 |
| `CHEM_SERVICE_INTERNAL_ONLY` | 代码默认值 | Loopback/internal request protection behavior |
| `CHEM_SERVICE_MAX_CONTENT_LENGTH` | 模板中为 `7252652` | Flask request body limit |
| `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH` | 模板中为 `6990508` | OCR image payload limit |
| `CHEM_SERVICE_MAX_UPLOAD_BYTES` | 代码默认值 | Upload protection |
| `CHEM_SERVICE_CACHE_MAX_ENTRIES` | `256` | 内存结构缓存容量 |
| `CHEM_SERVICE_MOLECULE_OCR_PROVIDER` | `placeholder` | `placeholder`、`decimer`、`molscribe` 或 `molnextr` |
| `CHEM_SERVICE_REACTION_OCR_PROVIDER` | `placeholder` | `placeholder`、`rxnscribe`、`rxnim` 或 `rxncaption` |
| `CHEM_SERVICE_DECIMER_API_URL` | 未设置 | Remote molecule OCR seam |
| `CHEM_SERVICE_DECIMER_TIMEOUT_SECONDS` | `60` | DECIMER timeout |
| `CHEM_SERVICE_DECIMER_API_KEY` | 未设置 | DECIMER API key |
| `CHEM_SERVICE_MOLSCRIBE_API_URL` | 未设置 | Remote molecule OCR seam |
| `CHEM_SERVICE_MOLSCRIBE_TIMEOUT_SECONDS` | `60` | MolScribe timeout |
| `CHEM_SERVICE_MOLSCRIBE_API_KEY` | 未设置 | MolScribe API key |
| `CHEM_SERVICE_MOLNEXTR_API_URL` | 未设置 | Remote molecule OCR seam |
| `CHEM_SERVICE_MOLNEXTR_TIMEOUT_SECONDS` | `60` | MolNEXTR timeout |
| `CHEM_SERVICE_MOLNEXTR_API_KEY` | 未设置 | MolNEXTR API key |
| `CHEM_SERVICE_RXNSCRIBE_API_URL` | 未设置 | Remote reaction OCR seam |
| `CHEM_SERVICE_RXNSCRIBE_TIMEOUT_SECONDS` | `60` | RxnScribe timeout |
| `CHEM_SERVICE_RXNSCRIBE_API_KEY` | 未设置 | RxnScribe API key |
| `CHEM_SERVICE_RXNIM_API_URL` | 未设置 | Remote reaction OCR seam |
| `CHEM_SERVICE_RXNIM_TIMEOUT_SECONDS` | `60` | RXNIM timeout |
| `CHEM_SERVICE_RXNIM_API_KEY` | 未设置 | RXNIM API key |
| `CHEM_SERVICE_RXNCAPTION_API_URL` | 未设置 | Remote reaction OCR seam |
| `CHEM_SERVICE_RXNCAPTION_TIMEOUT_SECONDS` | `60` | RXNCaption timeout |
| `CHEM_SERVICE_RXNCAPTION_API_KEY` | 未设置 | RXNCaption API key |

## 测试

按改动类型建议使用这些验证：

```bash
# 全部 TypeScript package/web tests
pnpm test

# 全部 TypeScript checks
pnpm typecheck

# ESLint
pnpm lint

# Demo launcher contract
pnpm test:dev-demo

# Python service tests
cd services/chem-service
poetry run python -m unittest discover -s tests -p "test_*.py"
```

当前仓库为每个 TypeScript package、`apps/web/tests` 下的 route/component helpers、demo launcher，以及 `services/chem-service/tests` 都配置了测试。

## 部署

Playground 部署资产：

相关文件：

- `deploy/playground/compose.yaml`
- `deploy/playground/web.Dockerfile`
- `deploy/playground/chem-service.Dockerfile`
- `deploy/playground/nginx/chemd-playground.conf`
- `deploy/playground/systemd/chemd-playground-web.service`
- `deploy/playground/systemd/chemd-playground-chem.service`
- `deploy/playground/env/web.env.example`
- `deploy/playground/env/chem-service.env.example`

预期拓扑：

```text
public traffic
  -> nginx
  -> apps/web
  -> chem-service
```

公网边界放在 web app。Compose 文件中 public port 绑定到 `127.0.0.1:${PUBLIC_WEB_PORT:-2436}`，`chem-service` 保持为 backend service dependency。

## 运行说明

- 公网流量进入 web app，`chem-service` 保持在 loopback 或可信内网。
- RDKit 渲染依赖 Python 环境能实际安装并 import RDKit。
- OCR routes 已存在，但默认 provider 是 `placeholder`；生产 OCR 需要配置外部 provider URL 和 key。
- DOCX 导出依赖 Pandoc。Compiler 可以独立生成 DOCX bridge Markdown；web DOCX route 需要 Pandoc 生成 `.docx`。
- Lab inventory lookup 需要 LabStorageManager 凭证，并且需要能访问配置的 API。
- `services/chem-service` 使用内存结构存储，服务当前 playground flow。

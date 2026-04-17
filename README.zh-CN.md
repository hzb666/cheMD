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

`chemd` 是一个面向化学文档与实验记录的 Markdown 语义系统。  
当前产品原型以 `Editor + Preview` 为中心，围绕结构化化学块、引用、模板、渲染配置、OCR 辅助导入、化学感知预览以及源码回写构建文档主链。

## 目录

- [概览](#概览)
- [当前重点](#当前重点)
- [交互流程](#交互流程)
- [快速开始](#快速开始)
- [示例文档](#示例文档)
- [里程碑](#里程碑)
- [当前约束](#当前约束)
- [开发者指南](#开发者指南)
- [仓库结构](#仓库结构)
- [架构](#架构)
- [模块与服务](#模块与服务)
- [Web API](#web-api)
- [环境变量](#环境变量)
- [命令](#命令)
- [测试](#测试)
- [部署说明](#部署说明)
- [项目状态](#项目状态)

## 概览

`chemd` 面向这样一类化学文档工作流：它们需要比普通 Markdown 更强的结构表达能力，也需要比单独的结构编辑器更高的文档保真度。系统以 Markdown 作为唯一事实来源，在此基础上增加一层可控的、面向化学内容的语义能力。

当前原型支持：

- 面向 `molecule`、`reaction`、`result`、`analysis`、`sample`、`template`、`use` 的结构化化学块
- 行内化学表达式与文档引用
- 通过 parser、resolver、render-profile 和 renderer 阶段完成文档编译
- 编辑区与预览区同步联动的 Web 工作台
- 面向 molecule 和 reaction 的 OCR 辅助导入
- 负责规范化、渲染、结构缓存与 OCR provider 接缝的 chemistry service
- HTML 预览、JSON 检查输出、SVG fallback 渲染和 DOCX bridge 导出

整体运行模式以文档为中心。OCR、渲染、结构编辑和预览更新最终都会回流到 Markdown 源文档，而不是生成一套脱离源码的独立 UI 状态。

## 当前重点

当前公开 README 聚焦于仓库今天已经支持的能力。更细的 `v0.1` 边界与里程碑决策维护在 [`docs/chemd-v0.1-功能计划与实现进度.md`](docs/chemd-v0.1-%E5%8A%9F%E8%83%BD%E8%AE%A1%E5%88%92%E4%B8%8E%E5%AE%9E%E7%8E%B0%E8%BF%9B%E5%BA%A6.md) 和 [`docs/chemd-v0.1-spec.zh-CN.md`](docs/chemd-v0.1-spec.zh-CN.md) 中。

### 当前产品面

- 基于 Markdown 的化学文档编写
- 结构化文档编译
- `Editor + Preview` Web 体验
- 将 `molecule` 与 `reaction` 作为一等产品对象
- Render profile 选择与文档级覆盖
- 面向化学内容导入的 OCR 入口
- 化学感知预览 hydration
- 从预览与结构编辑回写源码
- DOCX bridge 导出

## 交互流程

当前端到端交互模型如下：

1. 在编辑器中编写 Markdown 与 `chemd` 块。
2. 将源码编译为带诊断、引用、模板和 render profile 解析结果的结构化文档树。
3. 将同一份源码渲染为预览输出。
4. 需要时通过 OCR 从图片中提取化学内容。
5. 将 OCR 结果提升为标准 `molecule` 或 `reaction` 块。
6. 通过嵌入式化学编辑器继续修整结果。
7. 将最终状态回写到 Markdown 源文档。

这样可以让文档、预览和化学交互界面始终围绕同一个事实来源保持一致。

## 快速开始

### 前置要求

若要跑完整本地 demo 栈，需要：

- Node.js `20+`
- `pnpm` `10+`
- Python `3.14`
- `Poetry`

说明：

- Monorepo 根目录使用 `pnpm`。
- `services/chem-service` 使用 Poetry 管理，不属于 `pnpm` workspace。
- 当前完整本地 service 路径遵循 [`services/chem-service/pyproject.toml`](services/chem-service/pyproject.toml)，要求 `Python >=3.14,<3.15`。

### 安装 workspace 依赖

```bash
pnpm install
```

### 安装 `chem-service` 依赖

```bash
cd services/chem-service
poetry install
cp .env.example .env
```

PowerShell：

```powershell
Copy-Item .env.example .env
```

### 启动完整 demo 栈

在仓库根目录执行：

```bash
pnpm dev
```

demo 启动器会拉起：

- Web：`http://127.0.0.1:2436`
- `chem-service`：`http://127.0.0.1:18081`

如果你要前后端一起热重载，可以这样启动：

```bash
pnpm dev --reload
```

这个模式下，前端继续使用 Next.js dev，`chem-service` 会切换到 Flask reload 模式。

### 只启动 Web 应用

```bash
pnpm dev:web
```

这个模式适合做 UI 开发，但凡是依赖 `chem-service` 的功能都会不可用，或退化为降级行为。

### OCR provider 配置

仓库已经预留 OCR provider 接缝，但实际 OCR 质量仍取决于外部配置：

- Molecule OCR 依赖 provider 集成
- Reaction OCR 依赖 provider 集成

相关变量见[环境变量](#环境变量)。

## 示例文档

```md
---
entry_type: experiment # 可选。文档类别，例如 experiment、note。
id: exp-2026-03-30-001 # 必填。文档唯一 id。缺失时回退为 draft-document。
title: Ethanol oxidation to acetic acid # 必填。面向人的文档标题。缺失时回退为 Untitled chemd document。
author: zhibin hu # 可选。记录作者或归属人。
date: 2026-03-30 # 必填。建议使用 YYYY-MM-DD。缺失时回退为 1970-01-01。
project: oxidation-study # 可选。项目或研究分组标识。
status: completed # 可选。记录的高层状态，供展示或下游处理使用。
primary_reaction: rxn-main # 可选。声明主 reaction 对象，供别名/引用解析使用。
primary_result: res-main # 可选。声明主 result 对象，供别名/引用解析使用。
render_profile: eln-default # 可选。渲染 profile id。缺失或非法时回退到 eln-default。
render_overrides: # 可选。在选定 profile 之上叠加的一层 render override map。
  structure.bondLineWidth: 2.1 # 可选。示例：覆盖结构线宽。
tags: # 可选。字符串数组，用于筛选或轻量分类。
  - oxidation # 可选标签项。
  - copper # 可选标签项。
---

This record documents the target transformation @rxn-main and the outcome @res-main.yield.

:::molecule #mol-ethanol
smiles: CCO
name: Ethanol
role: reactant
:::

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
yield: 63%
:::

:::result #res-main
status: success
yield: 63%
notes: Product isolated as colorless liquid.
:::
```

当前语言面包括：

- YAML frontmatter
- `:chem[...]` 行内化学表达式
- `:::molecule`
- `:::reaction`
- `:::result`
- `:::analysis`
- `:::sample`
- `:::template`
- `:::use`
- `@id`、`@id.field`、`@meta.*` 以及主对象别名

## 里程碑

当前 `v0.1` 轨道更适合通过“已交付能力”和“近期产品里程碑”来理解，而不是单纯看内部实现状态。

### 当前能力

- [x] `Editor + Preview` 已是默认产品界面。
- [x] 文档编译主链 `source -> parser -> resolver -> render-profile -> preview/output` 已可运行。
- [x] `molecule` 与 `reaction` 已是 `v0.1` 产品叙事中的正式一等对象。
- [x] 引用、模板定义与调用、嵌套展开和循环检测都已实现。
- [x] `render-profile` 已支持内置 profile、继承、fallback、覆盖和基础校验。
- [x] 已实现 HTML 预览、JSON 输出、SVG fallback 渲染和 DOCX bridge 输出。
- [x] `reaction.conditions` 已进入 AST、parser、renderer 与 export contract。
- [x] `chem-service` 已提供 RDKit-first 渲染路径、OCR 接缝和结构缓存支持。
- [x] 已具备统一化学编辑器，molecule 编辑路径已经跑在嵌入式 Ketcher 循环上。
- [x] Web 写操作采用基于 session token 与 preview token 的最小本地单会话保护模型。

### 路线图

- [ ] 将 OCR 从原型级接入推进到 molecule 与 reaction 双场景都经过验证的产品工作流。
- [ ] 将 reaction 编辑体验补齐到与当前 molecule 编辑路径相同的完成度。
- [ ] 继续改进化学渲染链路与外部 runtime 集成。
- [ ] 继续缩小工作台外壳与正式产品能力之间的差距。

## 当前约束

当前仓库仍应在以下方面保持保守表述：

- Reaction 编辑已经在产品路径上，但还不应宣传为与 molecule 编辑流程完全对齐。
- OCR 已出现在产品界面中，但真实准确率和可用性仍取决于外部服务配置。
- `chem-service` 设计目标是内部 chemistry runtime，不应被视为公网服务。
- 仓库当前只附带面向 playground 的 `deploy/playground` 定向部署示例，尚未提供通用生产部署 bundle。

---

## 开发者指南

## 仓库结构

这个仓库是一个 `pnpm` workspace + Turborepo monorepo：

```text
chemd/
├── apps/
│   └── web/                    # Next.js 15 工作台与 API facade
├── deploy/
│   └── playground/             # compose、Dockerfile、systemd、nginx 与 env 示例
├── packages/
│   ├── compiler/               # 编排入口
│   ├── core/                   # AST、诊断与共享 contract
│   ├── exporter-training/      # 训练导出实现包
│   ├── parser/                 # Frontmatter、块与 token 解析
│   ├── render-profile/         # Profiles、overrides、fallback、validation
│   ├── renderer-docx/          # DOCX bridge 输出
│   ├── renderer-html/          # HTML renderer
│   ├── renderer-json/          # JSON renderer
│   ├── renderer-svg/           # SVG fallback renderer
│   └── resolver/               # 引用、模板展开与语义校验
├── services/
│   └── chem-service/           # Flask chemistry service，不属于 pnpm workspace
├── scripts/
│   └── dev-demo.mjs            # 完整 demo 启动器
└── vision/                     # 视觉资源与 logo 文件
```

## 架构

### 文档编译流水线

```text
source markdown
  -> parseChemd()
  -> resolveChemd()
  -> resolveRenderProfileWithDiagnostics()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

### 化学交互流水线

```text
image / screenshot
  -> OCR provider
  -> normalize / render backend
  -> write back chemd block
  -> preview
  -> chemistry editor
  -> write back chemd block
```

### Service 边界

```text
apps/web
  -> /api/chem/*
  -> services/chem-service
```

核心工程边界是稳定且刻意保持的：

- semantic AST 与 render 参数相互独立
- `render-profile` 是样式与渲染约束的规范层
- Web 应用负责 session 处理、facade routes 与 preview token 逻辑
- `chem-service` 负责 RDKit 集成、OCR 接缝与结构缓存等化学 runtime 行为

## 模块与服务

| 模块 | 职责 | 状态 |
| --- | --- | --- |
| `@chemd/core` | AST、诊断与共享 contract | `v0.1` core |
| `@chemd/parser` | frontmatter、blocks、行内化学、引用 | `v0.1` core |
| `@chemd/resolver` | 引用、模板展开、语义校验 | `v0.1` core |
| `@chemd/render-profile` | profile registry、继承、fallback、overrides、validation | `v0.1` core |
| `@chemd/compiler` | 统一编排 API | `v0.1` core |
| `@chemd/renderer-html` | HTML 输出 | `v0.1` core |
| `@chemd/renderer-json` | JSON 输出 | `v0.1` core |
| `@chemd/renderer-svg` | SVG fallback 渲染 | `v0.1` core，但定位上仅为 fallback |
| `@chemd/renderer-docx` | DOCX bridge 输出 | `v0.1` core |
| `@chemd/exporter-training` | 训练导出流水线 | experimental |
| `apps/web` | 产品工作台、chemistry facade routes、UI 交互 | 主产品入口 |
| `services/chem-service` | RDKit-first 渲染、OCR 接缝、结构缓存 | 下游 chemistry service |

## Web API

当前 Next.js 应用暴露：

- `POST /api/chem/ocr`
- `POST /api/chem/normalize`
- `POST /api/chem/render`
- `GET|POST /api/chem/structure`
- `POST /api/chem/structure/save`
- `POST /api/chem/reaction/ocr`
- `POST /api/chem/reaction/render`
- `POST /api/chem/reaction/save`
- `GET|POST /api/chem/reaction/structure`
- `POST /api/export/docx`

当前 chemistry service 暴露：

- `GET /healthz`
- `POST /ocr`
- `POST /reaction/ocr`
- `POST /normalize`
- `POST /render`
- `POST /reaction/render`
- `GET|POST /structure`

代码中当前 OCR 行为为：

- Web 统一 OCR 入口会先尝试 reaction OCR 路径
- 如果 reaction OCR 没有返回可用 reaction payload，则回退到 molecule OCR 路径
- 最终输出质量取决于 provider 配置与外部服务就绪度

## 环境变量

仓库根目录没有 `.env.example`。  
当前唯一已有模板是 [`services/chem-service/.env.example`](services/chem-service/.env.example)。

同时：

- `apps/web` 会读取额外的运行时变量，但仓库并未提供对应的根级模板
- `services/chem-service/.env.example` 也没有覆盖代码中可能读取到的全部变量

下表反映的是当前可观察到的运行时变量面。

### 网络与限制

| 变量 | 用途 | 说明 |
| --- | --- | --- |
| `CHEM_SERVICE_HOST` | 绑定主机 | 默认 `127.0.0.1` |
| `CHEM_SERVICE_PORT` | 绑定端口 | 默认 `18081` |
| `CHEM_SERVICE_ALLOW_ORIGINS` | CORS allowlist | 默认是本地 `2436` 源 |
| `CHEM_SERVICE_MAX_CONTENT_LENGTH` | 请求体大小限制 | 与 5 MiB 原始图片 contract 对齐 |
| `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH` | base64 图片大小限制 | 与上传大小限制对齐 |
| `CHEM_SERVICE_CACHE_MAX_ENTRIES` | 结构缓存容量 | 默认 `256` |

### Web facade 与导出运行时

这些变量被代码引用，但没有通过根级模板提供：

| 变量 | 用途 |
| --- | --- |
| `CHEM_SERVICE_BASE_URL` | `apps/web` 调用 `chem-service` 时使用的 base URL |
| `CHEM_SERVICE_ACCESS_KEY` | `apps/web` 调用受保护 chemistry service route 时转发的 access key |
| `PUBCHEM_PUG_REST_BASE_URL` | 通过 PubChem 做 CAS 到 SMILES 解析时使用的 base URL |
| `PUBCHEM_PUG_REST_TIMEOUT_MS` | PubChem 调用超时时间 |
| `PANDOC_PATH` | DOCX 导出流程使用的 Pandoc 可执行文件路径 |

### OCR provider 选择

| 变量 | 用途 |
| --- | --- |
| `CHEM_SERVICE_MOLECULE_OCR_PROVIDER` | molecule OCR provider：`decimer`、`molscribe`、`molnextr` |
| `CHEM_SERVICE_REACTION_OCR_PROVIDER` | reaction OCR provider：`rxnscribe`、`rxnim`、`rxncaption` |

### Reaction OCR 与远程接缝

| 变量 | 用途 |
| --- | --- |
| `CHEM_SERVICE_RXNSCRIBE_API_URL` | RxnScribe HTTP endpoint |
| `CHEM_SERVICE_RXNSCRIBE_TIMEOUT_SECONDS` | RxnScribe timeout |
| `CHEM_SERVICE_RXNSCRIBE_API_KEY` | 可选 RxnScribe API key |
| `CHEM_SERVICE_RXNIM_API_URL` | 预留接缝 |
| `CHEM_SERVICE_RXNCAPTION_API_URL` | 预留接缝 |

### 远程 molecule OCR 接缝

| 变量 | 用途 |
| --- | --- |
| `CHEM_SERVICE_DECIMER_API_URL` | DECIMER service URL |
| `CHEM_SERVICE_MOLSCRIBE_API_URL` | MolScribe service URL |
| `CHEM_SERVICE_MOLNEXTR_API_URL` | MolNexTR service URL |

### 安全与内部访问

chemistry service 还会使用：

- `CHEM_SERVICE_ACCESS_KEY`
- `CHEM_SERVICE_INTERNAL_ONLY`
- `CHEM_SERVICE_MAX_UPLOAD_BYTES`

从运维视角看，这意味着：

- 默认本地 setup 是面向 loopback 或可信内网使用的
- 跨网络部署应配置 access key，并显式建立信任边界

### 运行时说明

本地 setup 有两个实际会影响成败的点：

- 完整本地 `chem-service` 路径遵循 [`services/chem-service/pyproject.toml`](services/chem-service/pyproject.toml) 中声明的 Poetry 和 Python 要求
- 轻量测试通过并不自动意味着你已经具备完整的 RDKit 运行时

## 命令

### 仓库根目录

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装 workspace 依赖 |
| `pnpm dev` | 启动完整 demo 栈：web + `chem-service` |
| `pnpm dev --reload` | 启动带后端自动重载的完整 demo 栈 |
| `pnpm dev:demo` | 显式 demo 启动器别名 |
| `pnpm dev:web` | 只启动 Web 工作台 |
| `pnpm build` | 构建 monorepo |
| `pnpm test` | 运行 workspace 测试 |
| `pnpm test:dev-demo` | 运行 demo 启动器测试 |
| `pnpm typecheck` | 运行 TypeScript 类型检查 |
| `pnpm lint` | 运行 ESLint |
| `pnpm lint:fix` | 运行 ESLint 自动修复 |
| `pnpm lint:py` | 对 `services/chem-service` 运行 Ruff lint |
| `pnpm format:check:py` | 检查 Python 格式 |
| `node --test scripts/dev-demo.test.mjs` | 验证 demo 启动器 contract |

### Package 级命令

| 命令 | 用途 |
| --- | --- |
| `pnpm --filter @chemd/web test` | 运行 Web 测试 |
| `pnpm --filter @chemd/web build` | 构建 Web 应用 |
| `pnpm --filter @chemd/parser test` | 运行 parser 测试 |
| `pnpm --filter @chemd/compiler test` | 运行 compiler 测试 |
| `pnpm --filter @chemd/renderer-html test` | 运行 HTML renderer 测试 |
| `pnpm --filter @chemd/renderer-svg test` | 运行 fallback SVG 测试 |
| `pnpm --filter @chemd/renderer-docx test` | 运行 DOCX bridge 测试 |

### `chem-service`

| 命令 | 用途 |
| --- | --- |
| `poetry install` | 安装 Python 依赖 |
| `poetry run python app.py` | 启动服务 |
| `poetry run python -m unittest discover -s tests -p "test_*.py"` | 运行 Python 测试 |
| `poetry check` | 校验 Poetry 配置 |
| `GET /healthz` | 查看 provider 就绪状态 |

## 测试

当前仓库有两条主要验证路径。

### TypeScript 与 Web workspace

```bash
pnpm test
pnpm typecheck
```

### Python chemistry service

```bash
cd services/chem-service
poetry run python -m unittest discover -s tests -p "test_*.py"
```

对于局部改动，建议先跑定向验证，再跑全量测试：

```bash
pnpm --filter @chemd/web test -- tests/page.test.tsx
pnpm --filter @chemd/compiler test -- compiler.test.ts
pnpm --filter @chemd/renderer-docx test -- renderer-docx.test.ts
```

## 部署说明

当前仓库已经提供一套“只公开 playground”的定向部署资产：

- `deploy/playground/compose.yaml`
- `deploy/playground/.env.example`
- `deploy/playground/web.Dockerfile`
- `deploy/playground/chem-service.Dockerfile`
- `deploy/playground/systemd/chemd-playground-web.service`
- `deploy/playground/systemd/chemd-playground-chem.service`
- `deploy/playground/nginx/chemd-playground.conf`
- `deploy/playground/env/web.env.example`
- `deploy/playground/env/chem-service.env.example`

但仍未提供通用根级部署 bundle 或托管平台部署资产，例如：

- `vercel.json`
- `render.yaml`
- `fly.toml`
- `railway.toml`

目前最明确的类生产运行方式是：

```text
public internet -> nginx -> apps/web -> chem-service
```

其中 `chem-service` 仍应保留在可信本地或内网边界内。

就 service 拓扑而言，预期信任模型是：

```text
apps/web -> chem-service
```

本地 demo 栈仍然是最简单、最受支持的开发运行方式。

重要运维说明：

- `chem-service` 不应被文档化或视为公网暴露服务
- 如果要把 playground 放到公网，应只公开 `apps/web`，并让 `chem-service` 保持在 loopback 或可信内网
- 如果走容器编排，优先使用 `deploy/playground/compose.yaml`，并保持 `chem-service` 不对宿主机开放端口
- RDKit-first 行为依赖运行环境中确实具备 RDKit
- OCR 接缝已经存在，但真实 provider 就绪度仍取决于外部配置与服务可用性
- fallback 行为是韧性机制，不代表完整 chemistry backend 已经交付

## 项目状态

`chemd` 当前最准确的描述是：它是一个化学文档产品原型，已经收敛到 `Editor + Preview` 主界面，具备稳定的文档编译核心，并正在逐步固化 chemistry interaction layer。

当前阶段：

- `v0.1` 以 `Editor + Preview` 为中心
- `molecule` 与 `reaction` 是正式产品对象
- HTML、JSON、SVG fallback 与 DOCX bridge 输出已实现
- 统一化学编辑器是当前运行时主路径
- 剩余工作重点集中在 OCR provider 验证和 reaction 编辑体验继续收口

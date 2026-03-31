# Repository Guidelines

## Scope & Precedence
This file defines repository-level collaboration rules for `D:\Code\chemd`.  
It supplements `C:\Users\huzhibin\.codex\AGENTS.md`; if any conflict appears, the global file takes priority.

## Project Structure & Module Organization
This repo is a `pnpm` workspace + Turborepo monorepo.

- `apps/web`: Next.js 15 app, UI entry point (`src/app`, `src/features`, `tests`).
- `packages/*`: domain packages (`core`, `parser`, `resolver`, `compiler`, `render-profile`, `renderer-*`), each with `src` and `tests`.
- `docs`: specs, architecture notes, and implementation plans.
- `vision`: logos and design assets.

Implement logic in `packages/*` first, then integrate into `apps/web`.

## Build, Test, and Development Commands
Run at repository root:

- `pnpm install`: install all workspace dependencies.
- `pnpm dev`: start local web development (`@chemd/web`) through Turbo.
- `pnpm build`: build/type-check all workspaces via `turbo run build`.
- `pnpm test`: run all Vitest suites.
- `pnpm typecheck`: run full TypeScript checks.
- `pnpm --filter @chemd/<pkg> test`: run tests for one package (example: `@chemd/parser`).

## Workflow & Verification
- For non-trivial work, confirm plan before coding.
- After each step, validate changed scope first (filtered tests), then run full `pnpm test` + `pnpm typecheck` before PR.
- For UI changes in `apps/web`, attach before/after screenshots.
- If a required command fails because of sandbox/network limits, request approved out-of-sandbox execution instead of skipping validation.
- 及时更新项目库里的相关文档。

## Coding Style & Naming Conventions
- TypeScript strict mode is enabled; keep types explicit at API boundaries.
- Use 2-space indentation, semicolons, and double quotes.
- Use `camelCase` for variables/functions, `PascalCase` for React components, and kebab-case for package/folder names.
- Export package public APIs from `src/index.ts`; prefer `@chemd/*` aliases over deep relative paths.

## Commit & Pull Request Guidelines
提交信息遵循以下格式（正文必填）：

```text
<type>[可选范围]：<描述>

[正文]

[可选页脚]
```

核心类型（必填）：
- `feat`：新特性或功能（小版本更新）
- `fix`：修复错误或修正错误（PATCH 版本升级）

附加类型（扩展）：
- `docs`：仅文档更改
- `style`：代码风格更改（空格、格式、分号等）
- `refactor`：不涉及功能变更或 bug 修复的代码重构
- `perf`：性能改进
- `test`：添加或修复测试
- `build`：构建系统或外部依赖变更
- `ci`：CI/CD 配置变更
- `chore`：维护任务、工具变更
- `revert`：撤销之前的提交

范围指南：
- 使用括号，例如：`feat(api):`、`fix(ui):`
- 常见作用域：`api`、`ui`、`auth`、`db`、`config`、`deps`、`docs`
- 单体仓库可使用包名或模块名作为范围
- 范围保持简洁且小写

描述规则：
- 使用祈使语气
- 结尾不加句号
- 最多 30 个字符
- 简洁且有描述性

正文指南：
- 在描述后空一行再写正文
- 解释“做了什么”
- 每行不超过 50 个字符
- 使用 `-` 开头，每条换行，动词开头

页脚指南（可选）：
- 在正文后空一行
- 重大变更使用：`重大变更：描述`

PR 要求：
- 单一目的，避免混合不相关改动
- 说明影响范围（apps/packages）
- 附验证命令与结果
- UI 变更附前后截图

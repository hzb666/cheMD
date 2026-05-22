# 接入 prose import CLI 与文档

## 目标

- 为自然语言导入层提供最小可用 CLI 入口。
- 在用户文档中说明本地文本导入的架构、规则来源、示例和边界。
- 在代码库文档中登记新增导入包，避免包职责漂移。

## 范围

- 新增 `chemd import prose <file>` 命令，支持 text/json 输出、`--out` 写入和 `--dry-run`。
- CLI 只负责参数解析、文件 IO、报告和退出码。
- 文本识别、Chemd 草稿渲染和编译校验委托给 `@chemd/importer-prose`。
- 不修改 Chemd 语言层、schema、parser、resolver 或 typechecker 规则。

## 验收

- CLI 测试覆盖文本输出、JSON 输出和 `--out` 行为。
- docs 中 EN/ZH 页面同步，明确导入层复用 Chemd 规则而不是另写语言规则。
- 验证 `@chemd/cli`、`@chemd/importer-prose` 相关测试与 typecheck。
- 最终审查无语言层 drift。

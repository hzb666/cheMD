# 导入 IR 渲染 Chemd 草稿并编译校验

## Goal

Render prose import IR into existing Chemd block syntax and immediately validate the draft through `@chemd/compiler`.

## Scope

- Add Chemd draft rendering in `@chemd/importer-prose`.
- Render explicit `step:` lines inside a `procedure` block.
- Render explicit observation `event:` lines when event type is known.
- Add compile validation helper using `compileChemd`.
- Do not introduce new Chemd syntax.

## Acceptance

- Rendered draft compiles without error diagnostics for covered examples.
- Step/event output uses existing field names.
- Compiler diagnostics are returned as the final validation result.

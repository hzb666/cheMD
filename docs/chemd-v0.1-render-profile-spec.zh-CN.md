# chemd Render Profile v0.1 规范（中文更新版）

状态：按当前产品方向重写  
更新时间：2026-04-02

---

## 1. 目标

`chemd` render profile 用来定义分子结构和反应图的视觉样式，而不改变文档的语义意义。

在 v0.1 产品原型下，它的角色应明确为：
- 产品层可理解的风格参数层
- 文档语义与正式化学渲染后端之间的稳定中间层
- `molecule` 与 `reaction` 共用的渲染参数入口

核心原则：
- render profile 不是语言语义的一部分。
- 同一份语义文档必须可以切换不同 profile 渲染。
- render profile 负责“风格与约束”，不负责“语义真值”。

---

## 2. 范围

v0.1 profile 关注：
- 结构线长和线宽
- 基本字体参数
- monochrome / color 模式
- reaction 布局间距
- reaction 条件显示策略
- export 默认值

不关注：
- 每根键的手工样式
- 任意矢量图微调
- 手工原子坐标编辑
- 完整期刊规则包
- backend 专属且不稳定的底层细节控制

当前代码状态：
- 已覆盖 `structure`、`reaction`、`export` 三个分区。
- 已有基础字段级校验。
- 仍需继续收口 adapter mapping 与 backend contract。

---

## 3. 文档选择方式

文档可通过 frontmatter 指定：

```yaml
---
render_profile: eln-default
---
```

也允许可选的 `render_overrides`：

```yaml
---
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: 1.4
  export.margin: 12
---
```

当前代码状态：
- 已支持 `render_profile`。
- 已支持 `render_overrides` 的第一版实现。
- 当前 overrides 形态是 frontmatter 中的一层 map，key 使用 dotted path，例如 `structure.bondLineWidth`。

---

## 4. 当前 canonical shape

当前实现中的 render options 结构：

```ts
{
  profileId,
  structure: {
    bondLength,
    bondLineWidth,
    multipleBondOffset,
    hashSpacing,
    fontSize,
    atomLabelPadding,
    monochrome,
    backgroundColor
  },
  reaction: {
    arrowLength,
    componentGap,
    plusGap,
    showConditionsBelowArrow
  },
  export: {
    imageFormat,
    margin,
    dpi,
    transparentBackground
  }
}
```

当前代码状态：
- 已作为 `RenderOptions` 类型存在。
- 已在 HTML / fallback SVG / web diagnostics 中被消费。
- 后续正式 RDKit backend 也应只消费这套统一后的安全输入。

---

## 5. 当前内建 profile

当前实现内建以下 profile：
- `base`
- `eln-default`
- `publication-acs`
- `slides-large`

当前代码状态：
- `eln-default` 是默认回退目标。
- `publication-acs` 已可解析。
- `slides-large` 已可解析。

---

## 6. 合并规则

规范要求的合并顺序：
1. 内建默认
2. 父 profile 链
3. 当前 profile
4. 文档级 overrides

当前代码状态：
- 已实现 1、2、3、4。
- 非法字段不会污染最终结果，而是保留已有值并产出诊断。

---

## 7. 继承与循环

profile 可以通过 `extends` 继承父 profile。

当前代码状态：
- 已支持 `extends` 解析。
- 已支持继承环诊断 `E_RENDER_PROFILE_CYCLE`。
- 出现继承环时不会中断编译，而会回退到 `eln-default`。

---

## 8. 缺失 profile 与回退

规范要求：
- 选中的 profile 不存在时，应 warning 并回退默认。

当前代码状态：
- 已实现 `W_UNKNOWN_RENDER_PROFILE`。
- 已实现默认回退到 `eln-default`。
- compiler 会把这类 diagnostics 合并进最终文档 diagnostics。

---

## 9. 运行时校验现状

规范建议校验：
- top-level section 是否识别
- 数值是否合法
- 正数约束
- `imageFormat` 是否在允许枚举内
- 颜色是否合法
- unknown fields warning
- 跨字段约束是否合法

当前代码状态：
- 已实现 unknown profile、inheritance cycle、unknown field、基础值校验、overrides path/value 校验。
- 当前已覆盖的基础值校验包括数值字段、布尔字段、枚举字段和十六进制颜色字段。
- 仍需继续补：
  - 更细粒度的业务约束
  - 更稳定的 backend adapter mapping 校验
  - 正式 RDKit backend 与 fallback renderer 共用的一套统一约束来源

---

## 10. Overrides 当前约束

当前 `render_overrides` 的工程约束：
- 只支持 frontmatter 顶层 `render_overrides:`
- 只支持一层 map
- key 必须是 `section.field` 形式
- value 当前依赖 parser 的轻量标量识别：number / boolean / string

例如：

```yaml
render_overrides:
  structure.bondLineWidth: 2.1
  reaction.showConditionsBelowArrow: false
  export.margin: 16
```

不支持：
- 更深层嵌套对象
- 复杂 YAML 类型
- 数组型 overrides

---

## 11. 语义分离规则

render profile 不是语言块的一部分，因此：
- 不能把 profile 值写回语义块字段
- JSON 导出应把 render 信息放在独立区域
- 改 profile 不应改变语义含义

当前代码状态：
- 已满足。
- `renderJson()` 当前把 render 结果单独输出。

---

## 12. 当前消费位置

render profile 当前主要被这些地方消费：
- `compiler`：解析并汇总 diagnostics
- `renderer-html`：决定文档 `data-profile`
- `renderer-svg`：作为 fallback 读取结构/反应相关参数
- 正式 RDKit backend：应作为 v0.1 下一步主消费方
- `apps/web`：显示 render options 与 profile 状态

当前判断：
- 作为配置系统已经接通。
- 作为“正式后端统一参数层”还需要再收口。

---

## 13. 当前实现结论

当前 render profile 系统已经完成了 v0.1 的基础能力：
- profile id 选择
- 内建 profile
- 继承
- fallback
- cycle diagnostics
- unknown field warning
- 基础值校验
- 文档级 `render_overrides`
- 与语义 AST 隔离

但 v0.1 下一步的关键不只是“继续加字段”，而是：
- 成为 render constraints 的唯一真相来源
- 同时服务 molecule 与 reaction 两条主线
- 同时服务正式 RDKit backend 与 fallback renderer

因此，当前工程判断应为：

**render profile 已从“可解析可回退”提升到“基础可校验、支持 overrides、可局部降级”的阶段。下一步应优先把它收口为正式后端与 fallback renderer 共享的唯一约束来源，支撑 v0.1 的 molecule / reaction 正式渲染主链。**

# chemd Render Profile v0.1 规范（中文更新版）

状态：中文翻译并根据当前代码更新  
更新时间：2026-03-30

---

## 1. 目标

`chemd` render profile 用来定义化学结构和反应图的视觉样式，而不改变文档的语义意义。

它控制的范围包括：
- ELN 预览样式
- SVG / PNG / DOCX / PDF 导出默认样式
- 面向论文的风格预设
- 后续编辑器可复用的渲染参数

核心原则：
- render profile 不是语言语义的一部分。
- 同一份语义文档必须可以切换不同 profile 渲染。

当前代码状态：
- 这一原则已在实现里成立。
- AST 与 render options 已明确分离。

---

## 2. 范围

v0.1 profile 关注：
- 结构线长和线宽
- 基本字体参数
- monochrome / color 模式
- reaction 布局间距
- export 默认值

不关注：
- 每根键的手工样式
- 任意矢量图微调
- 手工原子坐标编辑
- 完整期刊规则包

当前代码状态：
- 已覆盖 `structure`、`reaction`、`export` 三个分区。
- 已有基础字段级校验。
- 尚未做更细粒度 adapter mapping。

---

## 3. 文档选择方式

文档可通过 frontmatter 指定：

```yaml
---
render_profile: eln-default
---
```

规范里还允许可选的 `render_overrides`：

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

当前实现中的 render options 结构与规范保持一致：

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
- 已在 HTML / SVG / web diagnostics 中被消费。

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
- `slides-large` 已可解析（大字号/大间距场景）。

---

## 6. 合并规则

规范要求的合并顺序：
1. 内建默认
2. 父 profile 链
3. 当前 profile
4. 文档级 overrides

当前代码状态：
- 已实现 1、2、3、4。

说明：
- 当前实现会先解析父 profile，再把当前 profile 的合法字段覆盖上去。
- 然后再应用文档级 overrides。
- 非法字段不会污染最终结果，而是保留已有值并产出诊断。

---

## 7. 继承与循环

profile 可以通过 `extends` 继承父 profile。

当前代码状态：
- 已支持 `extends` 解析。
- 已支持继承环诊断 `E_RENDER_PROFILE_CYCLE`。
- 出现继承环时不会中断编译，而会回退到 `eln-default`。

这是当前实现中已经比较成熟的一块。

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

当前代码状态：
- 已实现：
  - unknown profile 诊断 `W_UNKNOWN_RENDER_PROFILE`
  - inheritance cycle 诊断 `E_RENDER_PROFILE_CYCLE`
  - unknown top-level / section field warning `W_UNKNOWN_RENDER_PROFILE_FIELD`
  - 基础值校验 `E_INVALID_RENDER_PROFILE_VALUE`
  - overrides 的 path 校验与值校验
  - 非法值保留继承值、profile 值或基础默认值，不直接中断编译
- 当前已覆盖的基础值校验包括：
  - 数值字段的正数 / 非负数检查
  - `imageFormat` 枚举检查
  - boolean 字段检查
  - `backgroundColor` 十六进制颜色检查
- 尚未实现：
  - 更细粒度的业务约束
  - 更丰富的颜色格式支持
  - renderer adapter 的精细映射校验

因此当前 profile 系统已经从“可解析、可回退”进入“基础可校验、支持 overrides、局部可降级”的阶段，但还不是最终完整 schema 系统。

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
- `renderer-svg`：读取结构/反应相关参数
- `apps/web`：右侧 diagnostics 面板显示 render options

当前判断：
- 作为配置系统已经接通。
- 作为“高精度渲染后端适配层”还没有完成。

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

但还未完成的部分同样重要：
- 更完整 schema 约束
- 更多内建 profile
- renderer adapter mapping

因此，当前工程判断应为：

**render profile 已从“可解析可回退”提升到“基础可校验、支持 overrides、可局部降级”，下一步应补更完整的 schema / adapter 约束。**

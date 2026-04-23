# chemd 语法最佳实践

这份文档回答两个问题：

1. `chemd` 应该怎么写，编译器和训练导出最稳？
2. 如果希望实验意图、因果逻辑、变量控制、材料流、证据链都尽量清楚，应该写到什么程度？

结论先放前面：

> `chemd` 最好的写法不是“字段越多越好”，而是“每条关键逻辑都有稳定挂点，而且挂点类型正确”。

也就是说：

- 反应写在 `:::chemd kind: reaction`
- 结果写在 `:::result`
- 步骤写在 `:::procedure`
- 观察写在 `:::observation`
- 分析写在 `:::analysis`
- 样品谱系写在 `:::sample`
- 证据载体写在 `:::artifact`
- 条件优化写在 `:::condition-varies`

不要把这些关系混在 prose 或 `notes` 里。

## 1. 核心原则

### 1.1 永远用 canonical surface

推荐：

```chemd
:::chemd #rxn-main
kind: reaction
reactants: @mol-a
products: @mol-b
:::
```

不推荐：

```chemd
:::reaction #rxn-main
...
:::
```

当前 canonical surface 是 `:::chemd` + 显式 `kind: molecule | reaction`。  
不要再写 legacy `:::reaction` / `:::molecule`。

### 1.2 每个 block 都给稳定 `#id`

推荐：

```chemd
:::result #res-main
ref: rxn-main
status: success
yield: 78%
:::
```

不要依赖 block 顺序、标题文本、notes 描述去“猜这是谁”。

### 1.3 用结构化字段表达关系，不要把关系写进 notes

推荐：

```chemd
ref: rxn-main
derived_from: sample-crude
artifacts: art-nmr-main
standard: rxn-standard
res1: res-var1
```

不推荐：

```chemd
notes: this result belongs to rxn-main
notes: this TLC is for var1
notes: purified from crude sample
```

对编译器和 LLM 来说，`ref` / `derived_from` / `standard` / `res1` 这种字段才是关系本体。

### 1.4 能显式写 step / event，就不要只写 prose

如果目标是“逻辑最清楚”，推荐：

```chemd
step: heat | id=s-heat | temperature=40 C | duration=2 h | dependsOn=s-charge
event: color_change | id=e-color | linkedStep=s-heat | timepoint=30 min
```

只写 prose 也能 lower，但那是降级路径，不是金标准写法。

### 1.5 把设计、结果、证据、样品分层写开

同一个 block 不要同时承担多个语义角色。

- `reaction`：设计输入和条件
- `result`：结果和 outcome 指标
- `analysis`：分析事实
- `sample`：物料/样品身份与谱系
- `artifact`：图像、谱图、报告等证据载体

## 2. 三层写法

## 2.1 最低可用写法

最低可用的实验记录至少要让编译器知道：

- 这次反应是什么
- 结果属于谁

```chemd
---
id: exp-minimal
title: Minimal record
date: 2026-04-24
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
solvent: THF
temperature: 25 C
:::

:::result #res-main
ref: rxn-main
status: success
yield: 72%
:::
```

这能编译，也能做基础训练，但还不够清楚。

## 2.2 推荐写法

推荐写法在最低可用之外，再补：

- `procedure.reaction`
- `analysis.ref`
- `sample` 和 `artifact`
- 显式 `step:` / `event:`

这样编译器能更稳定地抽出：

- 步骤顺序
- 观察与步骤关系
- 样品谱系
- 证据链

## 2.3 金标准写法

如果目标是“每一个逻辑都理清楚”，那就要做到：

1. 前言区标出 primary entity
2. 分子、反应、结果全部独立 block
3. procedure 用显式 `step:`
4. observation 用显式 `event:`
5. analysis 明确指向 reaction / result / sample / `@cv.varN`
6. sample 明确写 `ref`、`derived_from`、`aliquot_of`、`artifacts`
7. artifact 明确写 `ref`
8. 条件优化统一写成 `condition-varies`
9. `condition` 与 `varN` 用 `field=value`，不要写裸值

完整 golden record 见：

- [`packages/compiler/fixtures/golden-experiment-record.chemd.md`](../packages/compiler/fixtures/golden-experiment-record.chemd.md)

这份示例同时覆盖：

- molecule / reaction / result
- explicit procedure steps
- explicit observation events
- attempt 级 `condition-varies`
- `ref: @cv-coupling-screen.var1`
- sample lineage
- artifact evidence

## 3. 各 block 最佳实践

### 3.1 frontmatter

最少写：

- `id`
- `title`
- `date`

强烈推荐写：

- `primary_reaction`
- `primary_result`

这是编译输出和训练投影的主锚点。

### 3.2 `:::chemd`

#### Molecule

推荐：

```chemd
:::chemd #mol-aryl
kind: molecule
name: aryl bromide
smiles: Brc1ccccc1
role: substrate
:::
```

#### Reaction

推荐显式字段，不推荐把条件压成一条模糊 `conditions:`。

更清楚的写法：

```chemd
:::chemd #rxn-main
kind: reaction
reactants: @mol-a | @mol-b
products: @mol-product
reagents: K3PO4
catalyst: Pd(PPh3)4
solvent: MeCN
temperature: 40 C
time: 2 h
atmosphere: nitrogen
:::
```

### 3.3 `:::result`

`result` 用来表达 outcome，不要塞步骤。

推荐：

```chemd
:::result #res-main
ref: rxn-main
product: @mol-product
status: success
yield: 78%
conversion: 96%
purity: 97%
notes: Best entry in the screen.
:::
```

### 3.4 `:::procedure`

如果追求最清楚，优先显式 `step:`：

```chemd
:::procedure #proc-main
reaction: rxn-main
evidence: notebook-24
step: charge | id=s-charge | inputs=@mol-a,@mol-b | confidence=0.97
step: heat | id=s-heat | temperature=40 C | duration=2 h | dependsOn=s-charge | confidence=0.95
step: sample | id=s-sample | outputs=@sample-aliquot | dependsOn=s-heat | confidence=0.93
step: analyze | id=s-analyze | analysisType=tlc | inputs=@sample-aliquot | dependsOn=s-sample | confidence=0.92
:::
```

推荐写出的字段：

- `ref`
- `id`
- `dependsOn`
- `inputs`
- `outputs`
- `stage`
- `purpose`
- `evidence`
- `confidence`

其中：

- `ref` 是 supporting block 的通用锚点
- `reaction` 用来强调 procedure 直接服务哪个 reaction

金标准写法里，`procedure` 推荐同时写 `ref` 和 `reaction`。

### 3.5 `:::observation`

推荐显式 `event:`，并尽量把观察挂到具体 attempt 或 reaction：

```chemd
:::observation #obs-main
ref: @cv-screen.var1
event: color_change | id=e-color | linkedStep=s-heat | timepoint=30 min | evidence=photo-1 | confidence=0.88
:::
```

关键点：

- 如果观察属于某个优化尝试，用 `ref: @cv-id.varN`
- 如果观察发生在某一步，写 `linkedStep=...`

### 3.6 `:::analysis`

`analysis` 的 `ref` 要尽量精确：

- 筛选行/优化 attempt：`ref: @cv-screen.var1`
- 最终结果：`ref: res-main`
- 某个样品：`ref: sample-main`

例如：

```chemd
:::analysis #ana-tlc
type: tlc
ref: @cv-screen.var1
result: one major product spot
data: TLC plate shows product-dominant profile.
:::
```

```chemd
:::analysis #ana-hplc
type: hplc
ref: res-main
method: HPLC area normalization
instrument: Agilent 1260
result: 97% area product peak
:::
```

#### TLC 最佳实践

TLC 不是“随手写一句 one spot”就够了。  
如果 TLC 要进入训练数据，推荐至少把下面几件事写清楚：

- 它属于哪个 reaction / result / attempt
- 在什么时间点取样
- 用什么展开体系
- 板型和显色方式
- 你从 TLC 得出的结论
- 关键 lane 的结构化描述

推荐：

```chemd
:::analysis #ana-tlc-var1
type: tlc
ref: @cv-screen.var1
time: 2 h
eluent: PE/EA = 4:1
plate: silica gel GF254
visualization: UV 254 nm
result: one major product spot with trace starting material
data: TLC plate after 2 h for var1.
p1: sm 0.78
p2: crude-var1 0.52 | sm-trace(0.79)
p3: product-std 0.50
:::
```

这里的分工建议是：

- `result`：实验者结论
- `data`：对整块 TLC 的简要事实描述
- `p1` / `p2` / `p3`：lane 级结构化记录

TLC 的 `ref` 最佳实践：

- 反应进度监控：`ref: rxn-main`
- 条件优化某一行：`ref: @cv-screen.var1`
- 结果复核：`ref: res-main`

如果 TLC 是用来比较平行优化尝试，**优先挂到 attempt**，不要只挂到整个 `condition-varies` 父块。

lane 命名建议稳定：

- `sm` / `sm-trace`
- `product-std`
- `crude-var1`
- `purified`

不要写成只有作者自己看得懂的 `1` / `2` / `3`。

### 3.7 `:::sample`

`sample` 是材料流和谱系的关键节点。

推荐：

```chemd
:::sample #sample-batch
ref: rxn-main
name: crude reaction batch
derived_from: rxn-main
artifacts: art-lcms
:::

:::sample #sample-aliquot
ref: rxn-main
name: TLC aliquot
aliquot_of: sample-batch
artifacts: art-tlc
:::

:::sample #sample-purified
ref: res-main
name: purified product
derived_from: sample-batch
purity: 97%
artifacts: art-nmr
:::
```

经验规则：

- `ref`：这个 sample 主要属于谁
- `derived_from`：它是从哪个 reaction / sample 派生来的
- `aliquot_of`：它是哪个样品分出的等分
- `artifacts`：和它直接绑定的证据载体

### 3.8 `:::artifact`

`artifact` 是证据载体，不是结论本身。

推荐：

```chemd
:::artifact #art-nmr
kind: nmr_spectrum
ref: res-main
path: data/nmr/res-main.pdf
checksum: sha256:abc
instrument: Bruker 400
notes: Final structural evidence.
:::
```

推荐 `ref` 指向它真正支持的对象：

- 支持某次分析，就 `ref: ana-...`
- 支持某个样品，就 `ref: sample-...`
- 支持最终结论，就 `ref: res-...`

### 3.9 `:::condition-varies`

条件优化统一用这个块，不要散落在 notes 里。

推荐：

```chemd
:::condition-varies #cv-screen
standard: rxn-standard
condition: solvent=THF | temperature=25 C | catalyst=Pd(PPh3)4
varies: solvent | temperature
var1: reaction=rxn-var1 | solvent=MeCN | temperature=40 C
res1: res-var1
note1: Higher conversion.
var2: reaction=rxn-var2 | mode=override | solvent=DMF | temperature=60 C | catalyst=Pd(dppf)Cl2
res2: res-var2
note2: Impurity increased.
:::
```

关键规则：

- `condition` 写 baseline 条件
- `var1` / `var2` 每个就是一次平行尝试
- 默认只覆盖写出的变量
- `mode=override` 表示这次尝试完整覆盖 baseline
- `res1` / `note1` 跟 `var1` 绑定
- TLC / analysis / observation 要指向某次尝试时，用 `ref: @cv-screen.var1`

**不要这样写：**

```chemd
condition: THF | 25 C | Pd
```

这只是裸值，不是可训练的变量逻辑。

应该写：

```chemd
condition: solvent=THF | temperature=25 C | catalyst=Pd
```

## 4. 最常见的坏写法

### 4.1 只写 prose，不写引用

坏：

```chemd
notes: TLC belongs to the first variant
```

对：

```chemd
ref: @cv-screen.var1
```

### 4.2 只写值，不写字段名

坏：

```chemd
condition: THF | 25 C
```

对：

```chemd
condition: solvent=THF | temperature=25 C
```

### 4.3 把 evidence 和 conclusion 写在一个 block 里

坏：

```chemd
:::result #res-main
yield: 78%
notes: NMR clean, TLC one spot, see image...
:::
```

更好的写法是拆开：

- `result` 写 outcome
- `analysis` 写分析结论
- `artifact` 写图谱/图片/报告

### 4.4 让 sample 没有谱系

如果写了 sample，就尽量说明它是：

- 从哪个 reaction 来的
- 还是从哪个 sample 派生/分出的
- 绑定了哪些 artifact

否则材料流会断。

## 5. 一句话标准

如果要判断一份 `chemd` 写得够不够好，可以用这一句：

> 不看作者脑补，只看 block 和字段，编译器能不能把反应、结果、步骤、观察、分析、样品、证据、条件优化关系都接起来。

能接起来，就是好写法。  
接不起来，就继续把关系从 prose 挪回结构字段里。

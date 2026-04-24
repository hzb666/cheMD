# chemd 语法最佳实践

这份文档只回答一个问题：

> `chemd` 怎么写，最符合真实实验记录，也最利于编译、导出和训练。

这一版把实验报告分成三类：

1. 全合成
2. 普通合成（一步）
3. 条件筛选

核心立场先放前面：

- 默认一个实验报告只表达一个主反应
- 有联系的反应靠结构化引用关联，不靠段落叙述脑补
- 全合成看 `route + prev`
- 条件筛选看 `condition-varies`
- `next` 不手写，由编译器推导
- 能跨文档强引用的地方，都应允许跨文档强引用

配套示例见：

- [`packages/compiler/fixtures/best-practice-total-synthesis.chemd.md`](../packages/compiler/fixtures/best-practice-total-synthesis.chemd.md)
- [`packages/compiler/fixtures/best-practice-one-step-synthesis.chemd.md`](../packages/compiler/fixtures/best-practice-one-step-synthesis.chemd.md)
- [`packages/compiler/fixtures/best-practice-condition-screen.chemd.md`](../packages/compiler/fixtures/best-practice-condition-screen.chemd.md)

## 1. 总原则

### 1.1 默认一个实验报告一个主反应

最佳实践不是在一个文档里塞很多 reaction。

默认应该是：

- 一个实验报告有一个 `primary_reaction`
- 这个报告围绕这一个 reaction 写 `result`、`procedure`、`analysis`、`sample`、`artifact`
- 如果它和别的反应有关系，用引用连出去

这样做的好处是：

- 人写的时候边界清楚
- 编译器能稳定找主锚点
- 训练时一条记录就是一个清楚的语义单元

### 1.2 关系写进字段，不写进 prose

推荐：

```chemd
ref: rxn-main
derived_from: sample-crude
standard: report-002#rxn-standard
prev: route-014#rxn-step-06
res1: res-var1
```

不推荐：

```chemd
notes: this TLC belongs to the first variant
notes: same route as the previous report
notes: derived from the crude from last time
```

### 1.3 reaction 路线图和条件筛选图是两张图

不要把这两种逻辑混在一起。

- 全合成、分步路线：用 `reaction.route` 和 `reaction.prev`
- 条件优化、平行筛选：用 `condition-varies`

不要用 `condition-varies` 表达上一步下一步。
也不要用 `prev` 去表达“这只是同一轮条件比较中的另一个 entry”。

### 1.4 `next` 不手写

对作者来说，真正需要表达的是“当前反应依赖哪些前驱”。
所以最佳实践是：

- 写 `prev`
- 不写 `next`
- 让编译器从所有 `prev` 反推 `next`

手写 `prev` 和 `next` 两套边会造成漂移，最后文档本身不一致。

### 1.5 `:::chemd` 是 canonical surface，`kind` 在作者输入层可省

molecule 和 reaction 都统一用：

```chemd
:::chemd #rxn-main
kind: reaction
...
:::
```

不要再写 legacy `:::reaction` 或 `:::molecule`。

这里要区分两层：

- 作者输入层：`kind` 可以省
- canonical 输出层：`kind` 仍建议显式存在

例如，下面这种作者写法是可接受的：

```chemd
:::chemd #rxn-main
reactants: @mol-a | @mol-b
products: @mol-product
solvent: THF
:::
```

编译器会根据 `reactants/products` 把它稳健推成 `reaction`，repair loop 也可以自动补回：

```chemd
kind: reaction
```

同理，没有 reaction-shaped 字段时会默认落到 `molecule`。

但有两个边界不能放松：

1. 显式写了错误 `kind`，不能再偷偷 fallback
2. 推断只适用于这类单向明确的 shape，不适用于复杂关系猜测

### 1.6 可由编译器稳健推断的字段，可以省

下面这些字段在作者输入层可以省，让 compiler / repair loop 补回 canonical form：

- `kind`：由 `reactants/products` 形状推断 reaction，否则推断 molecule
- `primary_reaction`：文档里只有一个 reaction，或可由 `primary_result` / 唯一 result 的 reaction 归属反推
- `primary_result`：文档里只有一个 result 时补
- `result.ref`：文档里只有一个 reaction 时补
- `result.ref`：或当 `result.product` 只匹配一个 reaction product 时补
- `result.product`：result 指向的 reaction 只有一个 product 时补
- `analysis.ref` / `procedure.ref` / `observation.ref`：唯一 reaction 或唯一 attempt 时补
- `condition-varies.condition`：可从 standard reaction 的条件继承
- `condition-varies.varies`：可从各 `varN` 的变化字段差分生成
- `condition-varies.resN`：attempt reaction 唯一匹配一个 result 时补
- `reaction.next`：由 `prev` 反推

这些属于“单向明确、不会伪造实验事实”的推断。

不要让编译器猜下面这些：

- `THF` 是不是 solvent
- 某个 sample 的 `derived_from`
- artifact 应该支持 analysis、sample 还是 result
- 跨文档强引用
- 同模板、同拓底物这类 family 关系

### 1.7 跨文档强关联应显式写 scoped ref

如果两个对象在语义上是强关联，就直接写 scoped ref：

```chemd
ref: report-006#res-main
derived_from: report-005#sample-crude
standard: report-003#rxn-standard
prev: route-010#rxn-step-04
```

这比“标题相似”“notes 里说一句”强得多。

对训练也一样：

- 单条实验报告只能稳定看到你显式写出来的强引用
- “同模板”“同拓底物”“同 procedure family”这类更高层关系，要靠后续 family / campaign 聚合导出

所以，如果你希望模型在单条记录里就能看见跨文档关系，必须显式写引用。

## 2. 全合成

### 2.1 适用场景

这一类用于表达：

- 总合成路线中的某一步
- 多步路线中的分叉、汇合
- 当前步骤依赖前一步或多步前驱

仍然遵守默认原则：

> 一个报告通常只写当前这一步 reaction，本步和前后步骤的关系靠引用表达。

### 2.2 最小必写集

全合成场景下，最小建议是：

- frontmatter: `id`, `title`, `date`
- reaction: `reactants`, `products`, `route`, `prev`
- result: `ref`

其中：

- `route` 表示当前反应属于哪条路线
- `prev` 表示它依赖哪些上一步
- `kind` 推荐保留，但作者输入层可省，编译器可补
- `primary_reaction` / `primary_result` 推荐保留，但唯一目标时编译器可补

### 2.3 推荐写法

```chemd
---
id: exp-step-07
title: C7 hydroxyl protection
date: 2026-04-24
primary_reaction: rxn-step-07
primary_result: res-step-07
---

:::chemd #mol-step-06
kind: molecule
name: step 06 intermediate
smiles: ...
role: substrate
:::

:::chemd #mol-step-07
kind: molecule
name: protected intermediate
smiles: ...
role: product
:::

:::chemd #rxn-step-07
kind: reaction
name: C7 hydroxyl protection
route: taxol-route-a
prev: report-step-06#rxn-step-06
reactants: @mol-step-06
products: @mol-step-07
reagents: TBSCl | imidazole
solvent: DMF
temperature: 25 C
time: 3 h
:::

:::result #res-step-07
ref: rxn-step-07
product: @mol-step-07
status: success
yield: 81%
:::

:::procedure #proc-step-07
reaction: rxn-step-07
step: charge | id=s-charge | inputs=@mol-step-06 | confidence=0.97
step: stir | id=s-stir | duration=3 h | dependsOn=s-charge | confidence=0.95
step: quench | id=s-quench | dependsOn=s-stir | confidence=0.92
:::
```

### 2.4 写法要点

#### `route`

`route` 是路线归组，不是分类标签。
同一条总合成路线上的 step 应保持同一个 `route` 标识。

#### `prev`

`prev` 是真正的依赖边。

线性路线：

```chemd
prev: report-step-06#rxn-step-06
```

汇聚步骤：

```chemd
prev: report-a#rxn-fragment-a, report-b#rxn-fragment-b
```

#### `next`

不要手写。
它应该完全由编译器根据别人的 `prev` 推导。

#### `procedure`

`procedure` 写的是“当前这一步怎么做”，不是“路线关系本身”。

也就是说：

- `route/prev` 负责表达图结构
- `procedure` 负责表达人具体怎么操作

### 2.5 全合成里的分析和 TLC

全合成里如果有 TLC、LCMS、NMR，仍然按对象挂点：

- 监控当前反应进度：`ref: rxn-step-07`
- 复核当前结果：`ref: res-step-07`
- 测某个分离样品：`ref: sample-step-07`

不要把 TLC 直接挂到前一步或整条 route。

## 3. 普通合成（一步）

### 3.1 适用场景

这一类用于表达：

- 一步常规合成
- 一个底物体系的一次标准制备
- 不强调路线前驱，只关心这一步本身

这是最常见、也最应该写得干净的一类记录。

### 3.2 最小必写集

最低建议：

- frontmatter: `id`, `title`, `date`
- reaction: `reactants`, `products`
- result: `ref`

如果要让逻辑更完整，再补：

- `procedure`
- `analysis`
- `sample`
- `artifact`
- `kind`（如果你希望 source 本身就是 canonical form）
- `primary_reaction` / `primary_result`（如果你希望 source 本身就是 canonical form）

### 3.3 推荐写法

```chemd
---
id: exp-esterification-01
title: Standard esterification
date: 2026-04-24
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #mol-acid
kind: molecule
name: benzoic acid
smiles: O=C(O)c1ccccc1
role: substrate
:::

:::chemd #mol-alcohol
kind: molecule
name: ethanol
smiles: CCO
role: coupling_partner
:::

:::chemd #mol-product
kind: molecule
name: ethyl benzoate
smiles: CCOC(=O)c1ccccc1
role: product
:::

:::chemd #rxn-main
kind: reaction
name: Fischer esterification
reactants: @mol-acid | @mol-alcohol
products: @mol-product
catalyst: H2SO4
solvent: ethanol
temperature: reflux
time: 4 h
:::

:::result #res-main
ref: rxn-main
product: @mol-product
status: success
yield: 76%
purity: 95%
:::

:::procedure #proc-main
reaction: rxn-main
step: charge | id=s-charge | inputs=@mol-acid,@mol-alcohol | confidence=0.97
step: heat | id=s-heat | temperature=reflux | duration=4 h | dependsOn=s-charge | confidence=0.95
step: workup | id=s-workup | dependsOn=s-heat | confidence=0.92
step: purify | id=s-purify | dependsOn=s-workup | outputs=@sample-product | confidence=0.91
:::

:::analysis #ana-nmr
type: nmr
ref: res-main
result: spectrum consistent with target ester
:::

:::sample #sample-product
ref: res-main
name: purified ester product
derived_from: rxn-main
artifacts: art-nmr
:::

:::artifact #art-nmr
kind: nmr_spectrum
ref: sample-product
path: data/nmr/ester-01.pdf
:::
```

### 3.4 写法要点

#### reaction 只写设计输入和条件

`reaction` 里不要塞结果、观察和证据。

#### result 只写 outcome

`yield`、`conversion`、`purity` 放在 `result`。
不要把“NMR 很干净”“TLC one spot”直接塞进 `result` 当主表达。

#### procedure 和 observation 分开

- `procedure` 写做了什么
- `observation` 写看到了什么

这样步骤和现象能被分别抽出来。

### 3.5 普通合成里的 TLC 最佳实践

普通合成里，TLC 常见有三种挂法：

- 反应监控：`ref: rxn-main`
- 结果复核：`ref: res-main`
- 样品检测：`ref: sample-product`

推荐：

```chemd
:::analysis #ana-tlc-main
type: tlc
ref: rxn-main
time: 3 h
eluent: PE/EA = 4:1
plate: silica gel GF254
visualization: UV 254 nm
result: starting material nearly consumed, major product spot observed
data: TLC plate taken during reaction monitoring.
p1: sm 0.71
p2: crude 0.46 | sm-trace(0.72)
p3: product-std 0.45
:::
```

TLC 的最低好写法，不是只写一句 `one spot`，而是至少写清：

- 属于谁
- 什么时候测
- 怎么跑
- 看到了什么
- lane 里各自是谁

## 4. 条件筛选

### 4.1 适用场景

这一类用于表达：

- 条件优化
- 对照实验
- 并行筛选
- 相对标准反应只改一个或几个变量的尝试

这里要明确：

> 并行筛选不是次级能力，它本身就是条件筛选的一种标准写法。

条件筛选可以有两种报告粒度：

1. 单次尝试报告
2. 并行筛选报告

### 4.2 单次尝试报告

如果这篇报告只记录一个尝试，就仍然默认一个 reaction，然后明确它相对哪个标准反应变化。

推荐：

```chemd
:::chemd #rxn-attempt
kind: reaction
name: MeCN attempt
reactants: @mol-a | @mol-b
products: @mol-product
solvent: MeCN
temperature: 40 C
:::

:::result #res-attempt
ref: rxn-attempt
status: success
yield: 78%
:::

:::condition-varies #cv-attempt
standard: report-standard#rxn-standard
condition: solvent=THF | temperature=25 C | catalyst=Pd(PPh3)4
varies: solvent | temperature
var1: reaction=rxn-attempt | solvent=MeCN | temperature=40 C
res1: res-attempt
note1: Higher conversion than the standard condition.
:::
```

这种写法适合：

- 每份报告只记录一条尝试
- 但你仍然希望训练时明确看见 baseline、变量变化和结果归因

### 4.3 并行筛选报告

如果一篇报告就是一整轮 screen，那么 `condition-varies` 可以挂多个 attempt。

推荐：

```chemd
:::chemd #rxn-standard
kind: reaction
name: baseline entry
reactants: @mol-a | @mol-b
products: @mol-product
catalyst: Pd(PPh3)4
solvent: THF
temperature: 25 C
:::

:::chemd #rxn-var1
kind: reaction
name: entry var1
reactants: @mol-a | @mol-b
products: @mol-product
catalyst: Pd(PPh3)4
solvent: MeCN
temperature: 40 C
:::

:::chemd #rxn-var2
kind: reaction
name: entry var2
reactants: @mol-a | @mol-b
products: @mol-product
catalyst: Pd(dppf)Cl2
solvent: DMF
temperature: 60 C
:::

:::result #res-var1
ref: rxn-var1
status: success
yield: 78%
:::

:::result #res-var2
ref: rxn-var2
status: failed
yield: 18%
:::

:::condition-varies #cv-screen
standard: rxn-standard
condition: solvent=THF | temperature=25 C | catalyst=Pd(PPh3)4
varies: solvent | temperature | catalyst
var1: reaction=rxn-var1 | solvent=MeCN | temperature=40 C
res1: res-var1
note1: Higher conversion with acceptable impurity profile.
var2: reaction=rxn-var2 | mode=override | solvent=DMF | temperature=60 C | catalyst=Pd(dppf)Cl2
res2: res-var2
note2: Override condition gives low conversion and more impurity.
:::
```

### 4.4 写法要点

#### `condition`

`condition` 写 baseline。

要写成：

```chemd
condition: solvent=THF | temperature=25 C | catalyst=Pd(PPh3)4
```

不要写成：

```chemd
condition: THF | 25 C | Pd
```

裸值不能稳定表示变量语义。

#### `varN`

每个 `varN` 表示一次具体尝试。
默认只覆盖写出的字段；若要完整重写 baseline，显式写 `mode=override`。

#### `varies`

`varies` 推荐写，但不是必须写。
如果各 `varN` 都已经写出变化字段，编译器可以从它们的字段差分生成：

```chemd
varies: solvent | temperature
```

#### `resN` / `noteN`

`res1` 绑定 `var1`，`note1` 也绑定 `var1`。
不要在 prose 里再写“第一个 entry 的结果是……”。

### 4.5 条件筛选里的 TLC / analysis / observation

这是条件筛选里最容易写错的地方。

如果分析属于某一条 attempt，最佳实践是：

```chemd
ref: @cv-screen.var1
```

而不是：

```chemd
ref: cv-screen
```

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

```chemd
:::observation #obs-var1
ref: @cv-screen.var1
event: color_change | id=e-color | timepoint=30 min | confidence=0.88
:::
```

规则很简单：

- 反应级分析，挂 `rxn-var1`
- attempt 级分析，挂 `@cv-screen.var1`
- 结果复核，挂 `res-var1`
- 样品检测，挂 `sample-var1`

条件筛选里如果你的判断是“比较 entry 之间差异”，优先挂 attempt。

## 5. 跨文档引用最佳实践

### 5.1 哪些对象可以跨文档引用

最佳实践是：凡是语义上存在强关联的组件，都可以跨文档引用。

常见包括：

- `result.ref`
- `analysis.ref`
- `sample.ref`
- `sample.derived_from`
- `sample.aliquot_of`
- `artifact.ref`
- `condition-varies.standard`
- `condition-varies.varN.reaction`
- `condition-varies.resN`
- `reaction.prev`

例如：

```chemd
ref: report-006#res-main
derived_from: report-005#sample-crude
standard: report-002#rxn-standard
prev: route-014#rxn-step-06
```

### 5.2 什么时候应该跨文档引用

满足下面任一情况，就应优先考虑 scoped ref：

- 当前实验明确继承前一篇报告的样品或结果
- 当前反应明确以前一篇报告中的 reaction 为前驱
- 当前筛选明确以另一篇报告里的标准反应为 baseline
- 当前 block 明确在复用另一个文档中的强语义对象

### 5.3 什么时候不要滥用跨文档引用

不要把“看起来差不多”误写成强引用。

例如：

- 只是同类反应，但没有直接依赖关系
- 只是 procedure 类似，但不是同一个对象的延续
- 只是同一项目里的另一条支线

这类关系更适合交给后续的 family / campaign 聚合，而不是伪造一个 `prev` 或 `ref`。

### 5.4 对训练的影响

训练时要分清两层：

第一层，单条实验报告导出。
这里能稳定看见的是：

- 文档内显式关系
- 文档里写出的 scoped cross-document 强关系

第二层，跨文档 family / campaign 聚合。
这里才会额外看到：

- 同 procedure template
- 同 substrate expansion
- 同 optimization trajectory

所以如果你希望“这份单条记录本身就让模型看见跨文档依赖”，那就必须把引用写出来。

## 6. 最常见的坏写法

### 6.1 一个报告里塞很多不必要的 reaction

坏处是：

- primary entity 不清楚
- supporting block 不知道该挂谁
- 训练时难以切成稳定样本

默认还是一个报告一个主反应。

### 6.2 用 `condition-varies` 表达全合成顺序

这是错误建模。

- 全合成：`route + prev`
- 条件筛选：`condition-varies`

两者不要混。

### 6.3 手写 `next`

这是不必要的重复维护。
最佳实践是只写 `prev`。

### 6.4 只写裸值，不写字段名

坏：

```chemd
condition: THF | 25 C | Pd
```

对：

```chemd
condition: solvent=THF | temperature=25 C | catalyst=Pd
```

### 6.5 用 notes 代替引用

坏：

```chemd
notes: this TLC belongs to the first variant
```

对：

```chemd
ref: @cv-screen.var1
```

### 6.6 把 evidence、analysis、result 混成一个块

更好的分工是：

- `result` 写 outcome
- `analysis` 写分析结论和结构化数据
- `artifact` 写图谱、图片、原始报告

## 7. 一句话标准

如果只用一句话判断一份 `chemd` 写得够不够好，可以用这个标准：

> 不看作者脑补，只看 block 和字段，编译器能不能把主反应、前驱关系、条件变化、步骤、观察、样品、分析和证据稳定接起来。

能接起来，就是好写法。  
接不起来，就继续把关系从 prose 挪回结构字段里。

---
id: exp-condition-screen
title: Suzuki coupling condition screen
date: 2026-04-24
primary_reaction: rxn-var1
primary_result: res-var1
---

:::chemd #mol-aryl
kind: molecule
name: aryl bromide
smiles: Brc1ccccc1
role: substrate
:::

:::chemd #mol-boron
kind: molecule
name: phenylboronic acid
smiles: OB(O)c1ccccc1
role: coupling_partner
:::

:::chemd #mol-product
kind: molecule
name: biaryl product
smiles: c1ccc(-c2ccccc2)cc1
role: product
:::

:::chemd #rxn-standard
kind: reaction
name: baseline entry
reactants: @mol-aryl | @mol-boron
products: @mol-product
reagents: K3PO4
catalyst: Pd(PPh3)4
solvent: THF
temperature: 25 C
time: 2 h
:::

:::chemd #rxn-var1
kind: reaction
name: MeCN entry
reactants: @mol-aryl | @mol-boron
products: @mol-product
reagents: K3PO4
catalyst: Pd(PPh3)4
solvent: MeCN
temperature: 40 C
time: 2 h
:::

:::chemd #rxn-var2
kind: reaction
name: DMF override entry
reactants: @mol-aryl | @mol-boron
products: @mol-product
reagents: K3PO4
catalyst: Pd(dppf)Cl2
solvent: DMF
temperature: 60 C
time: 2 h
:::

:::result #res-var1
ref: rxn-var1
product: @mol-product
status: success
yield: 78%
conversion: 96%
purity: 97%
:::

:::result #res-var2
ref: rxn-var2
product: @mol-product
status: failed
yield: 18%
conversion: 25%
purity: 61%
:::

:::condition-varies #cv-screen
standard: rxn-standard
condition: solvent=THF | temperature=25 C | catalyst=Pd(PPh3)4
varies: solvent | temperature | catalyst
var1: reaction=rxn-var1 | solvent=MeCN | temperature=40 C
res1: res-var1
note1: Higher conversion with the baseline catalyst.
var2: reaction=rxn-var2 | mode=override | solvent=DMF | temperature=60 C | catalyst=Pd(dppf)Cl2
res2: res-var2
note2: Full override lowers conversion and purity.
:::

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

:::observation #obs-var2
ref: @cv-screen.var2
event: color_change | id=e-color-var2 | timepoint=2 h | confidence=0.84
:::

:::sample #sample-product-var1
ref: res-var1
name: purified product from var1
derived_from: rxn-var1
artifacts: art-nmr-var1
:::

:::artifact #art-nmr-var1
kind: nmr_spectrum
ref: res-var1
path: data/nmr/condition-screen-var1.pdf
:::

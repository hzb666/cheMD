export const sampleSource = `---
id: exp-2026-03-30-001
title: Ethanol oxidation to acetic acid
date: 2026-03-30
render_profile: publication-acs
primary_result: res-main
---

:::chemd #chem-rxn-main
kind: reaction
reac: CCO | O=O
prod: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
:::

:::procedure #proc-main
ref: chem-rxn-main
:::step heat-main
family: heat
temperature: 80 C
duration: 4 h
:::
:::step analyze-main
family: analyze
analysisType: tlc
dependsOn: heat-main
:::
:::

:::col-2
col: {
:::analysis #ana-tlc-main
type: tlc
ref: chem-rxn-main
time: 0.5 h
eluent: PE/EA = 4:1
result: TLC combination board for sm / pd / 123 labels
data: TLC lane matrix for default playground preview
lane: sm
spot: 0.82 ^1(1) starting_material
spot: 0.64 ^2(2) impurity
spot: 0.46 ^3(3) impurity
spot: 0.28 ^4(4) impurity
spot: 0.12 ^5(5) impurity
lane: prod
spot: 0.80 1(1) product
spot: 0.60 2(2) impurity
spot: 0.42 3(3) impurity
spot: 0.24 4(4) impurity
spot: 0.08 5(5) impurity
lane: rxn
spot: 0.76 v1(1) product
spot: 0.58 v2(2) impurity
spot: 0.40 v3(3) impurity
spot: 0.22 v4(4) impurity
spot: 0.06 v5(5) impurity
lane: sm
mess: 0.52 1(1)
mess: 0.34 3(3)
mess: 0.16 5(5)
lane: prod
none
lane: rxn
spot: 0.50 ^5(2) product
spot: 0.18 v2(5) impurity
base: 0.50 product
:::
}
col: {
:::result #res-main
status: complete
yield: 63 %
conversion: 78 %
selectivity: 91 %
purity: 98 %
notes: TLC demo shows circle / up / down, mess, none, and base.
:::
}
:::

:::chemd #chem-mol-main
kind: molecule
smiles: CCO
:::

Water marker: :chem[H2O]
Yield: @res-main.yield
`;

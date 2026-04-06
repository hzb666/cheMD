export const sampleSource = `---
id: exp-2026-03-30-001
title: Ethanol oxidation to acetic acid
date: 2026-03-30
render_profile: publication-acs
primary_result: res-main
---

# Ethanol oxidation to acetic acid

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
:::

:::result #res-main
yield: 63%
:::

:::molecule #mol-main
smiles: CCO
:::

Water marker: :chem[H2O]
Yield: @res-main.yield
`;

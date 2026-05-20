export interface DomainTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  feature: string;
  content: string;
}

export interface DomainTemplateSummary {
  id: string;
  title: string;
  category: string;
  description: string;
  feature: string;
}

const trimTemplate = (content: string): string => `${content.trim()}\n`;

const templates = [
  {
    id: "organic-synthesis/suzuki-screen",
    title: "Suzuki Screen",
    category: "organic-synthesis",
    description: "Reaction screen with material stoichiometry, condition variation, TLC, and result linkage.",
    feature: "condition-varies with reusable TLC lane notes",
    content: trimTemplate(`
---
id: suzuki-screen
title: Suzuki screen
date: 2026-05-20
primary_reaction: rxn-main
primary_result: res-var1
governance:
  confidentiality: internal
  review_status: human_reviewed
  allowed_uses: [rag, eval, regression, audit]
---

:::chemd #mol-aryl-bromide
name: aryl bromide
smiles: Brc1ccccc1
:::

:::chemd #mol-boronic-acid
name: boronic acid
smiles: OB(O)c1ccccc1
:::

:::chemd #mol-product
name: biaryl product
smiles: c1ccc(-c2ccccc2)cc1
:::

:::material #mat-aryl-bromide
molecule: @mol-aryl-bromide
purity: 98 %
:::

:::chemd #rxn-main
name: Suzuki coupling
rxn_smiles: Brc1ccccc1.OB(O)c1ccccc1>>c1ccc(-c2ccccc2)cc1
reactant: @mat-aryl-bromide | 1.0 mmol | 1.0 eq | limiting=true
reactant: @mol-boronic-acid | 1.5 eq
product: @mol-product
solvent: dioxane/water
temperature: r.t. -> 80 C over 30 min
time: overnight
:::

:::result #res-var1
reaction: @rxn-main
product: @mol-product
status: success
yield: 72 %
conversion: 90 %
:::

:::condition-varies #cv-screen
standard: @rxn-main
factor: base | baseline=K2CO3
outcome: yield | baseline=72 %

attempt: var1
base: Cs2CO3
yield: 72 %
:::

:::sample #sample-crude
name: crude sample
ref: @rxn-main
:::

:::analysis #ana-tlc
type: tlc
ref: @sample-crude
lane: sm | source=@mat-aryl-bromide
spot: 0.62 sm
lane: rxn | source=@sample-crude
spot: sm
spot: 0.31 ^3(4) prod
result: product spot increased
:::

:::template tlc-lane-note
params: lane: string | sample: ref<sample>

TLC lane @param.lane records @param.sample.
:::

:::use tlc-lane-note
lane: rxn
sample: sample-crude
:::
`)
  },
  {
    id: "organic-synthesis/amide-coupling",
    title: "Amide Coupling",
    category: "organic-synthesis",
    description: "Procedure-first synthesis template with explicit step schema parameters.",
    feature: "procedure step graph",
    content: trimTemplate(`
---
id: amide-coupling
title: Amide coupling
date: 2026-05-20
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #acid
name: carboxylic acid
smiles: CC(=O)O
:::

:::chemd #amine
name: amine
smiles: CN
:::

:::chemd #amide
name: amide
smiles: CC(=O)NC
:::

:::chemd #rxn-main
name: amide coupling
reactant: @acid | 1.0 mmol | 1.0 eq | limiting=true
reactant: @amine | 1.2 eq
product: @amide
solvent: DMF
temperature: r.t.
time: 2 h
:::

:::procedure #proc-main
ref: @rxn-main
step: charge | id=s-charge | inputs=@acid,@amine | solvent=DMF | vessel=vial
step: mix | id=s-mix | duration=2 h | dependsOn=s-charge
step: sample | id=s-sample | outputs=@sample-crude | dependsOn=s-mix
:::

:::sample #sample-crude
name: crude aliquot
ref: @rxn-main
:::

:::result #res-main
reaction: @rxn-main
product: @amide
status: success
yield: 65 %
:::
`)
  },
  {
    id: "organic-synthesis/oxidation",
    title: "Oxidation",
    category: "organic-synthesis",
    description: "Oxidation record with NMR-style structured peaks.",
    feature: "NMR spectrum and peak records",
    content: trimTemplate(`
---
id: oxidation-template
title: Oxidation
date: 2026-05-20
primary_reaction: rxn-main
primary_analysis: ana-nmr
---

:::chemd #alcohol
name: alcohol
smiles: CCO
:::

:::chemd #aldehyde
name: aldehyde
smiles: CC=O
:::

:::chemd #rxn-main
name: oxidation
reactant: @alcohol | 1.0 mmol | 1.0 eq | limiting=true
product: @aldehyde
solvent: DCM
temperature: 0 C -> r.t. over 30 min
time: 1 h
:::

:::sample #sample-product
name: product sample
ref: @rxn-main
:::

:::analysis #ana-nmr
type: nmr
ref: @sample-product
spectrum: 1H NMR (400 MHz, CDCl3)
peak: 9.78 (s, 1H, CHO)
peak: 2.21 (s, 3H, CH3)
:::
`)
  },
  {
    id: "organic-synthesis/reduction",
    title: "Reduction",
    category: "organic-synthesis",
    description: "Reduction record with batch and sample lineage.",
    feature: "batch/sample lineage",
    content: trimTemplate(`
---
id: reduction-template
title: Reduction
date: 2026-05-20
primary_reaction: rxn-main
primary_sample: sample-nmr
---

:::chemd #ketone
name: ketone
smiles: CC(=O)C
:::

:::chemd #alcohol
name: alcohol product
smiles: CC(O)C
:::

:::chemd #rxn-main
name: reduction
reactant: @ketone | 1.0 mmol | 1.0 eq | limiting=true
product: @alcohol
solvent: MeOH
temperature: 0 C
time: 30 min
:::

:::batch #batch-crude
source: @rxn-main
molecule: @alcohol
state: crude
mass: 120 mg
purity: 84 %
:::

:::sample #sample-nmr
name: NMR sample
ref: @batch-crude
:::
`)
  },
  {
    id: "polymer/polymerization",
    title: "Polymerization",
    category: "polymer",
    description: "Polymerization record with conversion and observation event.",
    feature: "observation event linkage",
    content: trimTemplate(`
---
id: polymerization-template
title: Polymerization
date: 2026-05-20
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #monomer
name: monomer
smiles: C=C
:::

:::chemd #rxn-main
name: polymerization
reactant: @monomer | 5.0 mmol | 1.0 eq | limiting=true
product: polymer
temperature: 60 C
time: 4 h
:::

:::procedure #proc-main
ref: @rxn-main
step: charge | id=s-charge | inputs=@monomer | vessel=tube
step: heat | id=s-heat | temperature=60 C | duration=4 h | dependsOn=s-charge
:::

:::observation #obs-main
ref: @rxn-main
event: phase_change | linkedStep=s-heat | severity=info
:::

:::result #res-main
reaction: @rxn-main
status: success
conversion: 82 %
:::
`)
  },
  {
    id: "analytical/nmr-only",
    title: "NMR Only",
    category: "analytical",
    description: "Analytical record for a sample with only NMR evidence.",
    feature: "analysis-only sample evidence",
    content: trimTemplate(`
---
id: nmr-only-template
title: NMR only
date: 2026-05-20
primary_sample: sample-main
primary_analysis: ana-nmr
---

:::sample #sample-main
name: submitted sample
notes: isolated material
:::

:::analysis #ana-nmr
type: nmr
ref: @sample-main
spectrum: 1H NMR (400 MHz, CDCl3)
peak: 7.68-7.59 (m, 2H, ArCH)
peak: 4.51 (br. s, 1H, NCH2)
:::
`)
  },
  {
    id: "analytical/hplc-purity",
    title: "HPLC Purity",
    category: "analytical",
    description: "HPLC method/profile template with artifact linkage.",
    feature: "method artifact reference",
    content: trimTemplate(`
---
id: hplc-purity-template
title: HPLC purity
date: 2026-05-20
primary_sample: sample-main
primary_analysis: ana-hplc
---

:::sample #sample-main
name: HPLC sample
notes: diluted product sample
:::

:::artifact #method-hplc-a
kind: method
path: methods/hplc-a.json
notes: C18, water/acetonitrile gradient
:::

:::artifact #art-hplc
kind: chromatogram
ref: @sample-main
path: data/hplc/sample-main.pdf
:::

:::analysis #ana-hplc
type: hplc
ref: @sample-main
method: @method-hplc-a
artifact: @art-hplc
peak: 6.4 min (97 %, product)
result: purity 97 %
:::
`)
  },
  {
    id: "electrochemistry/electrochemical-reaction",
    title: "Electrochemical Reaction",
    category: "electrochemistry",
    description: "Reaction template with procedure parameters for an electrochemical setup.",
    feature: "procedure adapter/resource parameters",
    content: trimTemplate(`
---
id: electrochemical-reaction-template
title: Electrochemical reaction
date: 2026-05-20
primary_reaction: rxn-main
---

:::chemd #substrate
name: substrate
smiles: CCO
:::

:::chemd #product
name: product
smiles: CC=O
:::

:::chemd #rxn-main
name: electrochemical oxidation
reactant: @substrate | 1.0 mmol | 1.0 eq | limiting=true
product: @product
solvent: MeCN
time: 2 h
:::

:::procedure #proc-main
ref: @rxn-main
step: charge | id=s-charge | inputs=@substrate | solvent=MeCN | vessel=cell
step: mix | id=s-electrolysis | duration=2 h | adapter=electrochemistry | resource=cell-a | dependsOn=s-charge
:::
`)
  },
  {
    id: "photochemistry/photoredox",
    title: "Photoredox",
    category: "photochemistry",
    description: "Photoredox reaction template with explicit light setup in procedure params.",
    feature: "procedure free parameter captured by step schema",
    content: trimTemplate(`
---
id: photoredox-template
title: Photoredox
date: 2026-05-20
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #substrate
name: substrate
smiles: C=C
:::

:::chemd #product
name: product
smiles: CCC
:::

:::chemd #rxn-main
name: photoredox reaction
reactant: @substrate | 0.5 mmol | 1.0 eq | limiting=true
product: @product
solvent: MeCN
atmosphere: nitrogen
temperature: r.t.
time: 16 h
:::

:::procedure #proc-main
ref: @rxn-main
step: charge | id=s-charge | inputs=@substrate | solvent=MeCN | vessel=sealed tube
step: mix | id=s-irradiate | duration=16 h | adapter=photoreactor | resource=blue-led | dependsOn=s-charge
:::

:::result #res-main
reaction: @rxn-main
product: @product
status: success
yield: 54 %
:::
`)
  }
] satisfies DomainTemplate[];

const catalog = new Map(templates.map((template) => [template.id, template]));

export const listDomainTemplates = (): DomainTemplateSummary[] =>
  templates.map(({ content: _content, ...summary }) => summary);

export const getDomainTemplate = (id: string): DomainTemplate | undefined =>
  catalog.get(id);

export const renderDomainTemplate = (id: string): string => {
  const template = getDomainTemplate(id);
  if (!template) {
    throw new Error(`Unknown Chemd domain template: ${id}`);
  }

  return template.content;
};

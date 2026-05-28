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
    description: "Reaction screen with material stoichiometry, condition screening, TLC, and result linkage.",
    feature: "program-first condition_screen declaration",
    content: trimTemplate(`
module suzuki_screen

meta {
  id: "suzuki-screen"
  title: "Suzuki screen"
  date: "2026-05-20"
  primary_reaction: @rxn_main
  primary_result: @res_var1
  tags: ["suzuki", "screen"]
}

molecule mol_aryl_bromide {
  name: "aryl bromide"
  smiles: "Brc1ccccc1"
}

molecule mol_boronic_acid {
  name: "boronic acid"
  smiles: "OB(O)c1ccccc1"
}

molecule mol_product {
  name: "biaryl product"
  smiles: "c1ccc(-c2ccccc2)cc1"
}

material mat_aryl_bromide {
  molecule: @mol_aryl_bromide
  purity: 98%
}

reaction rxn_main {
  name: "Suzuki coupling"
  reactants: [@mat_aryl_bromide, @mol_boronic_acid]
  products: [@mol_product]
  solvent: "dioxane/water"
  temperature: 80 C
  time: 16 h
}

result res_var1 for @rxn_main {
  product: @mol_product
  status: success
  yield: 72%
  conversion: 90%
}

condition_screen cv_screen for @rxn_main {
  standard: @rxn_main
  factor: [base]
  outcome: [yield]
  notes: "var1 uses Cs2CO3 and gives 72% yield"
}

sample sample_crude {
  name: "crude sample"
  derived_from: @rxn_main
}

analysis ana_tlc for @sample_crude {
  type: tlc
  ref: @sample_crude
  notes: "TLC lane rxn records product spot increase"
}
`)
  },
  {
    id: "organic-synthesis/amide-coupling",
    title: "Amide Coupling",
    category: "organic-synthesis",
    description: "Procedure-first synthesis template with explicit step schema parameters.",
    feature: "procedure step graph",
    content: trimTemplate(`
module amide_coupling

meta {
  id: "amide-coupling"
  title: "Amide coupling"
  date: "2026-05-20"
  primary_reaction: @rxn_main
  primary_result: @res_main
}

molecule acid {
  name: "carboxylic acid"
  smiles: "CC(=O)O"
}

molecule amine {
  name: "amine"
  smiles: "CN"
}

molecule amide {
  name: "amide"
  smiles: "CC(=O)NC"
}

reaction rxn_main {
  name: "amide coupling"
  reactants: [@acid, @amine]
  products: [@amide]
  solvent: "DMF"
  temperature: 25 C
  time: 2 h
}

procedure proc_main for @rxn_main {
  step charge = charge(inputs: [@acid, @amine])
  step mix = mix(duration: 2 h, depends_on: [charge])
  step sample = sample(outputs: [@sample_crude], depends_on: [mix])
}

sample sample_crude {
  name: "crude aliquot"
  derived_from: @rxn_main
}

result res_main for @rxn_main {
  product: @amide
  status: success
  yield: 65%
}
`)
  },
  {
    id: "organic-synthesis/oxidation",
    title: "Oxidation",
    category: "organic-synthesis",
    description: "Oxidation record with NMR-style analysis notes.",
    feature: "analysis evidence",
    content: trimTemplate(`
module oxidation_template

meta {
  id: "oxidation-template"
  title: "Oxidation"
  date: "2026-05-20"
  primary_reaction: @rxn_main
  primary_analysis: @ana_nmr
}

molecule alcohol {
  name: "alcohol"
  smiles: "CCO"
}

molecule aldehyde {
  name: "aldehyde"
  smiles: "CC=O"
}

reaction rxn_main {
  name: "oxidation"
  reactants: [@alcohol]
  products: [@aldehyde]
  solvent: "DCM"
  temperature: 25 C
  time: 1 h
}

sample sample_product {
  name: "product sample"
  derived_from: @rxn_main
}

analysis ana_nmr for @sample_product {
  type: nmr
  ref: @sample_product
  notes: "1H NMR shows aldehyde resonance at 9.78 ppm"
}
`)
  },
  {
    id: "organic-synthesis/reduction",
    title: "Reduction",
    category: "organic-synthesis",
    description: "Reduction record with batch and sample lineage.",
    feature: "batch/sample lineage",
    content: trimTemplate(`
module reduction_template

meta {
  id: "reduction-template"
  title: "Reduction"
  date: "2026-05-20"
  primary_reaction: @rxn_main
  primary_sample: @sample_nmr
}

molecule ketone {
  name: "ketone"
  smiles: "CC(=O)C"
}

molecule alcohol {
  name: "alcohol product"
  smiles: "CC(O)C"
}

reaction rxn_main {
  name: "reduction"
  reactants: [@ketone]
  products: [@alcohol]
  solvent: "MeOH"
  temperature: 0 C
  time: 30 min
}

batch batch_crude {
  source: @rxn_main
  molecule: @alcohol
  mass: 120 mg
  purity: 84%
}

sample sample_nmr {
  name: "NMR sample"
  batch: @batch_crude
}
`)
  },
  {
    id: "polymer/polymerization",
    title: "Polymerization",
    category: "polymer",
    description: "Polymerization record with conversion and observation notes.",
    feature: "observation linkage",
    content: trimTemplate(`
module polymerization_template

meta {
  id: "polymerization-template"
  title: "Polymerization"
  date: "2026-05-20"
  primary_reaction: @rxn_main
  primary_result: @res_main
}

molecule monomer {
  name: "monomer"
  smiles: "C=C"
}

reaction rxn_main {
  name: "polymerization"
  reactants: [@monomer]
  products: ["polymer"]
  temperature: 60 C
  time: 4 h
}

procedure proc_main for @rxn_main {
  step charge = charge(inputs: [@monomer])
  step heat = heat(temperature: 60 C, duration: 4 h, depends_on: [charge])
}

observation obs_main for @rxn_main {
  notes: "phase change observed during heating"
}

result res_main for @rxn_main {
  status: success
  conversion: 82%
}
`)
  },
  {
    id: "analytical/nmr-only",
    title: "NMR Only",
    category: "analytical",
    description: "Analytical record for a sample with only NMR evidence.",
    feature: "analysis-only sample evidence",
    content: trimTemplate(`
module nmr_only_template

meta {
  id: "nmr-only-template"
  title: "NMR only"
  date: "2026-05-20"
  primary_sample: @sample_main
  primary_analysis: @ana_nmr
}

sample sample_main {
  name: "submitted sample"
  notes: "isolated material"
}

analysis ana_nmr for @sample_main {
  type: nmr
  ref: @sample_main
  notes: "1H NMR evidence recorded"
}
`)
  },
  {
    id: "analytical/hplc-purity",
    title: "HPLC Purity",
    category: "analytical",
    description: "HPLC method/profile template with artifact linkage.",
    feature: "method artifact reference",
    content: trimTemplate(`
module hplc_purity_template

meta {
  id: "hplc-purity-template"
  title: "HPLC purity"
  date: "2026-05-20"
  primary_sample: @sample_main
  primary_analysis: @ana_hplc
}

sample sample_main {
  name: "HPLC sample"
  notes: "diluted product sample"
}

artifact method_hplc_a {
  kind: method
  path: "methods/hplc-a.json"
  notes: "C18, water/acetonitrile gradient"
}

artifact art_hplc {
  kind: chromatogram
  ref: @sample_main
  path: "data/hplc/sample-main.pdf"
}

analysis ana_hplc for @sample_main {
  type: hplc
  ref: @sample_main
  artifact: [@art_hplc]
  method: "C18 gradient"
  notes: "purity 97%"
}
`)
  },
  {
    id: "electrochemistry/electrochemical-reaction",
    title: "Electrochemical Reaction",
    category: "electrochemistry",
    description: "Reaction template with procedure parameters for an electrochemical setup.",
    feature: "procedure adapter/resource parameters",
    content: trimTemplate(`
module electrochemical_reaction_template

meta {
  id: "electrochemical-reaction-template"
  title: "Electrochemical reaction"
  date: "2026-05-20"
  primary_reaction: @rxn_main
}

molecule substrate {
  name: "substrate"
  smiles: "CCO"
}

molecule product {
  name: "product"
  smiles: "CC=O"
}

reaction rxn_main {
  name: "electrochemical oxidation"
  reactants: [@substrate]
  products: [@product]
  solvent: "MeCN"
  time: 2 h
}

procedure proc_main for @rxn_main {
  step charge = charge(inputs: [@substrate], solvent: "MeCN", vessel: "cell")
  step electrolysis = mix(duration: 2 h, adapter: electrochemistry, resource: cell_a, depends_on: [charge])
}
`)
  },
  {
    id: "photochemistry/photoredox",
    title: "Photoredox",
    category: "photochemistry",
    description: "Photoredox reaction template with explicit light setup in procedure params.",
    feature: "procedure free parameter captured by step schema",
    content: trimTemplate(`
module photoredox_template

meta {
  id: "photoredox-template"
  title: "Photoredox"
  date: "2026-05-20"
  primary_reaction: @rxn_main
  primary_result: @res_main
}

molecule substrate {
  name: "substrate"
  smiles: "C=C"
}

molecule product {
  name: "product"
  smiles: "CCC"
}

reaction rxn_main {
  name: "photoredox reaction"
  reactants: [@substrate]
  products: [@product]
  solvent: "MeCN"
  atmosphere: nitrogen
  temperature: 25 C
  time: 16 h
}

procedure proc_main for @rxn_main {
  step charge = charge(inputs: [@substrate], solvent: "MeCN", vessel: "sealed tube")
  step irradiate = mix(duration: 16 h, adapter: photoreactor, resource: blue_led, depends_on: [charge])
}

result res_main for @rxn_main {
  product: @product
  status: success
  yield: 54%
}
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
